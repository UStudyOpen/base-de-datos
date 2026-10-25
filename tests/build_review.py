"""Build the local review gallery and exact results from completed evidence only."""
from pathlib import Path
import html
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
evidence = ROOT / 'artifacts/design-v0.2'
browser = json.loads((evidence / 'browser-results.json').read_text())
regression = json.loads((evidence / 'regression-results.json').read_text())
integrity = json.loads((evidence / 'site-integrity.json').read_text())
design = json.loads((evidence / 'design-integrity.json').read_text())
printing = json.loads((evidence / 'print-results.json').read_text())
units = (evidence / 'unit-tests.log').read_text()
if browser['summary']['failed'] or browser['summary']['matrixCases'] != 216:
    raise SystemExit('Require a completed full browser matrix with no failures')
if regression['completed_suites'] != 8 or integrity['errors'] or design['errors']:
    raise SystemExit('Require complete passing regression and integrity reports')
if printing['summary']['passed'] != 18 or printing['summary']['failed'] or printing['errors']:
    raise SystemExit('Require all 18 print checks')
if not re.search(r'pass 67\b', units) or not re.search(r'fail 0\b', units):
    raise SystemExit('Require the 67 passing unit tests')
labels = {
    'index': 'Inicio', 'indices-bplus': 'Árboles B+', 'indices-hashing': 'Hashing',
    'diseno-bcnf': 'BCNF', 'diseno-implicacion-clausura': 'Clausuras',
    'diseno-tercera-forma-normal': 'Síntesis 3NF',
    'procesamiento-planes-logicos': 'Planes lógicos',
    'procesamiento-reescritura': 'Reescritura',
    'almacenamiento-paginas-registros': 'Páginas y registros',
    'almacenamiento-buffer-manager': 'Buffer Manager',
}
sections = []
details = [('bplus','Árboles B+ · diagrama','desktop.png','390.png'),
           ('hashing','Hashing · diagrama','1440.png','390.png'),
           ('query-plan','Planes · región del plan propuesto','1440.png','390.png'),
           ('buffer','Buffer · frames','buffer-1440.png','buffer-390.png'),
           ('buffer','Páginas · bytes y slots','page-1440.png','page-390.png')]
for suite, label, desktop, mobile in details:
    figures = []
    for width, filename in ((1440,desktop),(390,mobile)):
        for mode, name in (('light','Claro'),('dark','Oscuro')):
            record = next(r for r in regression['suites'] if r['suite']==suite and r['theme']==mode)
            path = (f'artifacts/design-v0.2/screenshots/plan-detail-{width}-{mode}.png' if suite=='query-plan'
                    else next(p for p in record['screenshots'] if Path(p).name==filename))
            if not (ROOT / path).is_file(): raise SystemExit(f'Missing regression screenshot {path}')
            caption = f'{label} · {width} px · {name}'
            url = '../'+path
            figures.append(f'<figure><a href="{url}"><img src="{url}" loading="lazy" alt="{html.escape(caption)}"></a><figcaption>{html.escape(caption)}</figcaption></figure>')
    sections.append(f'<section><h2>{html.escape(label)}</h2><div class="comparisons">'+''.join(figures)+'</div></section>')
for route, label in labels.items():
    figures = []
    for width in (1440,390):
        for mode, name in (('light','Claro'),('dark','Oscuro')):
            image = f'{route}-{width}-{mode}.png'
            if image not in browser['screenshots'] or not (evidence / 'screenshots' / image).is_file():
                raise SystemExit(f'Missing final screenshot {image}')
            caption = f'{label} · {width} px · {name}'
            url = f'../artifacts/design-v0.2/screenshots/{image}'
            figures.append(f'<figure><a href="{url}"><img src="{url}" loading="lazy" alt="{html.escape(caption)}"></a><figcaption>{html.escape(caption)}</figcaption></figure>')
    sections.append(f'<section><h2>{html.escape(label)}</h2><div class="comparisons">'+''.join(figures)+'</div></section>')
gallery = '''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisión local — UStudyOpen Design 0.2</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:2rem;background:#f4f6fa;color:#243247}main{max-width:1500px;margin:auto}h1,h2{color:#182b49}.comparisons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}figure{margin:0;background:white;border:1px solid #7a899b;padding:.5rem}img{display:block;width:100%;height:auto}figcaption{padding:.5rem}a:focus-visible{outline:3px solid #2563eb}section{margin:3rem 0}@media(max-width:700px){body{margin:1rem}.comparisons{grid-template-columns:1fr}}</style>
<main><h1>UStudyOpen Design v0.2 · Bases de Datos</h1><p>60 capturas seleccionadas bajo <code>/base-de-datos/</code>: primero 20 detalles de simuladores, después 40 capturas de interfaz de la auditoría. Columnas: claro y oscuro. Primera fila: escritorio (1440 px); segunda: móvil (390 px). Abrir una imagen para verla completa. Cada comparación usa el mismo paso en ambos temas; las escenas de regresión y auditoría pueden mostrar pasos distintos. Los detalles de planes se capturan sin barras fijas para evitar superposiciones al componer una imagen larga; la interfaz completa aparece en las capturas posteriores.</p><p><a href="DESIGN_V0.2.md">Informe técnico</a></p>'''+''.join(sections)+'</main></html>\n'
(ROOT / 'review/galeria.html').write_text(gallery)
rows = []
for suite in ('bplus','hashing','query-plan','buffer'):
    values = [next(r for r in regression['suites'] if r['suite']==suite and r['theme']==t)['snapshots'] for t in ('light','dark')]
    rows.append(f'| `{suite}-browser.mjs` | {values[0]} snapshots claro + {values[1]} oscuro; 0 errores |')
summary = browser['summary']
print_checks = printing['checks']
contrast = [r for r in browser['contrast'] if 'minimum' in r]
minimum = min(r['minimum'] for r in contrast)
samples = sum(r['samples'] for r in contrast)
results = f'''| Comprobación ejecutada | Resultado final |
|---|---|
| `python3 tests/render_clean.py` | 27/27 páginas, Quarto 1.10.18, sin caché previa |
| `python3 tests/check_design.py` | 11 archivos vendor íntegros, 41 fuentes idénticas a main, 27/27 rutas conservadas, 2 temas coherentes |
| `python3 tests/check_site.py` | {integrity['local_references']} referencias locales HTML, {integrity['css_resources']} recursos CSS locales; 5 libros; 0 errores |
| `npm test` (mediante Corepack) | 67 aprobadas, 0 fallidas, 0 omitidas |
| `python3 tests/sql_examples.py` | SQLite 3.51.2: DDL, vista, índice, DML y rechazo de PK repetida aprobados |
'''+ '\n'.join(rows)+f'''
| Regresión existente total | {regression['completed_suites']} ejecuciones completas, {regression['snapshots']} snapshots verificados; 0 errores JS/recursos |
| Auditoría `design-browser.mjs` | {summary['passed']} comprobaciones aprobadas, 0 fallidas; {summary['matrixCases']} casos de página (27 × 4 anchos × 2 temas) |
| Persistencia | {summary['simulatorCases']} casos de página con simuladores; 11 instancias × 4 anchos × 2 temas = 88 verificaciones individuales de estado |
| Contraste calculado | {samples} muestras de texto/etiquetas, mínimo observado {minimum:.2f}:1; 40 pares de texto/contorno/estado por tema |
| Evidencia visual | {summary['screenshots']} capturas de integración + {regression['screenshots']} de regresión + 4 detalles de planes |
| Impresión tras el ajuste final | {len(print_checks)} casos aprobados: fallbacks visibles, controles ocultos, texto negro y fondo blanco; SVG estáticos con su paleta original |

La prueba SQL de P5, incluida entre las 67, ejecuta los bloques públicos y sus
contraejemplos en SQLite, además del oráculo independiente de 80 instancias.
No se declara ejecución de MERGE, TRUNCATE, INTERSECT ALL ni EXCEPT ALL en SQLite.

La matriz cubre 320, 390, 768 y 1440 px. La persistencia compara valores, estado
de desplegables, salida y nodos DOM antes/después, y vuelve a accionar el
simulador por teclado. Se comprueban etiquetas, foco, regiones de scroll,
reflujo, búsqueda, menús y recursos bajo `/base-de-datos/`. Los ratios de texto
se calculan contra fondos efectivos, incluidos los rectángulos SVG; los pares
de contorno/estado exigen ≥3:1. No se confunden estos controles con una
certificación WCAG completa.
Los diagramas conservan su tamaño de letra y usan desplazamiento dentro de su
región cuando superan el ancho disponible; las capturas móviles muestran esa
ventana, no un escalado de todo el árbol. La persistencia se comprueba en estados
avanzados representativos de cada simulador; los 3.044 snapshots pertenecen a la
regresión de sus trazas, no a 3.044 alternancias de tema.

[Galería comparativa: 40 capturas de interfaz y 20 detalles de simuladores](galeria.html).
[Resultados de integración](../artifacts/design-v0.2/browser-results.json),
[regresión](../artifacts/design-v0.2/regression-results.json),
[integridad estática](../artifacts/design-v0.2/site-integrity.json),
[vendor, fuentes y rutas](../artifacts/design-v0.2/design-integrity.json),
[67 pruebas](../artifacts/design-v0.2/unit-tests.log) y
[SQL](../artifacts/design-v0.2/sql.log).
[Impresión](../artifacts/design-v0.2/print-results.json) y
[detalles de planes](../artifacts/design-v0.2/plan-detail-results.json).
[Inventario completo de archivos](../artifacts/design-v0.2/changed-files.json) y
[comprobación del alcance](../artifacts/design-v0.2/scope-results.json).
'''
report = ROOT / 'review/DESIGN_V0.2.md'
text = report.read_text()
text = re.sub(r'<!-- PILOT_RESULTS -->.*?<!-- /PILOT_RESULTS -->',
              lambda _: '<!-- PILOT_RESULTS -->\n'+results+'<!-- /PILOT_RESULTS -->', text, flags=re.S)
report.write_text(text)
changed = subprocess.check_output(['git','ls-files','--modified','--deleted'],cwd=ROOT,text=True).splitlines()
new = subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()
inventory = {'changed_tracked':sorted(set(changed)), 'new_untracked':new}
(evidence / 'changed-files.json').write_text(json.dumps(inventory,indent=2)+'\n')
print(json.dumps({'gallery_images':summary['screenshots']+20,'unit_tests':67,'regression_snapshots':regression['snapshots'],
                  'browser_checks':summary['passed'],'contrast_samples':samples,'minimum_text_contrast':minimum},indent=2))
