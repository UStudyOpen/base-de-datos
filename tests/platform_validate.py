"""Portable checks for UStudyOpen courses. Python standard library only."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import argparse
import hashlib
import json
import re
import subprocess

from safe_paths import UnsafePath, checked_path, project_files

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', '.quarto', '_site', 'docs', 'artifacts', 'review', 'node_modules', '__pycache__',
        '.venv', '.cache', 'libros_referencia', 'clases_referencia'}
STATES = {'lista', 'en-desarrollo', 'proximamente'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def body(text):
    return re.sub(r'\A---\s*\n.*?\n---\s*\n', '', text, count=1, flags=re.S)


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path, self.ids, self.links, self.duplicates = path, set(), [], []
        self.themes, self.external, self.images = set(), set(), []
        self.main = self.title = self.lang = False
        self.native_toc = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'nav' and a.get('id') in ('TOC', 'TOC-body'):
            self.native_toc = a.get('id') == 'TOC-body'
        if 'id' in a:
            ident = a['id']
            native = (tag == 'link' and ident in {'quarto-bootstrap', 'quarto-text-highlighting-styles'}
                      and any(x in a.get('class', '') for x in ('quarto-color-alternate', 'quarto-color-scheme-extra')))
            native |= self.native_toc and ((tag == 'a' and ident.startswith('toc-')) or ident == 'toc-title')
            if ident in self.ids and not native:
                self.duplicates.append(ident)
            self.ids.add(ident)
        if tag == 'link' and a.get('id') == 'quarto-bootstrap' and a.get('data-mode'):
            self.themes.add(a['data-mode'])
        self.main |= tag == 'main'
        self.title |= tag == 'title'
        self.lang |= tag == 'html' and a.get('lang', '').startswith('es')
        if tag == 'img' and 'alt' not in a:
            self.images.append(a.get('src', ''))
        for key in ('href', 'src', 'poster'):
            if key in a:
                self.links.append(a[key])
                if tag == 'script' and urlsplit(a[key]).scheme:
                    self.external.add(a[key])

    def handle_endtag(self, tag):
        if tag == 'nav':
            self.native_toc = False


def source_checks(root, errors):
    for path in root.iterdir():
        if path.name.startswith(('.ustudyopen-sync-', '.ustudyopen-output-')):
            raise UnsafePath('Unfinished update; inspect recovery directory: ' + path.name)
    source_files = project_files(root, SKIP, exclude_env=True)
    course = json.loads(checked_path(root, 'course.yml').read_text())['course']  # JSON is a strict YAML subset.
    required = ['_quarto.yml', 'index.qmd', 'README.md', 'AGENTS.md', '.gitignore', '.quartoignore',
                'tests/render_clean.py', 'tests/post_render.py', '.github/workflows/validate.yml', '.github/workflows/deploy.yml']
    for name in required:
        if not (root / name).is_file():
            errors.append('missing file: ' + name)
    config = (root / '_quarto.yml').read_text()
    for text in ('type: website', 'output-dir: _site', 'ustudyopen-design-html:', 'course.yml', 'location: navbar'):
        if text not in config:
            errors.append('missing shared configuration: ' + text)
    qmd = {p.relative_to(root).as_posix() for p in source_files if p.suffix == '.qmd'}
    declared = [p['path'] for p in course['pages']]
    if len(declared) != len(set(declared)):
        errors.append('duplicate page in curriculum')
    planned = course.get('planned', [])
    if any(p.get('status') != 'proximamente' for p in planned):
        errors.append('planned topics require proximamente status')
    if qmd != set(declared):
        errors.append(f'curriculum/source mismatch: undeclared={sorted(qmd-set(declared))}, missing={sorted(set(declared)-qmd)}')
    statuses = []
    for page in course['pages']:
        path = checked_path(root, page['path'])
        if not path.is_file():
            continue
        text = path.read_text()
        front = text.split('---', 2)[1] if text.startswith('---\n') else ''
        status = re.search(r'^ustudy-status:\s*(\S+)\s*$', front, re.M)
        reviewed = re.search(r'^ustudy-reviewed:\s*(true|false)\s*$', front, re.M)
        value = status[1] if status else None
        review = bool(reviewed and reviewed[1] == 'true')
        if value not in STATES or not reviewed:
            errors.append('invalid status metadata: ' + page['path'])
        if value == 'lista' and not review:
            errors.append('ready page without review: ' + page['path'])
        if (value, review) != (page['status'], page['reviewed']):
            errors.append('curriculum metadata disagrees: ' + page['path'])
        if page.get('required', True):
            statuses.append(value == 'lista' and review)
    ready = bool(statuses) and all(statuses) and not any(p.get('required', True) for p in planned)
    if course['status'] != ('lista' if ready else 'en-desarrollo'):
        errors.append('incorrect aggregate course status')
    for manifest_name, base in [('design-vendor.json', root / '_extensions/ustudyopen-design'), ('platform-vendor.json', root)]:
        manifest = json.loads(checked_path(root, manifest_name).read_text())
        for name, sha in manifest['files'].items():
            path = checked_path(base, name)
            if not path.is_file() or path.is_symlink() or digest(path) != sha:
                errors.append(f'vendor integrity mismatch: {name}')
        if manifest_name == 'design-vendor.json':
            actual = {p.relative_to(base).as_posix() for p in project_files(base)}
            if actual != set(manifest['files']):
                errors.append('unlisted extension file')
    integrity = json.loads((root / 'tests/academic-integrity.json').read_text())
    for name, entry in integrity['files'].items():
        path = checked_path(root, name)
        if not path.is_file():
            errors.append('academic source removed: ' + name)
            continue
        content = body(path.read_text()).encode() if entry['kind'] == 'lesson-body' else path.read_bytes()
        # Explicit presentation-only patches are reversible to the original hash.
        # This preserves a proof of unchanged algorithms instead of repinning edited code.
        if entry.get('presentation_replacements'):
            text = content.decode()
            for replacement in reversed(entry['presentation_replacements']):
                if text.count(replacement['new']) != replacement['count']:
                    errors.append('unexpected presentation patch: ' + name)
                text = text.replace(replacement['new'], replacement['old'])
            content = text.encode()
        if hashlib.sha256(content).hexdigest() != entry['sha256']:
            errors.append('academic source changed: ' + name)
    # Check all declared action dependencies, including the central SHA lock.
    pins = json.loads((root / 'tests/action-pins.json').read_text())
    for path in (root / '.github/workflows').glob('*.yml'):
        text = path.read_text()
        if 'pull_request_target' in text or 'write-all' in text or 'contents: write' in text:
            errors.append('unsafe workflow permissions/event: ' + path.name)
        for action, sha in re.findall(r'uses:\s*([^\s@]+)@([^\s#]+)', text):
            if not re.fullmatch('[0-9a-f]{40}', sha) or pins.get(action, {}).get('sha') != sha:
                errors.append(f'unlocked action: {action}')
        if path.name == 'validate.yml' and any(p in text for p in ('pages: write', 'id-token: write', 'secrets.')):
            errors.append('validation must not have publication credentials')
        if path.name == 'deploy.yml':
            if re.search(r'^\s+pull_request:', text, re.M):
                errors.append('deployment activated prematurely')
            if re.search(r'^\s+push:', text, re.M) and course.get('pages_automation_approved') is not True:
                errors.append('automatic deployment requires explicit course approval metadata')
            for marker in ("vars.USO_PAGES_ENABLED == 'true'", 'github.ref == \'refs/heads/main\'', 'needs: build', 'environment:', 'github-pages'):
                if marker not in text:
                    errors.append('missing deployment guard: ' + marker)
    if (root / '.git').exists() and subprocess.run(['git', 'diff', '--check', '--', '.', ':!docs'], cwd=root, capture_output=True).returncode:
        errors.append('git diff --check failed')
    return {'pages': len(qmd), 'required_pages': len(statuses), 'reviewed_pages': sum(p['reviewed'] for p in course['pages']),
            'course_status': course['status'], 'planned_topics': len(planned), 'ready': ready}


def output_checks(root, errors):
    site = checked_path(root, '_site')
    site_files = project_files(site)
    pages = {}
    for path in (p for p in site_files if p.suffix == '.html'):
        parser = Page(path)
        parser.feed(path.read_text())
        pages[path.resolve()] = parser
        if parser.duplicates:
            errors.append(f'duplicate HTML IDs {path.relative_to(site)}: {parser.duplicates}')
        if parser.themes != {'light', 'dark'} or not (parser.main and parser.lang and parser.title):
            errors.append('invalid semantic structure/themes: ' + str(path.relative_to(site)))
        if parser.images:
            errors.append('images without alt: ' + str(path.relative_to(site)))
        html = path.read_text()
        if html.count('// Progressive enhancement only.') != 1 or 'uso-page-status' not in html:
            errors.append('missing/duplicate shared enhancement/status: ' + str(path.relative_to(site)))
        if re.search(r'(?:file:///|/home/[^/]+/|/tmp/[^/]+/)', html):
            errors.append('local machine path in HTML: ' + str(path.relative_to(site)))
    refs = 0
    for path, parser in pages.items():
        for link in parser.links:
            url = urlsplit(link)
            if url.scheme or url.netloc:
                continue
            refs += 1
            if url.path.startswith('/'):
                errors.append(f'domain absolute local URL: {link} in {path.relative_to(site)}')
                continue
            dest = (path.parent / unquote(url.path)).resolve() if url.path else path
            if dest.is_dir():
                dest /= 'index.html'
            if not dest.is_relative_to(site) or not dest.exists():
                errors.append(f'missing/escaping resource {link} in {path.relative_to(site)}')
            elif url.fragment and dest in pages and unquote(url.fragment) not in pages[dest].ids:
                errors.append(f'missing anchor {link} in {path.relative_to(site)}')
    course = json.loads((root / 'course.yml').read_text())['course']
    expected = {Path(p['path']).with_suffix('.html').as_posix() for p in course['pages']}
    actual = {p.relative_to(site).as_posix() for p in pages}
    if actual != expected:
        errors.append(f'HTML/source routes differ: missing={sorted(expected-actual)}, extra={sorted(actual-expected)}')
    baseline = json.loads((root / 'tests/route-baseline.json').read_text())
    for name, anchors in baseline.items():
        parser = pages.get(checked_path(site, name).resolve())
        if not parser or not set(anchors).issubset(parser.ids):
            errors.append('historical route/anchor missing: ' + name)
    for name in ('index.html', 'search.json', '.nojekyll'):
        if not (site / name).is_file():
            errors.append('essential output missing: ' + name)
    for directory in ('assets', 'scripts'):
        for source in (root / directory).rglob('*'):
            if source.is_file() and source.name != '.gitkeep':
                output = site / source.relative_to(root)
                if not output.is_file() or output.read_bytes() != source.read_bytes():
                    errors.append('course resource copy mismatch: ' + str(source.relative_to(root)))
    search = json.loads((site / 'search.json').read_text())
    indexed = {r['href'].split('#')[0] for r in search}
    if not expected.issubset(indexed):
        errors.append('search missing pages')
    forbidden = {'tests', 'review', 'artifacts', 'docs', '.github', '.git', 'node_modules', '__pycache__'}
    css_refs = 0
    for path in site_files:
        if any(p in forbidden or p == '.env' or p.startswith('.env.') for p in path.relative_to(site).parts):
            errors.append('unpublishable path: ' + str(path.relative_to(site)))
        if path.is_file() and (path.name in {'course.yml', 'AGENTS.md', 'README.md'} or path.suffix in {'.qmd', '.bib', '.py', '.pdf', '.zip', '.pem', '.key'}):
            errors.append('source/private file published: ' + str(path.relative_to(site)))
        if path.suffix == '.css':
            for ref in re.findall(r'url\(\s*[\'\"]?([^\)\'\"]+)', path.read_text()):
                u = urlsplit(ref)
                if u.scheme or u.netloc or not u.path:
                    continue
                css_refs += 1
                dest = (path.parent / unquote(u.path)).resolve()
                if not dest.is_relative_to(site) or not dest.is_file():
                    errors.append('missing CSS resource: ' + ref)
        if path.suffix == '.js' and 'site_libs' not in path.parts:
            for ref in re.findall(r'(?:from\s*|import\s*\()\s*[\'\"](\.[^\'\"]+)', path.read_text()):
                if not (path.parent / ref).resolve().is_file():
                    errors.append('missing JS import: ' + ref)
    return {'html_pages': len(pages), 'local_references': refs, 'css_resources': css_refs,
            'historical_routes': len(baseline), 'external_scripts': sorted(set().union(*(p.external for p in pages.values())))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-only', action='store_true')
    parser.add_argument('--release', action='store_true', help='check publishable output; does not claim academic review')
    args = parser.parse_args()
    errors = []
    result = {}
    try:
        result = source_checks(ROOT, errors)
        if not args.source_only:
            result.update(output_checks(ROOT, errors))
    except (OSError, ValueError, KeyError, TypeError) as error:
        errors.append('validation failed: ' + str(error))
    result['errors'] = errors
    try:
        evidence = checked_path(ROOT, 'artifacts/platform')
        evidence.mkdir(parents=True, exist_ok=True)
        destination = checked_path(ROOT, 'artifacts/platform/' + ('source.json' if args.source_only else 'validation.json'))
        destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    except (OSError, UnsafePath) as error:
        errors.append('cannot write validation evidence: ' + str(error))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(bool(errors))


if __name__ == '__main__':
    main()
