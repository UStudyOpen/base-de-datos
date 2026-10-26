import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const screenshots=mkdtempSync(join(process.env.DB_BROWSER_ARTIFACTS??tmpdir(),'openstudy-bplus-browser-'));
import {presets,exampleTrace} from '../assets/js/visualizaciones/bplus.js';
// Optional browser regression suite; serve the rendered site first.
// PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE may select installed test tools.
const url=process.env.BPLUS_TEST_URL ?? 'http://127.0.0.1:8765/open-study-base-de-datos/docs/indices/bplus.html';
const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
const context=await browser.newContext({colorScheme:process.env.DB_TEST_THEME??'light',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage(); const errors=[],failed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)failed.push([r.status(),r.url()]);});
await page.goto(url); await page.locator('[data-db-ready="true"]').waitFor();
const root=page.locator('.db-bplus'), next=root.getByRole('button',{name:'Siguiente',exact:true}), previous=root.getByRole('button',{name:'Anterior',exact:true}), reset=root.getByRole('button',{name:'Reiniciar',exact:true}), submit=root.getByRole('button',{name:'Ejecutar desde el estado mostrado'});
const svg=()=>root.locator('svg').evaluate(e=>e.outerHTML);
const initial=await svg(); await next.click(); const one=await svg(); await next.click(); await previous.click(); assert.equal(await svg(),one); await reset.click(); assert.equal(await svg(),initial);
let checked=0;
for (const preset of presets) for (const policy of [false,true]) {
  await root.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption(preset.id);
  await root.getByRole('combobox',{name:'Política de inserción',exact:true}).selectOption(policy?'redistribute':'plain');
  const steps=exampleTrace(preset,policy);
  for (let i=0;i<steps.length;i++) {
    const state=steps[i]; const actual=await root.locator('.db-bplus-value').allTextContents();
    const expected=Object.values(state.tree.nodes).flatMap(p=>p.keys.length?p.keys.map(String):[p.leaf?'∅':'1 hijo']);
    assert.deepEqual(actual,expected,`${preset.id}, policy=${policy}, step ${i}`);
    assert.equal(await submit.isDisabled(),Boolean(state.transient));
    assert.ok(!/NaN|Infinity/.test(await svg()));
    assert.match(await root.locator('.db-viz-status').innerText(),new RegExp(`Paso ${i} de ${steps.length-1}`));
    checked++;
    if(i<steps.length-1) await next.click();
  }
  assert.ok(await next.isDisabled());
  if(preset.id==='inserciones' && !policy) await root.screenshot({path:join(screenshots,'desktop.png')});
  if(!await reset.isDisabled()) await reset.click(); assert.ok(await previous.isDisabled());
  console.log("preset",preset.id,policy,steps.length);
}
// New operations, invalid input, range and reuse of displayed stable state.
await root.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption('vacio');
async function run(op,key,upper) {
  await root.getByRole('combobox',{name:'Operación nueva',exact:true}).selectOption(op); await root.getByLabel('Clave entera / límite inferior').fill(String(key));
  if(upper!==undefined) await root.getByLabel('Límite superior del rango').fill(String(upper));
  await submit.click();
  while(!await next.isDisabled()) await next.click();
}
await run('insert',7); assert.match(await root.locator('.db-bplus-condition').innerText(),/1 claves/);
let before=await svg(); await run('insert',7); assert.match(await root.getByRole('alert').innerText(),/ya existe/); assert.equal(await svg(),before);
await run('insert','1e3'); assert.match(await root.getByRole('alert').innerText(),/entera/); assert.equal(await svg(),before);
await run('search',7); assert.match(await root.locator('.db-viz-status + p').innerText(),/se encontró 7/);
await run('range',0,10); assert.match(await root.locator('.db-viz-status + p').innerText(),/\[7\]/);
await run('remove',7); assert.match(await root.locator('.db-viz-status + p').innerText(),/vacío/);
await run('search',7); assert.match(await root.locator('.db-viz-status + p').innerText(),/no está almacenada/);
// Keyboard focus and usable horizontal scroll at narrow sizes.
await root.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption('eliminaciones');
for(const width of [320,390,768,1024,1440]) {
  await page.setViewportSize({width,height:1000});
  await root.getByRole('button',{name:'Centrar raíz',exact:true}).click();
  assert.ok(await root.evaluate(e=>{
    const region=e.querySelector('.db-bplus-scroll').getBoundingClientRect();
    const label=[...e.querySelectorAll('.db-bplus-label')].find(n=>n.textContent.includes('· raíz'));
    const card=label.parentNode.querySelector('rect').getBoundingClientRect();
    return card.left>=region.left && card.right<=region.right;
  }),'root is visible after centering');
  const dimensions=await root.evaluate(e=>({root:e.getBoundingClientRect().width,doc:document.documentElement.scrollWidth,viewport:innerWidth,svg:e.querySelector('svg').getBoundingClientRect().width,region:e.querySelector('.db-bplus-scroll').clientWidth,font:getComputedStyle(e.querySelector('.db-bplus-value')).fontSize}));
  assert.ok(dimensions.doc<=width+1,`page overflow ${width}: ${JSON.stringify(dimensions)}`);
  assert.equal(dimensions.font,'15px');
  if(width<768) assert.ok(dimensions.svg>dimensions.region);
  if(width===320 || width===390 || width===768) await root.screenshot({path:join(screenshots,`${width}.png`)});
}
await page.setViewportSize({width:390,height:1000});
const scroll=root.getByRole('region',{name:/Diagrama del árbol/}); await scroll.focus();
assert.equal(await scroll.evaluate(e=>e===document.activeElement),true);
await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
assert.equal(await scroll.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
await page.keyboard.press('ArrowRight');
await page.waitForFunction(()=>document.querySelector('.db-bplus-scroll').scrollLeft>0);
// Desktop 200% zoom reflow: a 1280px surface becomes 640 CSS px at DPR 2.
const zoomContext=await browser.newContext({colorScheme:process.env.DB_TEST_THEME??'light',viewport:{width:640,height:500},deviceScaleFactor:2});
const zoomPage=await zoomContext.newPage(); await zoomPage.goto(url);await zoomPage.locator('.db-bplus').waitFor();
assert.ok(await zoomPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
assert.equal(await zoomPage.locator('.db-bplus-value').first().evaluate(e=>getComputedStyle(e).fontSize),'15px');
await zoomPage.locator('.db-bplus').screenshot({path:join(screenshots,'zoom200.png')});await zoomContext.close();
// Print fallback; no motion is introduced by the component.
await page.emulateMedia({media:'print'});
assert.equal(await page.locator('.db-viz-fallback').isVisible(),true); assert.equal(await root.isVisible(),false);
await page.emulateMedia({media:'screen'});
assert.equal(await page.locator('.db-viz-fallback').isVisible(),false);
// Multiple roots initialise independently via the existing loader.
await page.evaluate(async()=>{
  const original=document.querySelector('[data-db-viz="bplus"]');
  const duplicate=document.createElement('div'); duplicate.className='db-viz'; duplicate.dataset.dbViz='bplus';
  duplicate.append(original.querySelector('.db-viz-fallback').cloneNode(true)); original.after(duplicate);
  const loader=document.querySelector('script[type="module"][src*="visualizaciones/index.js"]').src;
  const {initialize}=await import(loader); await initialize(document); await initialize(document);
});
assert.equal(await page.locator('.db-viz-interactive').count(),2);
const roots=page.locator('[data-db-viz="bplus"]');
await roots.nth(1).getByRole('button',{name:'Siguiente',exact:true}).click();
assert.match(await roots.nth(1).locator('.db-viz-status').innerText(),/Paso 1 /);
assert.match(await roots.nth(0).locator('.db-viz-status').innerText(),/Paso 0 /);
// True JS-disabled load and failed module both retain the academic example.
const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
const staticPage=await nojs.newPage();await staticPage.goto(url);assert.ok(await staticPage.locator('.db-viz-fallback').isVisible());assert.equal(await staticPage.locator('.db-viz-interactive').count(),0);
const broken=await browser.newContext();await broken.route('**/bplus.js',r=>r.abort());const brokenPage=await broken.newPage();await brokenPage.goto(url);assert.ok(await brokenPage.locator('.db-viz-fallback').isVisible());
assert.ok(await page.locator('mjx-container').count()>100);
assert.deepEqual(errors.filter(e=>!e.includes('404 (File not found)')),[],'no JavaScript/console errors');
assert.deepEqual(failed,[],'all own page resources load');
console.log(JSON.stringify({screenshots,checkedSnapshots:checked,presets:presets.length,policies:2,errors,failed,checks:['back/reset','custom operations','invalid inputs','range','320/390/768/1024/1440','keyboard focus/scroll','200% equivalent viewport/DPR','print','multiple instances','no JS','failed module','MathJax']},null,2));
await browser.close();
