import {el,field,selectField,table,attach} from './core.js';
import {traceBuffer,operationText,presets,pin,unpin,priority} from './buffer-model.js';

const names={inicio:'Inicio',hit:'Hit',miss:'Miss atendido',unpin:'Liberación',rechazo:'Solicitud rechazada'};
const pagesText=s=>s.frames.filter(f=>f.pageId!==null).map(f=>f.pageId).join(', ')||'∅';
export function init(root) {
  attach(root,()=>{
    const panel=el('div',undefined,'db-buffer');
    const selectors=el('div',undefined,'db-viz-form');
    const policy=selectField('Política',[['FIFO','FIFO'],['LRU','LRU']]);
    const size=selectField('Cantidad de frames',Array.from({length:8},(_,i)=>[String(i+1),String(i+1)]));size.input.value='3';
    const example=selectField('Secuencia',presets.map(p=>[p.id,p.name]));example.input.value=root.dataset.bufferExample??'principal';
    if(!presets.some(p=>p.id===example.input.value))example.input.value='principal';
    selectors.append(policy.wrapper,size.wrapper,example.wrapper);
    const controls=el('div',undefined,'db-viz-controls');
    const buttons=['Reiniciar','Anterior','Siguiente'].map(name=>{const b=el('button',name);b.type='button';controls.append(b);return b;});
    const status=el('p','', 'db-viz-status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
    const content=el('div');
    const manual=el('details',undefined,'db-buffer-manual');manual.append(el('summary','Probar una operación propia'));
    manual.append(el('p','Se conserva el prefijo visible y se reemplaza su futuro. Máximo: 120 operaciones. No se hace flush automático.'));
    const form=el('form',undefined,'db-viz-form');
    const action=selectField('Operación',[['pin','pin(p)'],['clean','unpin(p, false)'],['dirty','unpin(p, true)']]);
    const page=field('PageID','A');page.input.maxLength=16;page.input.autocomplete='off';
    const submit=el('button','Agregar operación');submit.type='submit';
    const error=el('p','', 'db-viz-error');error.setAttribute('role','status');
    form.append(action.wrapper,page.wrapper,submit,error);manual.append(form);
    let position=0,operations=[],traces={},custom=false;
    function rebuild() {
      const n=Number(size.input.value);
      traces={FIFO:traceBuffer(operations,n,'FIFO'),LRU:traceBuffer(operations,n,'LRU')};
      if(example.input.value==='belady' && !custom)for(const p of ['FIFO','LRU'])for(const count of [3,4])traces[p+count]=traceBuffer(operations,count,p);
    }
    function load() {operations=[...presets.find(p=>p.id===example.input.value).operations];position=0;custom=false;error.textContent='';rebuild();draw();}
    function draw() {
      const snapshot=traces[policy.input.value][position],{state,event}=snapshot;
      panel.dataset.position=String(position);panel.dataset.policy=state.policy;panel.dataset.example=custom?'manual':example.input.value;panel.dataset.frames=String(state.frames.length);
      buttons[0].disabled=buttons[1].disabled=position===0;buttons[2].disabled=position===operations.length;
      status.textContent=`Paso ${position} de ${operations.length}. ${operationText(snapshot.operation)}. ${names[event.result]}.`;
      content.replaceChildren();
      const title=el('p',`${operationText(snapshot.operation)} · ${names[event.result]}`,'db-buffer-operation');
      title.dataset.result=event.result;if(event.result==='rechazo')title.classList.add('db-viz-error');
      const counts=el('div',undefined,'db-buffer-counts');
      for(const [name,value,label] of [['reads',state.reads,'Lecturas'],['writes',state.writes,'Escrituras'],['hits',state.hits,'Hits'],['misses',state.misses,'Misses atendidos']]) {
        const item=el('p',`${label}: `);const valueNode=el('strong',String(value));valueNode.dataset.counter=name;item.append(valueNode);counts.append(item);
      }
      const pending=state.frames.filter(f=>f.dirty).map(f=>f.pageId);
      content.append(title,counts,el('p',`Dirty pendientes en RAM: ${pending.join(', ')||'ninguna'}. Sin flush final.`,'db-buffer-pending'),el('p',snapshot.explanation,'db-buffer-explanation'));
      if(position>0) {
        content.append(el('p',`E/S de esta operación: ${event.reads} lectura(s), ${event.writes} escritura(s). ${event.victim?`Víctima: ${event.victim.pageId} en frame ${event.victim.frame}, pin 0, ${event.victim.dirty?'dirty → se escribe primero':'clean → sin escritura'}.`:'Sin víctima.'}`,'db-buffer-io'));
        content.append(el('p',`Elegibles antes de operar (${state.policy}): ${event.candidates.join(' → ')||'ninguna'}.`,'db-buffer-candidates'));
      }
      const frames=el('div',undefined,'db-buffer-frames');frames.setAttribute('role','group');frames.setAttribute('aria-label','Buffer pool en RAM');
      state.frames.forEach((f,i)=>{
        const card=el('div',undefined,`db-buffer-frame${event.frame===i?' is-active':''}${f.pinCount>0?' is-pinned':''}${f.dirty?' is-dirty':''}`);
        card.setAttribute('role','group');card.setAttribute('aria-label',`Frame ${i}`);
        Object.assign(card.dataset,{frame:String(i),page:f.pageId??'',pins:String(f.pinCount),dirty:String(f.dirty)});
        card.append(el('p',`Frame ${i}${event.frame===i?' · activo':''}`,'db-buffer-frame-title'),el('p',f.pageId??'Libre','db-buffer-page'));
        card.append(el('p',`pinCount: ${f.pinCount} · ${f.pinCount>0?'Fijada: protegida':f.pageId===null?'Disponible':'Elegible'}`));
        card.append(el('p',`dirty: ${f.dirty?'true · * modificada':'false · clean'}`));
        card.append(el('p',`Carga: ${f.ordenDeCarga??'—'} · Último pin: ${f.ultimoAcceso??'—'}`));frames.append(card);
      });
      content.append(frames,el('p',`Prioridad actual ${state.policy}, antigua → reciente: ${priority(state).map(f=>`${f.pageId}${f.pinCount?' (protegida)':''}`).join(' → ')||'∅'}.`,'db-buffer-order'));
      const disk=el('div',undefined,'db-buffer-disk');disk.append(el('strong','Disco · repositorio de páginas'));
      const list=el('ul');for(const p of [...new Set(operations.map(o=>o.pageId))]) {
        const frame=state.frames.find(f=>f.pageId===p);
        list.append(el('li',`${p}: ${frame?`copia en RAM${frame.dirty?', cambios pendientes':''}`:'solo disco'}`));
      }disk.append(list);content.append(disk);
      content.append(table(`FIFO y LRU · mismo prefijo de ${position} operaciones, ${state.frames.length} frames`,['Política','Páginas residentes','Lecturas','Escrituras'],['FIFO','LRU'].map(p=>{
        const s=traces[p][position].state;return [p,pagesText(s),s.reads,s.writes];
      })));
      if(example.input.value==='belady' && !custom) {
        const comparison=table(`Belady · ${Math.floor(position/2)} solicitudes usar completas${position%2?', pin actual aún fijado':''}`,['Política / frames','Conjunto residente','Lecturas'],['FIFO3','FIFO4','LRU3','LRU4'].map(key=>{const s=traces[key][position].state;return [key,`{${pagesText(s)}}`,s.reads];}));
        comparison.classList.add('db-buffer-belady');content.append(comparison);
      }
      const history=el('details',undefined,'db-buffer-history');history.append(el('summary','Traza completa de operaciones'));
      history.append(table('Snapshots: página/pins/dirty; * significa dirty',['Paso','Operación','Frames','Resultado / víctima','L','E'],traces[state.policy].map(s=>[s.step,operationText(s.operation),s.state.frames.map(f=>f.pageId===null?'—':`${f.pageId}/${f.pinCount}/${f.dirty?'*':'0'}`).join(' | '),`${names[s.event.result]}${s.event.victim?` / ${s.event.victim.pageId}`:''}`,s.state.reads,s.state.writes])));content.append(history);
    }
    buttons[0].onclick=()=>{position=0;draw();};buttons[1].onclick=()=>{position--;draw();};buttons[2].onclick=()=>{position++;draw();};
    policy.input.onchange=()=>{error.textContent='';draw();};size.input.onchange=()=>{error.textContent='';rebuild();draw();};example.input.onchange=load;
    form.onsubmit=e=>{
      e.preventDefault();const p=page.input.value;
      if(!/^[A-Za-z0-9_]{1,16}$/.test(p)){error.textContent='PageID inválido: use 1–16 letras ASCII, dígitos o guiones bajos.';return;}
      if(position>=120){error.textContent='Límite de 120 operaciones: reinicie o retroceda antes de agregar otra.';return;}
      operations=[...operations.slice(0,position),action.input.value==='pin'?pin(p):unpin(p,action.input.value==='dirty')];
      position++;custom=true;error.textContent='';rebuild();draw();
    };
    panel.append(selectors,controls,status,content,manual);load();return panel;
  });
}
