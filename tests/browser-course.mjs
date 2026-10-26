// Fixed integration sample; exhaustive Playwright suites remain available separately.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {connect} from './browser_client.mjs';
import {presets as trees, exampleTrace as treeTrace} from '../assets/js/visualizaciones/bplus.js';
import {presets as hashes, exampleTrace as hashTrace} from '../assets/js/visualizaciones/hashing.js';
import {exampleTrace as planTrace, comparePlans} from '../assets/js/visualizaciones/query-plan-model.js';
import {presets as buffers, traceBuffer} from '../assets/js/visualizaciones/buffer-model.js';

const b = await connect(process.env.COURSE_DEBUG_URL);
const report = {checks: [], errors: []};
function check(name, actual, expected) {
  try { assert.deepEqual(actual, expected); report.checks.push({name, pass: true}); }
  catch (error) { report.checks.push({name, pass: false}); throw error; }
}
async function go(route, selector) {
  await b.cdp('Page.navigate', {url: new URL(route, process.env.COURSE_TEST_BASE).href});
  await b.waitFor(`document.querySelector(${JSON.stringify(selector)}) && [...document.querySelectorAll('[data-db-viz]')].every(e=>e.dataset.dbReady==='true')`);
}
async function select(root, label, value) {
  await b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(root)});const e=[...r.querySelectorAll('select')].find(e=>e.closest('label').textContent.includes(${JSON.stringify(label)}));e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function button(root, label) {
  const selector = await b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(root)});const e=[...r.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e || e.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});e.dataset.ciButton='active';return ${JSON.stringify(root)}+' [data-ci-button="active"]';})()`);
  try { await b.click(selector); }
  finally { await b.evaluate(`document.querySelector(${JSON.stringify(selector)})?.removeAttribute('data-ci-button')`); }
}
async function read(root, expression) {
  return b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(root)});return (${expression});})()`);
}
async function navigation(root, snapshot) {
  const final = await snapshot();
  await button(root, 'Anterior'); await button(root, 'Siguiente');
  check(root + ' back/next restores result', await snapshot(), final);
  for (const mode of ['dark', 'light']) {
    await b.theme(mode);
    check(root + ' theme preserves result ' + mode, await snapshot(), final);
  }
  await button(root, 'Reiniciar');
  check(root + ' reset', await read(root, "r.querySelector('.db-viz-status').textContent.startsWith('Paso 0 de')"), true);
}
try {
  await b.cdp('Emulation.setDeviceMetricsOverride', {width:1440, height:1000, deviceScaleFactor:1, mobile:false});
  await go('indices/bplus.html', '.db-bplus');
  const tree = '.db-bplus';
  await select(tree, 'Ejemplo', 'split'); await select(tree, 'Política de inserción', 'plain');
  const steps = treeTrace(trees.find(p=>p.id==='split'), false);
  const treeValues = () => read(tree, "[...r.querySelectorAll('.db-bplus-value')].map(e=>e.textContent)");
  for (const [i, step] of steps.entries()) {
    check(`B+ split/search/delete step ${i}`, await treeValues(), Object.values(step.tree.nodes).flatMap(p=>p.keys.length?p.keys.map(String):[p.leaf?'∅':'1 hijo']));
    check(`B+ transient guard ${i}`, await read(tree, "[...r.querySelectorAll('button')].find(e=>e.textContent==='Ejecutar desde el estado mostrado').disabled"), Boolean(step.transient));
    if (i < steps.length-1) await button(tree, 'Siguiente');
  }
  await navigation(tree, treeValues);

  await go('indices/hashing.html', '.db-hashing');
  const hash = '[data-hashing-mode="extendable"] .db-hashing';
  await select(hash, 'Ejemplo', 'alternancia');
  const hashState = () => read(hash, 'r.hashingStep.state');
  const trace = hashTrace(hashes.find(p=>p.id==='alternancia'));
  for (const [i, step] of trace.entries()) {
    check(`hash grow/shrink state ${i}`, await hashState(), step.state);
    check(`hash visible bucket keys ${i}`, await read(hash, "[...r.querySelectorAll('.db-hash-keys')].map(e=>e.textContent)"), Object.values(step.state.buckets).sort((a,b)=>step.state.directory.indexOf(a.id)-step.state.directory.indexOf(b.id)).map(b=>b.keys.length?b.keys.join(', '):'∅'));
    if (i < trace.length-1) await button(hash, 'Siguiente');
  }
  await navigation(hash, hashState);

  await go('procesamiento/reescritura.html', '.db-query-plan');
  const plan = '.db-query-plan';
  for (const id of ['valido', 'atributos']) {
    await select(plan, 'Ejemplo', id);
    const trace = planTrace(id);
    for (const [i, step] of trace.steps.entries()) {
      check(`plan ${id} classification ${i}`, await read(plan, 'r.dataset.classification'), step.classification);
      if (id === 'valido') {
        const expected = comparePlans(step.before, step.after, trace.data).difference.map(x=>[x.before,x.after,x.after-x.before]);
        check(`plan ${id} result multiplicities ${i}`, await read(plan, "[...r.querySelectorAll('.db-plan-results tbody tr')].map(r=>[...r.querySelectorAll('td')].slice(1).map(e=>Number(e.textContent)))"), expected);
      }
      if (i < trace.steps.length-1) await button(plan, 'Siguiente');
    }
    if (id==='atributos') check('invalid projection is visibly rejected', await read(plan, "!!r.querySelector('.is-invalid') && r.querySelector('.db-plan-results').textContent.includes('Sin resultado')"), true);
    await navigation(plan, () => read(plan, "r.querySelector('.db-plan-results').textContent"));
  }

  await go('almacenamiento/buffer-manager.html', '.db-buffer');
  const buffer = '.db-buffer';
  await select(buffer, 'Secuencia', 'belady'); await select(buffer, 'Cantidad de frames', '3');
  const frames = () => read(buffer, "[...r.querySelectorAll('.db-buffer-frame')].map(e=>({pageId:e.dataset.page||null,pinCount:Number(e.dataset.pins),dirty:e.dataset.dirty==='true'}))");
  for (const policy of ['FIFO', 'LRU']) {
    await select(buffer, 'Política', policy);
    const trace = traceBuffer(buffers.find(p=>p.id==='belady').operations, 3, policy);
    for (const [i, step] of trace.entries()) {
      check(`buffer ${policy} frames ${i}`, await frames(), step.state.frames.map(({pageId,pinCount,dirty})=>({pageId,pinCount,dirty})));
      check(`buffer ${policy} I/O ${i}`, await read(buffer, "Object.fromEntries([...r.querySelectorAll('[data-counter]')].map(e=>[e.dataset.counter,Number(e.textContent)]))"), Object.fromEntries(['reads','writes','hits','misses'].map(k=>[k,step.state[k]])));
      if (i < trace.length-1) await button(buffer, 'Siguiente');
    }
    check('second buffer instance remains independent', await b.evaluate("document.querySelectorAll('.db-buffer')[1].dataset.position"), '0');
    await navigation(buffer, frames);
  }
  check('no browser exceptions or resource failures', b.errors, []);
} catch (error) {
  report.errors.push(error.stack); process.exitCode = 1;
} finally {
  b.close(); mkdirSync('artifacts/platform', {recursive:true});
  writeFileSync('artifacts/platform/course-browser.json', JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({checks:report.checks.length, failed:report.checks.filter(c=>!c.pass).length, errors:report.errors}));
}
