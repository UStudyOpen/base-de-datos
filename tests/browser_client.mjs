// Disposable, loopback-only Chromium integration client. No third-party packages.
export async function connect(debug = 'http://127.0.0.1:9228') {
  const endpoint = new URL(debug);
  if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'http:') throw Error('CDP must use http://127.0.0.1');
  const tabs = await (await fetch(`${debug}/json/list`)).json();
  const target = tabs.find(t => t.type === 'page');
  if (!target) throw Error('Launch an isolated browser with about:blank.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id) {
      const task = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(task?.timer);
      if (msg.error) task?.reject(Error(JSON.stringify(msg.error)));
      else task?.resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) errors.push(`${msg.params.response.status} ${msg.params.response.url}`);
    if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) errors.push(msg.params.errorText);
  };
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {pending.delete(id); reject(Error(`CDP timeout: ${method}`));}, 30000);
      pending.set(id, {resolve, reject, timer});
      socket.send(JSON.stringify({id, method, params}));
    });
  }
  async function evaluate(expression) {
    const r = await cdp('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function waitFor(expression, ms=15000) {
    const start = Date.now();
    while (Date.now()-start < ms) {
      try {if (await evaluate(expression)) return;} catch { /* document may be navigating */ }
      await new Promise(r=>setTimeout(r,100));
    }
    throw Error(`Timed out: ${expression}`);
  }
  async function click(selector) {
    const p = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
  }
  async function key(key) {
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code:key===' '?'Space':key,text:key==='Enter'?'\r':undefined,windowsVirtualKeyCode:key==='Enter'?13:key===' '?32:undefined});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key});
  }
  async function theme(mode) {
    if (!await evaluate(`document.body.classList.contains('quarto-${mode}')`)) await click('.quarto-color-scheme-toggle');
    await waitFor(`document.body.classList.contains('quarto-${mode}') && getComputedStyle(document.documentElement).getPropertyValue('--uso-bg').trim()==='${mode==='dark'?'#111827':'#f4f6fa'}'`);
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  }
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  return {cdp,evaluate,waitFor,click,key,theme,errors,close:()=>socket.close()};
}
