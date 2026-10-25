"""Remove the obsolete, unversioned ES6 polyfill injected by Quarto 1.10.18.

Modern browsers required by Quarto and the course simulators support ES6.
Only the exact generated tag is removed. Academic markup is untouched.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
tag = '<script src="https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js?features=es6"></script>'
count = 0
for path in (root / '_site').rglob('*.html'):
    text = path.read_text()
    if tag in text:
        count += 1
        path.write_text(text.replace(tag, ''))
print(f'UStudyOpen: removed obsolete polyfill from {count} generated pages')
