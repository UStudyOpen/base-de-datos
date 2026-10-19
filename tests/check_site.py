"""Static output integrity checks; run after a complete quarto render."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import re, json, sys
ROOT=Path(__file__).resolve().parents[1]
DOCS=ROOT/'docs'
PREFIX='/open-study-base-de-datos/'
class Page(HTMLParser):
 def __init__(self,path):
  super().__init__();self.path=path;self.ids=set();self.duplicates=[];self.links=[];self.text=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:
   if a['id'] in self.ids:self.duplicates.append(a['id'])
   self.ids.add(a['id'])
  for k in ['href','src','poster']:
   if k in a:self.links.append(a[k])
 def handle_data(self,data): self.text.append(data)
pages={p.resolve():Page(p) for p in DOCS.rglob('*.html')}
errors=[]
for p,page in pages.items():
 page.feed(p.read_text())
 errors += [f'{p.relative_to(ROOT)}: duplicate id {x}' for x in page.duplicates]
for p,page in pages.items():
 for link in page.links:
  u=urlsplit(link)
  if u.scheme or u.netloc or link.startswith('javascript:'):continue
  path=unquote(u.path)
  if path.startswith(PREFIX):dest=DOCS/path[len(PREFIX):]
  elif path.startswith('/'):errors.append(f'{p.name}: domain-absolute local link {link}');continue
  else:dest=(p.parent/path) if path else p
  if dest.is_dir():dest=dest/'index.html'
  dest=dest.resolve()
  if not dest.exists():errors.append(f'{p.relative_to(ROOT)}: missing {link}');continue
  fragment=unquote(u.fragment)
  if fragment and dest in pages and fragment not in pages[dest].ids:errors.append(f'{p.relative_to(ROOT)}: missing fragment {link}')
# Check generated references and source math delimiters outside fenced code.
allowed={'arenas2022','abiteboul1995','garciamolina2009','silberschatz2020','ramakrishnan2003'}
keys=set(re.findall(r'@book\{([^,]+)',(ROOT/'references.bib').read_text()))
if keys!=allowed or len(re.findall(r'^@', (ROOT/'references.bib').read_text(),re.M))!=5:errors.append('Bibliography must contain exactly the five authorized books')
for p in ROOT.rglob('*.qmd'):
 if '.quarto' in p.parts:continue
 s=p.read_text();clean=re.sub(r'```.*?```','',s,flags=re.S)
 if re.search(r'\\\(|\\\)|\\\[|\\\]',clean):errors.append(f'{p.name}: non-dollar math delimiters')
 if len(re.findall(r'^\$\$$',clean,re.M))%2:errors.append(f'{p.name}: unmatched display delimiters')
 for line in clean.splitlines():
  if line.strip()!='$$' and len(re.findall(r'(?<!\\)\$',line))%2:errors.append(f'{p.name}: unmatched inline dollars: {line[:80]}')
 for key in re.findall(r'@([a-z]+\d{4})',s):
  if key not in allowed:errors.append(f'{p.name}: unknown citation {key}')
 dest=(DOCS/p.relative_to(ROOT)).with_suffix('.html').resolve()
 if dest not in pages:errors.append(f'{p.name}: missing output')
 else:
  for key in set(re.findall(r'@([a-z]+\d{4})',s)):
   if 'ref-'+key not in pages[dest].ids:errors.append(f'{p.name}: missing rendered citation {key}')
for p,page in pages.items():
 visible=' '.join(page.text)
 if '???' in visible or re.search(r'@(?:arenas|abiteboul|garciamolina|silberschatz|ramakrishnan)\d',visible):errors.append(f'{p.name}: unresolved reference')
for p in list((ROOT/'styles').glob('*.css'))+list((ROOT/'assets').rglob('*')):
 if p.is_file() and (not (DOCS/p.relative_to(ROOT)).exists() or p.read_bytes()!=(DOCS/p.relative_to(ROOT)).read_bytes()):errors.append(f'{p}: output copy mismatch')
for p in DOCS.rglob('*'):
 if p.suffix.lower() in ['.pdf','.zip'] or any(x in p.parts for x in ['FUENTES_BD','libros_referencia','clases_referencia','tests']):errors.append(f'Private/unpublished resource copied: {p}')
for p in (DOCS/'assets/js/visualizaciones').glob('*.js'):
 for rel in re.findall(r"(?:from\s*|import\s*\()\s*['\"](\.[^'\"]+)",p.read_text()):
  if not (p.parent/rel).exists():errors.append(f'{p.name}: missing import {rel}')
if not (DOCS/'.nojekyll').is_file():errors.append('Missing .nojekyll')
initial=['index.html']+[f'{d}/{n}.html' for d,names in {'fundamentos':['sistemas-rdbms','modelo-relacional','relaciones-nombradas'],'teoria-consultas':['algebra-relacional','equivalencia-patrones','joins-operadores','logica-primer-orden'],'sql':['ddl-dml','consultas-basicas','subconsultas','agregacion','funciones-filtros'],'nulos':['null-tres-valores','informacion-incompleta','outer-joins'],'diseno':['dependencias-llaves','implicacion-clausura','descomposiciones']}.items() for n in names]
for p in initial:
 if not (DOCS/p).exists():errors.append(f'Original route missing: {p}')
search=json.loads((DOCS/'search.json').read_text())
for dest in ['diseno/bcnf.html','diseno/tercera-forma-normal.html']:
 if not any(r.get('href','').split('#')[0]==dest for r in search):errors.append('Missing search entry '+dest)
print(json.dumps({'pages':len(pages),'original_routes':len(initial),'bibliography_keys':sorted(keys),'errors':errors},indent=2,ensure_ascii=False))
sys.exit(bool(errors))
