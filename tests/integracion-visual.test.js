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
  ]) {
    const html = load(`docs/${name}`);
    assert.match(html, new RegExp(`data-db-viz="${component}"`), name);
    assert.match(html, /class="db-viz-fallback"/, name);
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
  ]) {
    assert.ok(existsSync(join(root, `docs/${path}`)), path);
    assert.equal(load(path), load(`docs/${path}`), path);
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
  const html = load('docs/indices/bplus.html');
  assert.match(load('docs/index.html'), /indices\/bplus\.html/);
  assert.match(html, /ref-ramakrishnan2003/);
  assert.match(html, /ref-silberschatz2020/);
  assert.match(html, /mathjax/i);
  assert.ok(!existsSync(join(root, 'docs/IMPLEMENTATION_STATUS.html')));
  const search = JSON.parse(load('docs/search.json'));
  assert.ok(search.some(entry => entry.href.split('#')[0] === 'indices/bplus.html'));
  assert.doesNotMatch(html, /clases_referencia|libros_referencia|guia_repaso_i2/);
});
