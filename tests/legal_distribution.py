"""Reproducible notices for source, installed extension, vendor and HTML channels.

Only the disposable _site/legal directory and generated HTML are written.
Never reads or changes historical docs. All paths reject symlink components.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import tempfile

from safe_paths import checked_path, project_files, replace_directory

EXTENSION = '_extensions/ustudyopen-design'
DOCUMENTS = ('LICENSE', 'LICENSING.md', 'THIRD-PARTY-NOTICES.md')
MARKER = 'class="uso-legal-notice text-center small py-2"'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bundle(root):
    """Explicit allowlist: no source code, arbitrary directories or private data."""
    files = {}
    for prefix, base in [('', root), ('extension/', checked_path(root, EXTENSION))]:
        for name in DOCUMENTS:
            files[prefix + name] = checked_path(base, name)
        licenses = checked_path(base, 'LICENSES')
        for path in project_files(licenses):
            files[prefix + 'LICENSES/' + path.relative_to(licenses).as_posix()] = path
    files['extension/PROVENANCE.md'] = checked_path(root, EXTENSION + '/PROVENANCE.md')
    # Managed licenses alongside the exact tools/workflows copied by sync_course.
    for target, local, central in [('platform/LICENSE-tools.txt', 'tests/LICENSE-platform.txt', 'tooling/LICENSE'),
                                   ('platform/LICENSE-workflows.txt', '.github/workflows/LICENSE-platform.txt', 'workflows/LICENSE')]:
        path = checked_path(root, local)
        files[target] = path if path.is_file() else checked_path(root, central)
    for path in files.values():
        if not path.is_file():
            raise ValueError('Missing legal source: ' + str(path.relative_to(root)))
    return files


def source_checks(root, errors):
    try:
        files = bundle(root)
        for base in [root, checked_path(root, EXTENSION)]:
            manifest = json.loads(checked_path(base, 'LICENSES/upstream.json').read_text())
            if not manifest:
                errors.append('empty upstream license inventory')
            for name, entry in manifest.items():
                path = checked_path(base, 'LICENSES/' + name)
                if not path.is_file() or digest(path) != entry['sha256']:
                    errors.append('upstream license integrity mismatch: ' + name)
            for name in ('fuse-6.6.2.txt', 'mathjax-4.1.3.txt'):
                if manifest.get(name, {}).get('license') != 'Apache-2.0':
                    errors.append('missing Apache-2.0 exception: ' + name)
        course = checked_path(root, 'course.yml')
        if course.exists():
            metadata = json.loads(course.read_text())['course']
            # A new course chooses its license; the template does not impose MIT.
            if not metadata.get('license'):
                errors.append('course must declare its academic license or pending decision')
            if metadata['license'] == 'CC-BY-NC-4.0' and not checked_path(root, 'LICENSES/CC-BY-NC-4.0.txt').is_file():
                errors.append('missing full academic legal code')
        return len(files)
    except (OSError, ValueError, KeyError, TypeError) as error:
        errors.append('legal source validation: ' + str(error))
        return 0


def output_checks(root, errors):
    try:
        files = bundle(root)
        site = checked_path(root, '_site')
        legal = checked_path(site, 'legal')
        expected = {name: digest(path) for name, path in files.items()}
        actual = json.loads(checked_path(legal, 'manifest.json').read_text())
        if actual != expected:
            errors.append('legal output manifest differs from source')
        for name, sha in expected.items():
            path = checked_path(legal, name)
            if not path.is_file() or digest(path) != sha:
                errors.append('legal output missing/changed: ' + name)
        if not checked_path(legal, 'index.txt').is_file():
            errors.append('legal index missing')
        for page in (p for p in project_files(site) if p.suffix == '.html'):
            text = page.read_text()
            href = os.path.relpath(legal / 'index.txt', page.parent).replace(os.sep, '/')
            if text.count(MARKER) != 1 or f'href="{href}"' not in text:
                errors.append('legal link missing/duplicate: ' + page.relative_to(site).as_posix())
        return len(files)
    except (OSError, ValueError, KeyError, TypeError) as error:
        errors.append('legal output validation: ' + str(error))
        return 0


def prepare(root):
    root = Path(root)
    site = checked_path(root, '_site')
    pages = [p for p in project_files(site) if p.suffix == '.html']
    errors = []
    source_checks(root, errors)
    if errors:
        raise ValueError('; '.join(errors))
    files = bundle(root)
    # Build first, then replace only disposable legal output; safe_paths preserves
    # a previous directory on failed promotion, as for an entire course build.
    with tempfile.TemporaryDirectory(prefix='ustudyopen-legal-') as temp:
        output = Path(temp) / 'legal'
        output.mkdir()
        manifest = {}
        for name, source in sorted(files.items()):
            target = checked_path(output, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())
            manifest[name] = digest(target)
        (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (output / 'index.txt').write_text('Licencias y avisos / Licenses and notices\n\n'
                                        'Alcance: LICENSING.md\nTerceros: THIRD-PARTY-NOTICES.md\n'
                                        'Extensión: extension/LICENSING.md\n\n'
                                        + '\n'.join(sorted(manifest)) + '\n')
        replace_directory(output, site, 'legal')
    for page in pages:
        text = page.read_text()
        href = os.path.relpath(site / 'legal/index.txt', page.parent).replace(os.sep, '/')
        notice = f'<div {MARKER}><a href="{href}">Licencias y avisos</a></div>'
        text = re.sub(r'<div class="uso-legal-notice text-center small py-2">.*?</div>\n?', '', text)
        if '</body>' not in text:
            raise ValueError('Generated HTML has no body: ' + page.name)
        page.write_text(text.replace('</body>', notice + '\n</body>'))
    print(f'UStudyOpen: packaged {len(files)} legal sources for {len(pages)} pages')
