import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {examples,exampleTrace,validatePlan,comparePlans} from '../assets/js/visualizaciones/query-plan-model.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const base=process.env.QUERY_PLAN_TEST_URL??'http://127.0.0.1:8765/open-study-base-de-datos/docs/procesamiento/reescritura.html';
const screenshots=mkdtempSync(join(process.env.DB_BROWSER_ARTIFACTS??tmpdir(),'openstudy-query-browser-'));
const errors=[],failed=[];let checked=0;
try {
 const context=await browser.newContext({colorScheme:process.env.DB_TEST_THEME??'light',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'||(m.type()==='error'&&!m.text().includes('404')))errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))failed.push([r.status(),r.url()]);});
 await page.goto(base);await page.locator('[data-db-ready="true"]').waitFor();
 const root=page.locator('.db-query-plan').first(),button=(r,name)=>r.getByRole('button',{name,exact:true});
 const svg=()=>root.locator('svg').nth(1).evaluate(e=>e.outerHTML);
 const allNodes=n=>[n,...n.children.flatMap(allNodes)];
 async function inspect(step,index,total,data) {
  assert.match(await root.locator('.db-viz-status').innerText(),new RegExp(`Paso ${index} de ${total-1}`));
  assert.equal(await root.getAttribute('data-classification'),step.classification);
  for(const [i,plan] of [step.before,step.after].entries()) {
    const expected=allNodes(plan);
    assert.deepEqual(await root.locator('svg').nth(i).locator('[data-node-id]').evaluateAll(ns=>ns.map(n=>n.dataset.nodeId).sort()),expected.map(n=>n.id).sort());
    assert.equal(await root.locator('svg').nth(i).locator('.db-plan-edge').count(),expected.length-1);
    assert.ok(!/NaN|Infinity/.test(await root.locator('svg').nth(i).evaluate(e=>e.outerHTML)));
    // Every visible SVG text stays inside its own box, with unscaled fonts.
    const clipped=await root.locator('svg').nth(i).evaluate(svg=>[...svg.querySelectorAll('g')].some(g=>{
      const rect=g.querySelector('rect').getBBox();return [...g.querySelectorAll('text')].some(t=>{const b=t.getBBox();return b.x<rect.x||b.x+b.width>rect.x+rect.width||b.y<rect.y||b.y+b.height>rect.y+rect.height;});
    }));assert.equal(clipped,false,step.ruleName);
  }
  const comparison=comparePlans(step.before,step.after,data);
  if(!validatePlan(step.after).valid) {
    assert.ok(await root.locator('.is-invalid').count()>0);assert.match(await root.locator('.db-plan-results').innerText(),/Falta e.rut/);
    assert.match(await root.locator('.db-plan-results').innerText(),/Sin resultado/);
  }else{
    const rows=await root.locator('.db-plan-results tbody tr').evaluateAll(rs=>rs.map(r=>[...r.querySelectorAll('td')].slice(1).map(td=>Number(td.textContent))));
    assert.deepEqual(rows,comparison.difference.map(x=>[x.before,x.after,x.after-x.before]));
  }
  if(index>0)assert.ok(await root.locator('.is-changed').count()>0 || step.before===step.after);
  checked++;
 }
 for(const {id} of examples) {
  await root.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption(id);
  const trace=exampleTrace(id),initial=await svg();
  for(let i=0;i<trace.steps.length;i++) {await inspect(trace.steps[i],i,trace.steps.length,trace.data);if(i<trace.steps.length-1)await button(root,'Siguiente').click();}
  const final=await svg();await button(root,'Anterior').click();await button(root,'Siguiente').click();assert.equal(await svg(),final);
  await button(root,'Reiniciar').click();assert.equal(await svg(),initial);
 }
 await root.getByRole('combobox',{name:'Ejemplo',exact:true}).selectOption('valido');await button(root,'Siguiente').click();
 // A second independent instance and idempotent initialization.
 await page.evaluate(async()=>{
  const source=document.querySelector('[data-db-viz="query-plan"]'),copy=source.cloneNode(true);copy.removeAttribute('data-db-ready');copy.querySelector('.db-viz-interactive').remove();document.querySelector('main').append(copy);
  const {initialize}=await import(new URL('../assets/js/visualizaciones/index.js',location.href));await initialize();await initialize();
 });
 const second=page.locator('.db-query-plan').nth(1);assert.equal(await page.locator('.db-query-plan').count(),2);
 const first=await svg();await button(second,'Siguiente').click();assert.equal(await svg(),first);
 for(const width of [320,390,768,1024,1440]) {
  await page.setViewportSize({width,height:1000});await root.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`document overflow at ${width}`);
  for(const region of await root.locator('.db-plan-scroll').all()) {
   await page.keyboard.press('Tab');await region.focus();assert.equal(await region.evaluate(e=>document.activeElement===e),true);
   assert.notEqual(await region.evaluate(e=>getComputedStyle(e).outlineStyle),'none');await region.press('ArrowRight');
  }
  assert.equal(await root.locator('.db-plan-label').first().evaluate(e=>getComputedStyle(e).fontSize),'14px');
  await button(root,'Centrar raíz del plan anterior').click();await button(root,'Centrar raíz del plan propuesto').click();
  const visibleRoot=await root.locator('svg').nth(1).evaluate(svg=>{
    const region=svg.parentElement.getBoundingClientRect(),label=svg.querySelector('g[data-node-id="output"] text').getBoundingClientRect();
    return label.left>=region.left && label.left<region.right;
  });assert.equal(visibleRoot,true,`root label hidden at ${width}`);
  await root.locator('.db-plan-comparison').screenshot({path:join(screenshots,`${width}.png`)});
 }
 // Reflow equivalent to 200% desktop zoom: 1280 device pixels / 2.
 await page.setViewportSize({width:640,height:500});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await button(root,'Reiniciar').focus();await page.keyboard.press('Enter');assert.equal(await root.getAttribute('data-position'),'0');
 await page.keyboard.press('Tab');await page.keyboard.press('Enter');assert.equal(await root.getAttribute('data-position'),'1');
 assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.db-viz-fallback').first().isVisible(),true);assert.equal(await root.isVisible(),false);await page.emulateMedia({media:'screen'});
 await page.waitForFunction(()=>document.querySelector('mjx-container'));
 assert.equal(await page.locator('mjx-merror').count(),0);
 const nojs=await browser.newContext({javaScriptEnabled:false});const fallback=await nojs.newPage();await fallback.goto(base);
 assert.match(await fallback.locator('.db-viz-fallback').innerText(),/multiplicidad|Original/);assert.equal(await fallback.locator('.db-viz-fallback').isVisible(),true);await nojs.close();
 const broken=await browser.newContext();await broken.route('**/query-plan.js',r=>r.abort());const failpage=await broken.newPage();await failpage.goto(base);assert.equal(await failpage.locator('.db-viz-fallback').isVisible(),true);await broken.close();
 // The companion page has the complete valid fallback, equations and its own explorer.
 const plansURL=base.replace('reescritura.html','planes-logicos.html');await page.goto(plansURL);await page.locator('[data-db-ready="true"]').waitFor();
 assert.equal(await page.locator('.db-query-plan').getAttribute('data-example'),'valido');
 for(const width of [320,390,768,1024,1440]) {
  await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`plans page overflow at ${width}`);
 }
 await page.waitForFunction(()=>document.querySelector('mjx-container'));assert.equal(await page.locator('mjx-merror').count(),0);
 await page.emulateMedia({media:'print'});assert.match(await page.locator('.db-viz-fallback').innerText(),/24 ocurrencias/);await page.emulateMedia({media:'screen'});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 console.log(JSON.stringify({checkedSnapshots:checked,examples:examples.length,widths:[320,390,768,1024,1440],screenshots,errors,failed},null,2));
} finally {await browser.close();}
