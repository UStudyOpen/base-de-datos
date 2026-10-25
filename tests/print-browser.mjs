// Print is loaded as print from the outset, independently of screenshot/media changes.
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.BROWSER_EXECUTABLE});
const report={checks:[],errors:[]};
const routes=['almacenamiento/buffer-manager.html','almacenamiento/paginas-registros.html',
 'diseno/bcnf.html','diseno/implicacion-clausura.html','diseno/tercera-forma-normal.html',
 'indices/bplus.html','indices/hashing.html','procesamiento/planes-logicos.html','procesamiento/reescritura.html'];
try {
 for(const mode of ['light','dark']) {
  const context=await browser.newContext({colorScheme:mode,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
  await page.emulateMedia({media:'print',reducedMotion:'reduce'});
  for(const route of routes) {
   await page.goto(`http://127.0.0.1:8768/base-de-datos/${route}`);
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-db-viz]')].every(r=>r.dataset.dbReady==='true'));
   const details=await page.evaluate(()=>({
    mode:document.body.classList.contains('quarto-dark')?'dark':'light',
    panels:[...document.querySelectorAll('[data-db-viz]')].map(r=>{
     const f=r.querySelector('.db-viz-fallback'),p=r.querySelector('.db-viz-interactive');
     return {fallback:getComputedStyle(f).display,panel:getComputedStyle(p).display,bg:getComputedStyle(r).backgroundColor,
      textBlack:[...f.querySelectorAll('p,td,th,caption,code')].every(e=>getComputedStyle(e).color==='rgb(0, 0, 0)')};
    }),diagramText:[...document.querySelectorAll('.db-storage-diagram text')].map(e=>getComputedStyle(e).fill)
   }));
   const pass=details.mode===mode&&details.panels.every(p=>p.fallback!=='none'&&p.panel==='none'&&p.bg==='rgb(255, 255, 255)'&&p.textBlack)&&details.diagramText.every(c=>c==='rgb(36, 50, 71)');
   report.checks.push({route,mode,pass,details});
   console.log(`${pass?'PASS':'FAIL'} print ${route} ${mode}`);
  }
  await context.close();
 }
}catch(error){report.errors.push(error.stack);}finally{
 report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,errors:report.errors.length};
 mkdirSync('artifacts/design-v0.2',{recursive:true});
 writeFileSync('artifacts/design-v0.2/print-results.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();console.log(JSON.stringify(report.summary));
}
process.exitCode=report.summary.failed||report.summary.errors||report.checks.length!==18?1:0;
