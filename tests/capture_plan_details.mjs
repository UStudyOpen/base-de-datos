// Capture a scroll region that fits the viewport; omit fixed navigation only
// during the element capture to avoid Chromium's tall-screenshot stitching.
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const b=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.BROWSER_EXECUTABLE});
const report={screenshots:[],sameState:true};
try {
 const p=await b.newPage({reducedMotion:'reduce',colorScheme:'light'});
 for(const width of [1440,390]) {
  await p.setViewportSize({width,height:1000});
  await p.goto('http://127.0.0.1:8768/base-de-datos/procesamiento/reescritura.html');
  const root=p.locator('.db-query-plan');await root.waitFor();
  await root.getByRole('button',{name:'Siguiente',exact:true}).click();
  const status=await root.locator('.db-viz-status').textContent();
  for(const mode of ['light','dark']) {
   if(!await p.locator('body').evaluate((e,m)=>e.classList.contains(`quarto-${m}`),mode))await p.locator('.quarto-color-scheme-toggle').click();
   await p.waitForFunction(m=>getComputedStyle(document.documentElement).getPropertyValue('--uso-bg').trim()===(m==='dark'?'#111827':'#f4f6fa'),mode);
   const region=root.locator('.db-plan-scroll').nth(1);
   await root.getByRole('button',{name:'Centrar raíz del plan propuesto',exact:true}).click();
   const path=`artifacts/design-v0.2/screenshots/plan-detail-${width}-${mode}.png`;
   await region.screenshot({path,style:'#quarto-header,.uso-skip-link,#quarto-back-to-top { visibility: hidden !important; }'});
   assert.equal(await root.locator('.db-viz-status').textContent(),status);
   report.screenshots.push({path,width,mode,status});
  }
 }
 mkdirSync('artifacts/design-v0.2',{recursive:true});
 writeFileSync('artifacts/design-v0.2/plan-detail-results.json',JSON.stringify(report,null,2)+'\n');
 console.log('PASS: four plan-region screenshots, same state across theme changes');
}finally{await b.close();}
