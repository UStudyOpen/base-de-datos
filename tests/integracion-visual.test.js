import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');

// These static integration tests supplement, but do not replace, a real-browser audit.
test('Rendered pages provide an intact static example and a relative module loader', () => {
  for (const [name, component] of [
    ['diseno/implicacion-clausura.html', 'clausuras'],
    ['diseno/bcnf.html', 'normalizacion'],
    ['diseno/tercera-forma-normal.html', 'normalizacion'],
    ['indices/bplus.html', 'bplus'],
    ['indices/hashing.html', 'hashing'],
    ['procesamiento/planes-logicos.html', 'query-plan'],
    ['procesamiento/reescritura.html', 'query-plan'],
    ['almacenamiento/paginas-registros.html', 'paginas'],
    ['almacenamiento/buffer-manager.html', 'buffer'],
  ]) {
    const html = load(`_site/${name}`);
    assert.match(html, new RegExp(`data-db-viz="${component}"`), name);
    assert.match(html, /class="[^"]*\bdb-viz-fallback\b[^"]*"/, name);
    assert.match(html, /type="module" src="\.\.\/assets\/js\/visualizaciones\/index\.js"/, name);
  }
});

test('Sources and deployable visualization resources are identical', () => {
  for (const path of [
    'assets/css/visualizaciones.css',
    'assets/js/visualizaciones/index.js',
    'assets/js/visualizaciones/core.js',
    'assets/js/visualizaciones/clausuras.js',
    'assets/js/visualizaciones/normalizacion.js',
    'assets/js/visualizaciones/bplus.js',
    'assets/js/visualizaciones/bplus-model.js',
    'assets/js/visualizaciones/hashing.js',
    'assets/js/visualizaciones/hashing-model.js',
    'assets/js/visualizaciones/query-plan-model.js',
    'assets/js/visualizaciones/query-plan.js',
    'assets/js/visualizaciones/buffer-model.js',
    'assets/js/visualizaciones/buffer.js',
    'assets/js/visualizaciones/paginas.js',
  ]) {
    assert.ok(existsSync(join(root, `_site/${path}`)), path);
    assert.equal(load(path), load(`_site/${path}`), path);
  }
});

test('No-JavaScript/print fallbacks remain available and enhanced duplicates are hidden', () => {
  const css = load('assets/css/visualizaciones.css');
  assert.match(css, /\.db-viz\[data-db-ready="true"\] > \.db-viz-fallback\s*\{\s*display:\s*none/);
  assert.match(css, /@media print\s*\{[\s\S]*?\.db-viz-fallback\s*\{\s*display:\s*block\s*!important/);
  const loader = load('assets/js/visualizaciones/index.js');
  assert.match(loader, /root\.dataset\.dbLoading/);
  assert.match(loader, /import\(new URL\(file, import\.meta\.url\)\)/);
  assert.doesNotMatch(loader, /['"]\/assets\//);
});

test('B+ is discoverable and the technical status stays outside the published site', () => {
  const html = load('_site/indices/bplus.html');
  assert.match(load('_site/index.html'), /indices\/bplus\.html/);
  assert.match(html, /ref-ramakrishnan2003/);
  assert.match(html, /ref-silberschatz2020/);
  assert.match(html, /mathjax/i);
  assert.ok(!existsSync(join(root, '_site/IMPLEMENTATION_STATUS.html')));
  const search = JSON.parse(load('_site/search.json'));
  assert.ok(search.some(entry => entry.href.split('#')[0] === 'indices/bplus.html'));
  assert.doesNotMatch(html, /clases_referencia|libros_referencia|guia_repaso_i2/);
});


test('Hashing provides two independent fallbacks, citations, navigation and search', () => {
  const html=load('_site/indices/hashing.html');
  assert.equal((html.match(/data-db-viz="hashing"/g)||[]).length,2);
  assert.match(html,/data-hashing-mode="static"/);assert.match(html,/data-hashing-mode="extendable"/);
  assert.match(html,/ref-ramakrishnan2003/);assert.match(html,/ref-silberschatz2020/);
  assert.match(html,/mathjax/i);assert.match(load('_site/index.html'),/indices\/hashing\.html/);
  assert.match(load('_site/indices/bplus.html'),/hashing\.html/);
  assert.ok(JSON.parse(load('_site/search.json')).some(x=>x.href.split('#')[0]==='indices/hashing.html'));
  assert.doesNotMatch(html,/clases_referencia|libros_referencia|guia_repaso_i2/);
});


test('P5 is linked, searchable, cited and independent of private teaching resources', () => {
  for(const name of ['planes-logicos','reescritura']) {
    const path=`procesamiento/${name}.html`,html=load(`_site/${path}`);
    assert.match(load('_site/index.html'),new RegExp(path));
    assert.match(html,/ref-ramakrishnan2003/);assert.match(html,/ref-garciamolina2009/);assert.match(html,/mathjax/i);
    assert.match(html,/Procesamiento de consultas/);
    assert.ok(JSON.parse(load('_site/search.json')).some(x=>x.href.split('#')[0]===path));
    assert.doesNotMatch(html,/clases_referencia|libros_referencia|guia_repaso_i2|Clase 16/);
  }
});

test('P6 has navigation, complete static traces, citations and three component roots',()=>{
  for(const name of ['paginas-registros','buffer-manager']) {
    const path=`almacenamiento/${name}.html`,html=load(`_site/${path}`);
    assert.match(load('_site/index.html'),new RegExp(path));
    assert.match(html,/ref-ramakrishnan2003/);assert.match(html,/ref-silberschatz2020/);assert.match(html,/ref-garciamolina2009/);
    assert.match(html,/Almacenamiento y organización física/);assert.match(html,/mathjax/i);
    assert.ok(JSON.parse(load('_site/search.json')).some(x=>x.href.split('#')[0]===path));
    assert.doesNotMatch(html,/clases_referencia|libros_referencia|guia_repaso_i2|Clase 12|Clase 13/);
  }
  const buffer=load('_site/almacenamiento/buffer-manager.html');assert.equal((buffer.match(/data-db-viz="buffer"/g)||[]).length,2);
  assert.match(buffer,/10760|7 lecturas/);assert.match(buffer,/pinCount/);assert.match(buffer,/bplus-buffer/);
  assert.match(load('_site/indices/bplus.html'),/almacenamiento\/buffer-manager.html#bplus-buffer/);
});
