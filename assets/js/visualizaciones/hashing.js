import {el,field,selectField,attach} from './core.js';
import {immutable,limits,createStatic,createExtendable,buildStatic,buildExtendable,staticInsert,staticSearch,insert,search,remove,values,suffix,staticKeys,insertKeys,deleteKeys} from './hashing-model.js';

export const presets=[
  {id:'inserciones',label:'Caso A · inserciones',description:'B=2. Desde g=l=0: insertar 12,5,3,18,6,29,10,16,20,27.',start:()=>createExtendable(),operations:insertKeys.map(k=>['insert',k])},
  {id:'eliminaciones',label:'Caso B · eliminación y merge',description:'Partir del Caso A. Eliminar 12,16,20,10,18,5,3. Al eliminar 20 el bucket vacío no puede fusionarse.',start:()=>buildExtendable(insertKeys),operations:deleteKeys.map(k=>['remove',k])},
  {id:'alternancia',label:'Caso C · crecer y reducir',description:'Base [0,2], g=0. Insertar y eliminar 1 dos veces; una fusión como máximo por eliminación.',start:()=>buildExtendable([0,2]),operations:[['insert',1],['remove',1],['insert',1],['remove',1]]},
  {id:'colisiones',label:'Caso D · splits sucesivos',description:'Base [0,8], g=0. Insertar 16 exige cuatro splits y cuatro doublings. Después buscar 8, buscar 24 y eliminar 99.',start:()=>buildExtendable([0,8]),operations:[['insert',16],['search',8],['search',24],['remove',99]]},
  {id:'reducciones',label:'Directorio redundante · tres reducciones',description:'Estado estructuralmente válido preparado con g=3 y l=1; no procede solo de inserciones desde el inicio mínimo. Eliminar 1 fusiona una vez y reduce g de 3 a 0.',start:()=>immutable({kind:'extendable',B:2,g:3,maxDepth:8,nextId:2,directory:['H0','H1','H0','H1','H0','H1','H0','H1'],buckets:{H0:{id:'H0',l:1,s:0,keys:[0,2]},H1:{id:'H1',l:1,s:1,keys:[1]}}}),operations:[['remove',1]]},
  {id:'busquedas',label:'Búsquedas · 29 y 13',description:'Estado final del Caso A. Buscar 29 y 13: ambas claves seleccionan 101 y el mismo bucket 01.',start:()=>buildExtendable(insertKeys),operations:[['search',29],['search',13]]},
  {id:'vacio',label:'Vacío · operaciones propias',description:'B=2, g=l=0. Escribe una clave para comenzar.',start:()=>createExtendable(),operations:[]},
];
export function execute(state,[op,key]) {
  if(state.kind==='static') {
    if(op==='insert')return staticInsert(state,key);
    if(op==='search')return staticSearch(state,key);
  } else {
    if(op==='insert')return insert(state,key);
    if(op==='search')return search(state,key);
    if(op==='remove')return remove(state,key);
  }
  throw new Error('Operación no admitida.');
}
export function exampleTrace(preset) {
  let state=preset.start();
  const steps=[immutable({state,operation:'Preparación',key:null,action:'inicio',transient:false,active:[],visited:[],changed:[],explanation:preset.description})];
  for(const op of preset.operations){const result=execute(state,op);steps.push(...result.steps);state=result.state;}
  return immutable(steps);
}
export function staticPreset(N=4,query='all') {
  return {description:`B=3, h(k)=k mod ${N}. ${query==='all'?'Insertar las catorce claves y luego buscar 28,17,10,33.':`Buscar ${query} en el índice completo.`}`,
    start:()=>query==='all'?createStatic(N):buildStatic(N),
    operations:query==='all'?[...staticKeys.map(k=>['insert',k]),...[28,17,10,33].map(k=>['search',k])]:[['search',Number(query)]]};
}
function svgEl(tag,attrs={},text) {
  const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));
  if(text!==undefined)e.textContent=text;return e;
}
function label(parent,x,y,text,cls='db-hash-label') {parent.append(svgEl('text',{x,y,class:cls},text));}
function arrow(parent,x1,y1,x2,y2,active=false) {
  parent.append(svgEl('path',{d:`M ${x1} ${y1} C ${x1+60} ${y1}, ${x2-60} ${y2}, ${x2} ${y2} M ${x2-7} ${y2-4} L ${x2} ${y2} L ${x2-7} ${y2+4}`,class:`db-hash-edge${active?' is-active':''}`}));
}
export function renderState(step) {
  const s=step.state,ext=s.kind==='extendable';
  const entries=ext?s.directory.length:s.N;
  const bucketList=ext?Object.values(s.buckets).sort((a,b)=>s.directory.indexOf(a.id)-s.directory.indexOf(b.id)):[];
  const cardWidth=ext?Math.max(270,...bucketList.map(b=>b.keys.join(', ').length*9+32)):190;
  const width=ext?Math.max(700,380+cardWidth):Math.max(660,180+Math.max(...s.buckets.map(c=>c.length))*230);
  const height=ext?Math.max(180,entries*34+100,bucketList.length*104+100):s.N*108+80;
  const svg=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,width,height,role:'img',class:'db-hash-svg','aria-label':`${ext?'Hashing extensible':'Hashing estático'}. ${step.transient?'Estado transitorio':'Estado estable'}. ${step.explanation}`});
  svg.append(svgEl('title',{},`${step.operation} ${step.key??''}: ${step.action}`));
  svg.append(svgEl('desc',{},step.explanation));
  const edges=svgEl('g',{'aria-hidden':'true'}),cards=svgEl('g',{'aria-hidden':'true'});svg.append(edges,cards);
  if(ext) {
    label(cards,24,25,`Directorio: g=${s.g}, ${entries} entradas`);
    label(cards,350,25,`Buckets físicos: ${bucketList.length}; B=${s.B}`);
    const positions=new Map(bucketList.map((b,i)=>[b.id,60+i*Math.max(104,(height-150)/Math.max(1,bucketList.length-1))]));
    s.directory.forEach((id,i)=>{
      const y=60+i*34,active=i===step.index,changed=step.changed.includes(i);
      const row=svgEl('g',{class:`db-hash-ref${active?' is-active':''}${changed?' is-changed':''}`,'data-index':i,'data-target':id});
      row.append(svgEl('rect',{x:24,y:y-19,width:242,height:28,rx:4}));
      label(row,32,y,`${suffix(i,s.g)} → ${id}${active?' · destino':changed?' · actualizada':''}`,'db-hash-value');
      cards.append(row);arrow(edges,266,y-5,350,positions.get(id)+20,active||changed);
    });
    bucketList.forEach(b=>{
      const y=positions.get(b.id),active=step.active.includes(b.id),changed=active&&['split','merge'].includes(step.action);
      const name=step.action==='split'&&step.newIds?.includes(b.id)?' · nuevo':step.action==='split'&&active?' · dividido':step.action==='merge'&&active?' · fusionado':active?' · seleccionado':'';
      const group=svgEl('g',{class:`db-hash-bucket${active?' is-active':''}${changed?' is-changed':''}`,'data-bucket':b.id});
      label(group,350,y-10,`${b.id} · sufijo ${suffix(b.s,b.l)} · l=${b.l}${name}`);
      group.append(svgEl('rect',{x:350,y,width:cardWidth,height:44,rx:5}));
      label(group,364,y+28,b.keys.length?b.keys.join(', '):'∅','db-hash-value db-hash-keys');
      label(group,350,y+65,`${b.keys.length}/${s.B} entradas · ${s.directory.filter(id=>id===b.id).length} referencia(s)`);
      cards.append(group);
    });
  } else {
    label(cards,24,25,`h(k)=k mod ${s.N}; B=${s.B}`);
    s.buckets.forEach((chain,i)=>{
      const y=66+i*108;label(cards,20,y+23,`Bucket ${i}`);
      chain.forEach((page,j)=>{
        const x=130+j*230,id=`${i}:${j}`,active=step.index===i,visited=step.visited.includes(id),changed=step.changed.includes(id);
        const group=svgEl('g',{class:`db-hash-page${active?' is-active':''}${visited?' is-read':''}${changed?' is-changed':''}`,'data-page':id});
        label(group,x,y-10,`${j===0?'Principal':`Overflow ${j}`}${visited?' · leída':changed?' · nueva/actualizada':''}`);
        group.append(svgEl('rect',{x,y,width:190,height:44,rx:5}));
        label(group,x+12,y+28,page.length?page.join(', '):'∅','db-hash-value db-hash-keys');
        label(group,x,y+65,`${page.length}/${s.B} entradas`);cards.append(group);
        if(j)arrow(edges,x-40,y+22,x,y+22,active);
      });
    });
  }
  return svg;
}
export function parseKey(raw) {
  if(!/^\d+$/.test(raw.trim()))throw new Error('Escribe una clave entera no negativa, sin decimales ni exponentes.');
  const k=Number(raw);if(!Number.isSafeInteger(k)||k>limits.maxKey)throw new Error('Clave: entero entre 0 y 65535.');return k;
}
function describe(s) {
  if(s.kind==='static')return s.buckets.map((c,i)=>el('p',`Bucket ${i}: ${c.map(p=>`[${p.join(', ')}]`).join(' → ')}`));
  return [el('p',`g=${s.g}. Directorio: ${s.directory.map((id,i)=>`${suffix(i,s.g)} → ${id}`).join('; ')}.`),
    ...Object.values(s.buckets).map(b=>el('p',`${b.id}: sufijo ${suffix(b.s,b.l)}, l=${b.l}, claves [${b.keys.join(', ')}], ${s.directory.filter(id=>id===b.id).length} referencia(s).`))];
}
export function init(root) {
  attach(root,()=>{
    const ext=root.dataset.hashingMode!=='static';
    const box=el('section',undefined,'db-hashing');box.append(el('h3',`Explorar hashing ${ext?'extensible':'estático'}`));
    const setup=el('div',undefined,'db-viz-form');
    const preset=selectField('Ejemplo',ext?presets.map(p=>[p.id,p.label]):[['4','N=4 · tres overflow'],['5','N=5 · un overflow']]);
    const query=ext?null:selectField('Recorrido',[['all','Insertar y buscar'],...[28,17,10,33].map(k=>[String(k),`Buscar ${k} en estado final`])]);
    setup.append(preset.wrapper);if(query)setup.append(query.wrapper);
    const description=el('p');
    const form=el('form',undefined,'db-viz-form');
    const operation=selectField('Operación nueva',[['search','Buscar'],['insert','Insertar'],['remove','Eliminar']]);
    const key=field('Clave entera (0–65535)','29');key.input.inputMode='numeric';
    const submit=el('button','Ejecutar desde el estado mostrado');submit.type='submit';
    const error=el('p','','db-viz-error');error.setAttribute('role','alert');
    form.append(operation.wrapper,key.wrapper,submit,error);
    const controls=el('div',undefined,'db-viz-controls');
    const reset=el('button','Reiniciar'),previous=el('button','Anterior'),next=el('button','Siguiente');
    for(const b of [reset,previous,next]){b.type='button';controls.append(b);}
    const live=el('p','','db-viz-status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
    const explanation=el('p'),condition=el('p',undefined,'db-hash-condition');
    const legend=el('p','Borde grueso y etiqueta: destino. Borde discontinuo y etiqueta: cambio estructural o página actualizada. «Leída»: página examinada. Los punteros comparten tarjetas físicas. Desplaza el diagrama con teclado o barras si supera la región visible.','db-hash-legend');
    const region=el('div',undefined,'db-viz-scroll db-hash-scroll');region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label','Diagrama de hashing; desplazamiento horizontal y vertical con teclado.');
    const details=el('details'),summary=el('summary','Estructura textual completa');details.append(summary);const textual=el('div');details.append(textual);
    box.append(setup,description);if(ext)box.append(form);box.append(controls,live,explanation,condition,legend,region,details);
    let steps=[],position=0;
    function draw() {
      const step=steps[position],s=step.state;
      region.replaceChildren(renderState(step));textual.replaceChildren(...describe(s));
      live.textContent=`Paso ${position} de ${steps.length-1} · ${step.operation} ${step.key??''} · ${step.transient?'Estado transitorio':'Estado estable'}.`;
      explanation.textContent=step.explanation;
      condition.textContent=`B=${s.B} · ${values(s).length} claves · ${ext?`g=${s.g} · ${s.directory.length} referencias · ${Object.keys(s.buckets).length} buckets físicos`:`N=${s.N} · ${s.buckets.flat().length} páginas`}. ${step.transient?'Completa la operación pendiente.':'Estado disponible para operar.'}`;
      reset.disabled=previous.disabled=position===0;next.disabled=position===steps.length-1;submit.disabled=step.transient;
      box.dataset.action=step.action;box.dataset.position=position;
      // Expose the exact immutable snapshot for browser integration checks.
      box.hashingStep=step;
    }
    function load() {
      const p=ext?presets.find(p=>p.id===preset.input.value):staticPreset(Number(preset.input.value),query.input.value);
      const calculated=exampleTrace(p);steps=calculated;position=0;description.textContent=p.description;error.textContent='';region.scrollTop=region.scrollLeft=0;draw();
    }
    preset.input.onchange=load;if(query)query.input.onchange=load;
    form.onsubmit=e=>{
      e.preventDefault();
      try {
        const step=steps[position];if(step.transient)throw new Error('Completa la operación pendiente antes de operar.');
        const result=execute(step.state,[operation.input.value,parseKey(key.input.value)]);
        steps=result.steps;position=0;description.textContent='Traza nueva desde el estado seleccionado. Reiniciar vuelve a ese punto de partida.';error.textContent='';draw();
      }catch(e){error.textContent=e.message;}
    };
    reset.onclick=()=>{position=0;error.textContent='';draw();};
    previous.onclick=()=>{if(position>0){position--;error.textContent='';draw();}};
    next.onclick=()=>{if(position<steps.length-1){position++;error.textContent='';draw();}};
    operation.input.onchange=()=>{error.textContent='';};
    load();return box;
  });
}
