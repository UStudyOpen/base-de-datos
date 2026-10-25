import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {presets,exampleTrace,staticPreset} from '../assets/js/visualizaciones/hashing.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const base=process.env.HASHING_TEST_URL??'http://127.0.0.1:8765/open-study-base-de-datos/docs/indices/hashing.html';
const screenshots=mkdtempSync(join(process.env.DB_BROWSER_ARTIFACTS??tmpdir(),'openstudy-hashing-browser-'));
let checked=0;const errors=[],failed=[];
const context=await browser.newContext({colorScheme:process.env.DB_TEST_THEME??'light',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning' || (m.type()==='error' && !m.text().includes('404')))errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400 && !r.url().endsWith('/favicon.ico'))failed.push([r.status(),r.url()]);});
await page.goto(base);await page.locator('[data-db-ready="true"]').nth(1).waitFor();
const staticRoot=page.locator('[data-hashing-mode="static"] .db-hashing'),ext=page.locator('[data-hashing-mode="extendable"] .db-hashing').first();
const button=(root,name)=>root.getByRole('button',{name,exact:true});
const svg=root=>root.locator('svg').evaluate(e=>e.outerHTML);
async function compare(root,step,i,total) {
  const actual=await root.evaluate(e=>({state:e.hashingStep.state,action:e.dataset.action,transient:e.hashingStep.transient}));
  assert.deepEqual(actual.state,step.state);assert.equal(actual.action,step.action);assert.equal(actual.transient,step.transient);
  const expected=step.state.kind==='static'?step.state.buckets.flat().map(p=>p.length?p.join(', '):'∅'):Object.values(step.state.buckets).sort((a,b)=>step.state.directory.indexOf(a.id)-step.state.directory.indexOf(b.id)).map(b=>b.keys.length?b.keys.join(', '):'∅');
  assert.deepEqual(await root.locator('.db-hash-keys').allTextContents(),expected);
  if(step.state.kind==='extendable') {
    assert.equal(await root.locator('.db-hash-bucket').count(),Object.keys(step.state.buckets).length);
    assert.deepEqual(await root.locator('.db-hash-ref').evaluateAll(rows=>rows.map(r=>r.dataset.target)),step.state.directory);
    assert.equal(await button(root,'Ejecutar desde el estado mostrado').isDisabled(),step.transient);
  }
  assert.match(await root.locator('.db-viz-status').innerText(),new RegExp(`Paso ${i} de ${total-1}`));
  assert.equal(await root.locator('svg').getAttribute('viewBox')!==null,true);assert.ok(!/NaN|Infinity/.test(await svg(root)));checked++;
}
for(const N of [4,5])for(const query of ['all','28','17','10','33']) {
  await staticRoot.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption(String(N));
  await staticRoot.getByRole('combobox',{name:'Recorrido',exact:true}).selectOption(query);
  const steps=exampleTrace(staticPreset(N,query));
  for(let i=0;i<steps.length;i++){await compare(staticRoot,steps[i],i,steps.length);if(i<steps.length-1)await button(staticRoot,'Siguiente').click();}
}
for(const preset of presets) {
  await ext.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption(preset.id);const steps=exampleTrace(preset);
  const initial=await svg(ext);
  for(let i=0;i<steps.length;i++) {
    await compare(ext,steps[i],i,steps.length);
    if(i<steps.length-1)await button(ext,'Siguiente').click();
  }
  if(steps.length>1) {
    const final=await svg(ext);await button(ext,'Anterior').click();await button(ext,'Siguiente').click();assert.equal(await svg(ext),final);
    await button(ext,'Reiniciar').click();assert.equal(await svg(ext),initial);
  }
}
// Custom operations create a timeline from exactly the displayed stable state.
await ext.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption('vacio');
async function finish(){while(!await button(ext,'Siguiente').isDisabled())await button(ext,'Siguiente').click();}
async function custom(op,k){await ext.getByRole('combobox',{name:'Operación nueva',exact:true}).selectOption(op);await ext.getByLabel('Clave entera (0–65535)').fill(String(k));await button(ext,'Ejecutar desde el estado mostrado').click();}
for(const k of [0,8,16]){await custom('insert',k);await finish();}
const final=await svg(ext);
for(const bad of ['','-1','1.2','1e2','65536','NaN']) {await custom('insert',bad);assert.ok(await ext.locator('[role="alert"]').innerText());assert.equal(await svg(ext),final);}
await custom('insert',16);assert.match(await ext.locator('[role="alert"]').innerText(),/duplicada/);assert.equal(await svg(ext),final);
await custom('search',8);await finish();assert.match(await ext.locator('.db-viz-status + p').innerText(),/encontrada/);
await custom('search',24);await finish();assert.match(await ext.locator('.db-viz-status + p').innerText(),/ausente/);
await custom('remove',99);await finish();assert.match(await ext.locator('.db-viz-status + p').innerText(),/no existe/);
await ext.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption('vacio');
for(const k of [0,256]){await custom('insert',k);await finish();}
const limited=await svg(ext);await custom('insert',512);assert.match(await ext.locator('[role="alert"]').innerText(),/profundidad máxima/);assert.equal(await svg(ext),limited);
await ext.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption('eliminaciones');await finish();
await ext.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption('inserciones');await finish();
await staticRoot.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption('4');await staticRoot.getByRole('combobox',{name:'Recorrido',exact:true}).selectOption('all');
const staticInitial=await svg(staticRoot);await button(ext,'Anterior').click();assert.equal(await svg(staticRoot),staticInitial);
// Responsive, legibility, local scroll and keyboard at all required widths.
for(const width of [320,390,768,1024,1440]) {
  await page.setViewportSize({width,height:1000});await ext.scrollIntoViewIfNeeded();
  const metrics=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(metrics.doc<=metrics.width+1,JSON.stringify(metrics));
  for(const root of [staticRoot,ext]) {
    const region=root.locator('.db-hash-scroll');await region.focus();
    assert.equal(await region.evaluate(e=>document.activeElement===e),true);
    assert.equal(await root.locator('.db-hash-value').first().evaluate(e=>getComputedStyle(e).fontSize),'15px');
    await region.press('ArrowRight');
  }
  await page.screenshot({path:join(screenshots,`${width}.png`),fullPage:false});
}
await page.setViewportSize({width:1440,height:1000});
// Keyboard can focus controls, and regions have visible outlines.
await button(ext,'Reiniciar').focus();await page.keyboard.press('Enter');assert.equal(await ext.getAttribute('data-position'),'0');
await ext.locator('.db-hash-scroll').focus();assert.notEqual(await ext.locator('.db-hash-scroll').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
// Independent third instance; loader re-entry does not duplicate the first two.
await page.evaluate(async()=>{
 const source=document.querySelector('[data-hashing-mode="extendable"]'),copy=source.cloneNode(true);copy.removeAttribute('data-db-ready');copy.querySelector('.db-viz-interactive').remove();document.querySelector('main').append(copy);
 const {initialize}=await import(new URL('../assets/js/visualizaciones/index.js',location.href));await initialize();await initialize();
});
assert.equal(await page.locator('.db-hashing').count(),3);const first=await svg(ext);await button(page.locator('.db-hashing').nth(2),'Siguiente').click();assert.equal(await svg(ext),first);
// Print uses complete static alternatives.
await page.emulateMedia({media:'print'});
assert.equal(await page.locator('.db-viz-fallback').first().isVisible(),true);assert.equal(await staticRoot.isVisible(),false);
await page.emulateMedia({media:'screen'});
await page.waitForFunction(()=>document.querySelector('mjx-container'),{timeout:30000});
const nojs=await browser.newContext({javaScriptEnabled:false});const fallback=await nojs.newPage();await fallback.goto(base);
assert.equal(await fallback.locator('.db-viz-fallback').count(),2);assert.equal(await fallback.locator('.db-viz-fallback').nth(1).isVisible(),true);assert.match(await fallback.locator('.db-viz-fallback').nth(1).innerText(),/000 → A/);await nojs.close();
const broken=await browser.newContext();await broken.route('**/hashing.js',route=>route.abort());const failpage=await broken.newPage();await failpage.goto(base);assert.equal(await failpage.locator('.db-viz-fallback').first().isVisible(),true);await broken.close();
// Exact GitHub Pages prefix can be supplied by HASHING_TEST_URL; every own import remains relative.
assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
console.log(JSON.stringify({checkedSnapshots:checked,presets:presets.length,staticConfigurations:10,widths:[320,390,768,1024,1440],screenshots,errors,failed},null,2));
await browser.close();
