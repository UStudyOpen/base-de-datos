"""Verify vendored bytes, approved academic sources and all original public routes."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
errors = []
manifest = json.loads((ROOT / 'design-vendor.json').read_text())
extension = ROOT / '_extensions/ustudyopen-design'
actual = {str(p.relative_to(extension)): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in sorted(extension.rglob('*')) if p.is_file()}
if actual != manifest['files']:
    errors.append('vendored extension differs from pinned SHA-256 manifest')
from platform_validate import source_checks
source_checks(ROOT, errors)
protected = json.loads((ROOT / 'tests/academic-integrity.json').read_text())['files']
before = set(json.loads((ROOT / 'tests/route-baseline.json').read_text()))
after = {str(p.relative_to(ROOT / '_site')) for p in (ROOT / '_site').rglob('*.html')}
if before != after:
    errors.append(f'public routes changed: removed={sorted(before-after)}, added={sorted(after-before)}')
class Themes(HTMLParser):
    def __init__(self):
        super().__init__(); self.themes = {}; self.includes = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'link' and a.get('id') == 'quarto-bootstrap' and a.get('data-mode'):
            self.themes.setdefault(a['data-mode'], set()).add(Path(a['href']).name)
pairs = {}
for name in sorted(after):
    text = (ROOT / '_site' / name).read_text()
    page = Themes(); page.feed(text)
    pairs[name] = {mode: sorted(names) for mode, names in page.themes.items()}
    if set(page.themes) != {'light','dark'} or any(len(v) != 1 for v in page.themes.values()):
        errors.append(f'invalid theme pair: {name}')
    for required in ('quarto-color-scheme-toggle','uso-skip-link','quartoToggleColorScheme'):
        if required not in text: errors.append(f'missing {required}: {name}')
    if text.count('// Progressive enhancement only.') != 1:
        errors.append(f'shared enhancement included other than once: {name}')
if len({json.dumps(pair, sort_keys=True) for pair in pairs.values()}) != 1:
    errors.append('inconsistent theme pairs across course')
css = [p.name for p in (ROOT / '_site/site_libs/bootstrap').glob('bootstrap*.css') if p.name != 'bootstrap-icons.css']
if len(css) != 2: errors.append(f'expected two themes, got {len(css)}')
for path in (ROOT / '_site').rglob('*'):
    if any(p in path.relative_to(ROOT / '_site').parts for p in ('tests','artifacts','review','.git')):
        errors.append(f'private review/test artifact published: {path}')
result = {'vendor_version': manifest['version'], 'vendored_files': len(actual),
          'protected_sources_unchanged': len(protected), 'public_routes_preserved': len(after),
          'bootstrap_sheets': css, 'theme_pairs': pairs, 'errors': errors}
evidence = ROOT / 'artifacts/design-v0.2'; evidence.mkdir(parents=True, exist_ok=True)
(evidence / 'design-integrity.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k:v for k,v in result.items() if k != 'theme_pairs'}, indent=2))
raise SystemExit(bool(errors))
