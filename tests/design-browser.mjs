// Pilot integration audit. Uses the already installed Playwright only for tests.
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.DB_TEST_BASE ?? 'http://127.0.0.1:8768/base-de-datos/';
const output = 'artifacts/design-v0.2';
const reportName=process.env.DB_TEST_REPORT??'browser-results';
if(!/^[a-z0-9-]+$/.test(reportName))throw Error('Invalid report name');
mkdirSync(`${output}/screenshots`, {recursive:true});
const routes = process.env.DB_TEST_ROUTES?.split(',') ?? Object.keys(JSON.parse(readFileSync(`${output}/design-integrity.json`)).theme_pairs);
const representative = new Set(['index.html','indices/bplus.html','indices/hashing.html',
  'diseno/implicacion-clausura.html','diseno/bcnf.html','diseno/tercera-forma-normal.html',
  'procesamiento/planes-logicos.html','procesamiento/reescritura.html',
  'almacenamiento/paginas-registros.html','almacenamiento/buffer-manager.html']);
const auditSha256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).update(readFileSync('_site/assets/css/visualizaciones.css')).update(readFileSync('_site/styles/compatibility.css')).digest('hex');
const report = {base,auditSha256, checks:[], matrix:[], simulators:[], contrast:[], screenshots:[], errors:[]};
function check(name, pass, details) {
  report.checks.push({name,pass:Boolean(pass),details});
  if (!pass) console.log('FAIL', name, JSON.stringify(details));
}
const browser = await chromium.launch({headless:true, chromiumSandbox:true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark',reducedMotion:'reduce'});
  const page = await context.newPage();
  page.on('pageerror', e=>report.errors.push(e.message));
  page.on('response', r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
  page.on('requestfailed', r=>report.errors.push(`${r.failure()?.errorText} ${r.url()}`));
  async function theme(mode) {
    if (!await page.evaluate(m=>document.body.classList.contains(`quarto-${m}`), mode)) {
      await page.locator('.quarto-color-scheme-toggle').click();
    }
    await page.waitForFunction(m=>document.body.classList.contains(`quarto-${m}`) &&
      getComputedStyle(document.documentElement).getPropertyValue('--uso-bg').trim()===(m==='dark'?'#111827':'#f4f6fa'),mode);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  }
  async function navigate(route) {
    await page.goto(new URL(route,base).href);
    await page.locator('.uso-skip-link').waitFor({state:'attached'});
    await page.evaluate(async()=>{await document.fonts.ready;await window.MathJax?.startup?.promise;});
    const n = await page.locator('[data-db-viz]').count();
    if(n)await page.waitForFunction(()=>[...document.querySelectorAll('[data-db-viz]')].every(r=>r.dataset.dbReady==='true'));
  }
  await navigate('index.html');
  check('initial system dark preference',await page.locator('body').evaluate(e=>e.classList.contains('quarto-dark')));
  await page.locator('.uso-skip-link').focus();await page.keyboard.press('Enter');
  check('keyboard skip link',await page.evaluate(()=>document.activeElement.id==='quarto-document-content'));
  await page.locator('.quarto-color-scheme-toggle').focus();await page.keyboard.press(' ');
  check('native toggle keyboard Space',await page.locator('body').evaluate(e=>e.classList.contains('quarto-light')));
  await navigate('indices/bplus.html');
  check('explicit light persists across nested navigation',await page.locator('body').evaluate(e=>e.classList.contains('quarto-light')));
  await page.reload();
  check('theme survives reload',await page.locator('body').evaluate(e=>e.classList.contains('quarto-light')));
  // All public routes, both themes, including narrow and desktop layouts.
  for (const width of (process.env.DB_TEST_WIDTHS?.split(',').map(Number) ?? [320,390,768,1440])) {
    await page.setViewportSize({width,height:1000});
    for (const route of routes) {
      await navigate(route);
      const roots = page.locator('[data-db-viz]');
      // Advance each existing simulator and retain an edited field and open details.
      for(let i=0;i<await roots.count();i++) {
        const root=roots.nth(i),next=root.getByRole('button',{name:'Siguiente',exact:true});
        if(await next.count() && !await next.isDisabled())await next.click();
        await root.locator('details').evaluateAll(ns=>ns.forEach(e=>e.open=true));
        const field=root.locator('input:not([type="checkbox"]):not([disabled]):visible, textarea:not([disabled]):visible').first();
        if(await field.count())await field.fill((await field.inputValue())+' ');
      }
      // Screenshot caret suppression can leave style="" on form controls.
      // Ignore only that empty attribute; retain all values and meaningful markup.
      const snapshot=()=>roots.evaluateAll(rs=>rs.map(r=>({html:r.innerHTML.replace(/ style=""/g,''),
        values:[...r.querySelectorAll('input,select,textarea')].map(e=>[e.value,e.checked]),
        status:r.querySelector('.db-viz-status')?.textContent})));
      const before=await snapshot();
      await roots.evaluateAll(rs=>{window.__pilotNodes=rs.flatMap(r=>[r,...r.querySelectorAll('*')]);});
      for(const mode of ['light','dark']) {
        await theme(mode);
        const after=await snapshot();
        const identity=await roots.evaluateAll(rs=>rs.flatMap(r=>[r,...r.querySelectorAll('*')]).every((e,i)=>e===window.__pilotNodes[i]));
        if(before.length) {
          const pass=identity && JSON.stringify(before)===JSON.stringify(after);
          const differences=before.map((b,i)=>{
            if(JSON.stringify(b)===JSON.stringify(after[i]))return null;
            let k=0;while(k<b.html.length&&b.html[k]===after[i].html[k])k++;
            return {index:i,before:b.html.slice(Math.max(0,k-100),k+250),after:after[i].html.slice(Math.max(0,k-100),k+250),valuesBefore:b.values,valuesAfter:after[i].values};
          }).filter(Boolean);
          check(`simulator state preserved ${route} ${width} ${mode}`,pass,{identity,differences});
          report.simulators.push({route,width,mode,instances:before.length,pass});
        }
        const metrics=await page.evaluate(()=>{
          const toggle=document.querySelector('.quarto-color-scheme-toggle'),b=toggle.getBoundingClientRect();
          const ids=[...document.body.querySelectorAll('[id]')].map(e=>e.id);
          const labels=[...document.querySelectorAll('.db-viz :is(input,select,textarea)')].filter(e=>
            !e.closest('label') && !e.getAttribute('aria-label') && !e.labels?.length).length;
          const regions=[...document.querySelectorAll('.db-viz [role="region"]')].every(e=>e.tabIndex===0&&e.getAttribute('aria-label'));
          return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,
            toggleVisible:b.x>=0&&b.right<=innerWidth&&b.y>=0&&b.bottom<=70,
            toggleSize:b.width>=44&&b.height>=44,duplicateBodyIds:ids.length-new Set(ids).size,
            unlabeledControls:labels,regionsAccessible:regions,mathErrors:document.querySelectorAll('mjx-merror').length,
            themeSheets:[...document.querySelectorAll('link[data-mode][rel="stylesheet"]')].every(e=>e.sheet)};
        });
        const pass=metrics.documentWidth<=width+1&&metrics.toggleVisible&&metrics.toggleSize&&
          !metrics.duplicateBodyIds&&!metrics.unlabeledControls&&metrics.regionsAccessible&&!metrics.mathErrors&&metrics.themeSheets;
        check(`route, reflow, controls ${route} ${width} ${mode}`,pass,metrics);
        report.matrix.push({route,width,mode,...metrics,pass});
        // Effective text/background contrast, including SVG text against actual
        // rectangles under its glyphs rather than a guessed palette token.
        if(width===1440&&before.length) {
          const colors=await page.evaluate(()=>{
            const rgb=c=>c.match(/[\d.]+/g).slice(0,3).map(Number);
            const lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
            const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
            const bg=e=>{for(let p=e;p;p=p.parentElement){const c=getComputedStyle(p).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;}return 'rgb(255, 255, 255)';};
            const results=[];
            const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('.db-viz-fallback')&&
              (!e.closest('details:not([open])')||e.closest('summary')?.parentElement===e.closest('details:not([open])'));
            for(const e of document.querySelectorAll('.db-viz :is(button,input,select,textarea,summary,caption,th,td,.db-viz-status,.db-viz-error,.db-buffer-frame p,label > span),.db-viz svg text,.db-storage-diagram text')) {
              if(!visible(e)||!e.textContent.trim()&&!e.value)continue;
              const style=getComputedStyle(e);let background=bg(e),foreground=style.color;
              if(e instanceof SVGElement) {
                foreground=style.fill;
                const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;
                // Last painted enclosing rectangle is the visible background.
                for(const rect of e.closest('svg').querySelectorAll('rect,ellipse')) {
                  const r=rect.getBoundingClientRect(),fill=getComputedStyle(rect).fill;
                  if(fill!=='none'&&r.left<=x&&r.right>=x&&r.top<=y&&r.bottom>=y)background=fill;
                }
              }
              results.push({tag:e.tagName,label:(e.textContent||e.value).trim().slice(0,70),foreground,background,ratio:ratio(foreground,background)});
            }
            return results;
          });
          const failed=colors.filter(c=>c.ratio<4.5);
          check(`simulator text contrast ${route} ${mode}`,failed.length===0,failed);
          report.contrast.push({route,mode,samples:colors.length,minimum:Math.min(...colors.map(c=>c.ratio)),failed});
        }
        if([390,1440].includes(width)&&representative.has(route)) {
          const first=roots.first();
          if(await first.count())await first.locator('.db-viz-status').scrollIntoViewIfNeeded();
          else await page.evaluate(()=>scrollTo(0,0));
          const name=`${route.replaceAll('/','-').replace('.html','')}-${width}-${mode}.png`;
          await page.screenshot({path:join(output,'screenshots',name)});
          report.screenshots.push(name);
        }

      }
      // State remains interactive after both switches; real keyboard activation.
      for(let i=0;i<await roots.count();i++) {
        const root=roots.nth(i),previous=root.getByRole('button',{name:'Anterior',exact:true});
        if(await previous.count()&&!await previous.isDisabled()) {
          const status=await root.locator('.db-viz-status').textContent();
          await previous.focus();await page.keyboard.press('Enter');
          check(`keyboard after theme ${route} ${width} ${i}`,status!==await root.locator('.db-viz-status').textContent());
        }
      }
      console.log(`Checked ${route} at ${width}px in both themes`);
    }
    await navigate('diseno/bcnf.html');
    if(width<992) {
      await page.locator('.navbar-toggler').click();
      await page.waitForFunction(()=>document.querySelector('.navbar-collapse').classList.contains('show'));
      check(`mobile navbar ${width}`,await page.locator('.navbar-collapse').evaluate(e=>e.classList.contains('show')));
      await page.locator('.navbar-toggler').click();
      await page.locator('.quarto-btn-toggle').click();
      await page.waitForFunction(()=>document.querySelector('#quarto-sidebar').classList.contains('show'));
      check(`mobile academic sidebar ${width}`,await page.locator('#quarto-sidebar').evaluate(e=>e.classList.contains('show')));
      await page.locator('.quarto-btn-toggle').click();
      await page.locator('.uso-mobile-toc > summary').focus();await page.keyboard.press('Enter');
      check(`keyboard mobile TOC ${width}`,await page.locator('.uso-mobile-toc').evaluate(e=>e.open));
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await navigate('indices/hashing.html');
  await page.locator('#quarto-search').click();
  await page.locator('.aa-Input').fill('clausura');
  await page.locator('.aa-Item').first().waitFor();
  check('search under GitHub Pages prefix',await page.locator('.aa-Item a').first().evaluate(e=>new URL(e.href).pathname.startsWith('/base-de-datos/')));
  await page.keyboard.press('Escape');
  for(const mode of ['light','dark']) {
    await theme(mode);
    const pairs=await page.evaluate(()=>{
      const token=n=>{const e=document.createElement('span');e.style.color=`var(--uso-${n})`;document.body.append(e);const c=getComputedStyle(e).color;e.remove();return c;};
      const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>{const x=lum(token(a)),y=lum(token(b));return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
      const out=[];
      for(const background of ['surface','surface-alt','primary-soft','emphasis-soft','callout-warning-header']) {
        for(const foreground of ['text','muted','link'])out.push({foreground,background,ratio:ratio(foreground,background),minimum:4.5});
        for(const foreground of ['control-border','primary','emphasis-ink','warning','danger'])out.push({foreground,background,ratio:ratio(foreground,background),minimum:3});
      }
      return out;
    });
    check(`text, controls and simulator state colors ${mode}`,pairs.every(p=>p.ratio>=p.minimum),pairs.filter(p=>p.ratio<p.minimum));
    report.contrast.push({mode,palettePairs:pairs});
  }
  check('no browser network or JavaScript errors',report.errors.length===0,report.errors);
} catch(error) {
  report.errors.push(error.stack);check('audit completed',false,error.message);
} finally {
  report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,
    matrixCases:report.matrix.length,simulatorCases:report.simulators.length,screenshots:report.screenshots.length};
  writeFileSync(`${output}/${reportName}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));
  await browser.close();
}
process.exitCode=report.summary.failed?1:0;
