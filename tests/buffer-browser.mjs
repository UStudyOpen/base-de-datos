import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {traceBuffer,presets} from '../assets/js/visualizaciones/buffer-model.js';
import {pageStates} from '../assets/js/visualizaciones/paginas.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const base=process.env.BUFFER_TEST_URL??'http://127.0.0.1:8765/open-study-base-de-datos/docs/almacenamiento/buffer-manager.html';
const screenshots=mkdtempSync(join(tmpdir(),'openstudy-buffer-browser-'));
const errors=[],failed=[];let checked=0,activePage;
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  activePage=page;
  page.on('crash',()=>errors.push('El proceso de la página se interrumpió.'));
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='warning'||m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))failed.push([r.status(),r.url()]);});
  await page.goto(base);await page.locator('[data-db-viz="buffer"][data-db-ready="true"]').nth(1).waitFor();
  await page.evaluate(async()=>{if(window.MathJax?.startup?.promise)await window.MathJax.startup.promise;});
  const root=page.locator('.db-buffer').first(),second=page.locator('.db-buffer').nth(1);
  const button=(r,name)=>r.getByRole('button',{name,exact:true});
  const select=(r,name)=>r.getByRole('combobox',{name,exact:true});
  async function inspect(s) {
    const actual=await root.evaluate(e=>({position:e.dataset.position,frames:[...e.querySelectorAll('.db-buffer-frame')].map(n=>({pageId:n.dataset.page||null,pinCount:Number(n.dataset.pins),dirty:n.dataset.dirty==='true'})),counts:Object.fromEntries([...e.querySelectorAll('[data-counter]')].map(n=>[n.dataset.counter,Number(n.textContent)])),result:e.querySelector('[data-result]').dataset.result,explanation:e.querySelector('.db-buffer-explanation').textContent,io:e.querySelector('.db-buffer-io')?.textContent}));
    assert.equal(actual.position,String(s.step));
    assert.deepEqual(actual.frames,s.state.frames.map(({pageId,pinCount,dirty})=>({pageId,pinCount,dirty})));
    for(const key of ['reads','writes','hits','misses'])assert.equal(actual.counts[key],s.state[key]);
    assert.equal(actual.result,s.event.result);assert.equal(actual.explanation,s.explanation);
    if(s.event.victim)assert.match(actual.io,new RegExp(`Víctima: ${s.event.victim.pageId}`));
    checked++;
  }
  const cases=presets.flatMap(p=>['FIFO','LRU'].map(policy=>[p,3,policy]));
  for(const n of [4,7,8])for(const policy of ['FIFO','LRU'])cases.push([presets.find(p=>p.id===(n===4?'belady':'bplus-ciclo')),n,policy]);
  for(const [preset,n,policy] of cases) {
    await page.bringToFront();
    await select(root,'Secuencia').selectOption(preset.id);await select(root,'Cantidad de frames').selectOption(String(n));await select(root,'Política').selectOption(policy);
    const t=traceBuffer(preset.operations,n,policy);
    // Enumerate every snapshot with a DOM click; real pointer back/next/reset and
    // keyboard activation are checked separately below for each trace.
    for(let i=0;i<t.length;i++){await inspect(t[i]);if(i<t.length-1)await button(root,'Siguiente').dispatchEvent('click');}
    const final=await root.locator('.db-buffer-frames').innerHTML();await button(root,'Anterior').click();await button(root,'Siguiente').click();assert.equal(await root.locator('.db-buffer-frames').innerHTML(),final);
    await button(root,'Reiniciar').click();await inspect(t[0]);
    console.log(`Verified ${preset.id}, ${policy}, ${n} frames.`);
  }
  // Two real independent instances; repeated initialization must not add duplicates.
  await page.evaluate(async()=>{const {initialize}=await import(new URL('../assets/js/visualizaciones/index.js',location.href));await initialize();await initialize();});
  assert.equal(await page.locator('.db-buffer').count(),2);
  await button(second,'Siguiente').click();assert.equal(await root.getAttribute('data-position'),'0');
  // Compare Belady four ways at the final prefix.
  await select(root,'Secuencia').selectOption('belady');
  for(let i=0;i<24;i++)await button(root,'Siguiente').click();
  assert.deepEqual(await root.locator('.db-buffer-belady tbody tr').evaluateAll(rs=>rs.map(r=>Number(r.cells[2].textContent))),[9,10,10,8]);
  // Manual branch, nested pins, persistent dirty, validation, blocked pin, legal hit.
  await select(root,'Cantidad de frames').selectOption('1');await button(root,'Reiniciar').click();
  await root.locator('.db-buffer-manual summary').click();
  const pageInput=root.getByRole('textbox',{name:'PageID',exact:true});
  async function manual(type,p) {await select(root,'Operación').selectOption(type);await pageInput.fill(p);await button(root,'Agregar operación').click();}
  await manual('pin','A');await manual('pin','A');await manual('dirty','A');await manual('clean','A');
  assert.equal(await root.locator('.db-buffer-frame').getAttribute('data-pins'),'0');assert.equal(await root.locator('.db-buffer-frame').getAttribute('data-dirty'),'true');
  await manual('clean','A');assert.equal(await root.locator('[data-result]').getAttribute('data-result'),'rechazo');
  await manual('pin','A');await manual('pin','B');assert.equal(await root.locator('[data-result]').getAttribute('data-result'),'rechazo');
  assert.equal(await root.locator('[data-counter="reads"]').innerText(),'1');
  await manual('pin','A');assert.equal(await root.locator('.db-buffer-frame').getAttribute('data-pins'),'2');
  const position=await root.getAttribute('data-position');await manual('pin','bad!');assert.equal(await root.getAttribute('data-position'),position);assert.match(await root.locator('.db-viz-error').last().innerText(),/PageID inválido/);
  await button(root,'Anterior').click();await manual('clean','A');assert.equal(await root.getAttribute('data-example'),'manual');
  await select(root,'Secuencia').selectOption('principal');await select(root,'Cantidad de frames').selectOption('3');await select(root,'Política').selectOption('LRU');
  for(let i=0;i<11;i++)await button(root,'Siguiente').click();
  await select(root,'Política').selectOption('FIFO');await inspect(traceBuffer(presets[0].operations,3,'FIFO')[11]);
  await select(root,'Política').selectOption('LRU');await inspect(traceBuffer(presets[0].operations,3,'LRU')[11]);
  for(const width of [320,390,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});await root.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`buffer overflow at ${width}`);
    assert.ok(await root.locator('.db-buffer-frame p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=14));
    await root.screenshot({path:join(screenshots,`buffer-${width}.png`)});
  }
  await page.setViewportSize({width:640,height:500});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.keyboard.press('Tab');await button(root,'Reiniciar').focus();assert.notEqual(await button(root,'Reiniciar').evaluate(e=>getComputedStyle(e).outlineStyle),'none');await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');await page.keyboard.press('Enter');assert.equal(await root.getAttribute('data-position'),'1');
  assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  await page.waitForFunction(()=>document.querySelector('mjx-container'));assert.equal(await page.locator('mjx-merror').count(),0);
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.db-viz-fallback').first().isVisible(),true);assert.equal(await root.isVisible(),false);await page.emulateMedia({media:'screen'});
  const storage=base.replace('buffer-manager.html','paginas-registros.html');await page.goto(storage);await page.locator('[data-db-viz="paginas"][data-db-ready="true"]').waitFor();
  await page.evaluate(async()=>{if(window.MathJax?.startup?.promise)await window.MathJax.startup.promise;});
  const pages=page.locator('.db-pages');
  for(const s of pageStates) {
    assert.equal(await pages.getAttribute('data-position'),String(s.step));assert.match(await pages.locator('.db-page-counts').innerText(),new RegExp(`Libre total: ${s.freeTotal} B`));
    assert.deepEqual(await pages.locator('tbody tr').evaluateAll(rs=>rs.map(r=>[r.cells[1].textContent,r.cells[3].textContent])),Array.from({length:s.slotCount},(_,i)=>{const r=s.records.find(r=>r.slot===i+1);return [r?.name??'Libre reservado',String(r?.offset??'—')];}));
    const coverage=await pages.locator('svg g').evaluateAll(gs=>gs.reduce((n,g)=>n+Number(g.dataset.end)-Number(g.dataset.start),0));assert.equal(coverage,128);
    if(s.step<7)await button(pages,'Siguiente').click();checked++;
  }
  await button(pages,'Anterior').click();assert.equal(await pages.getAttribute('data-position'),'6');await button(pages,'Reiniciar').click();assert.equal(await pages.getAttribute('data-position'),'0');
  for(let i=0;i<5;i++)await button(pages,'Siguiente').click();
  for(const width of [320,390,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});await pages.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page layout overflow at ${width}`);
    await page.keyboard.press('Tab');await pages.locator('.db-page-scroll').focus();assert.notEqual(await pages.locator('.db-page-scroll').evaluate(e=>getComputedStyle(e).outlineStyle),'none');await pages.locator('.db-page-scroll').press('ArrowRight');
    assert.equal(await pages.locator('svg text').first().evaluate(e=>getComputedStyle(e).fontSize),'15px');
    await pages.screenshot({path:join(screenshots,`page-${width}.png`)});
  }
  await page.waitForFunction(()=>document.querySelector('mjx-container'));assert.equal(await page.locator('mjx-merror').count(),0);
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.db-viz-fallback').isVisible(),true);assert.equal(await pages.isVisible(),false);await page.emulateMedia({media:'screen'});
  for(const url of [base,storage]) {
    const nojs=await browser.newContext({javaScriptEnabled:false});const p=await nojs.newPage();await p.goto(url);
    for(const fallback of await p.locator('.db-viz-fallback').all())assert.equal(await fallback.isVisible(),true);
    assert.equal(await p.locator('.db-viz-interactive').count(),0);
    for(const width of [320,390,768,1024,1440]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`no-JS overflow ${url}/${width}`);}
    await nojs.close();
  }
  for(const [url,module] of [[base,'buffer.js'],[storage,'paginas.js']]) {
    const broken=await browser.newContext();await broken.route(`**/${module}`,r=>r.abort());const p=await broken.newPage();await p.goto(url);assert.equal(await p.locator('.db-viz-fallback').first().isVisible(),true);await broken.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  console.log(JSON.stringify({checkedSnapshots:checked,widths:[320,390,768,1024,1440],screenshots,errors,failed},null,2));
}catch(error){
  console.error(JSON.stringify({checkedSnapshots:checked,url:activePage?.url(),errors,failed}));
  if(activePage)await activePage.screenshot({path:join(screenshots,'failure.png'),timeout:5000}).catch(()=>{});
  console.error(`Screenshots: ${screenshots}`);throw error;
}finally{await browser.close();}
