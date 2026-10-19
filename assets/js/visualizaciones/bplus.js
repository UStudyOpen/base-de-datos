import {el, field, selectField, attach} from './core.js';
import {createTree, buildTree, insert, remove, search, range, height, values} from './bplus-model.js';

const reference = [12,7,30,18,3,25,9,21,15,40,1,27,33,10,5,22,36,14,28,19];
const ascending = n => Array.from({length:n},(_,i)=>i+1);
export const presets = [
  {id:'inserciones', label:'Caso A · veinte inserciones', policy:false,
    description:'Orden d=2. Inicio vacío; la política elegida se aplica a las veinte inserciones.',
    start:()=>createTree(), operations:reference.map(key=>['insert',key])},
  {id:'eliminaciones', label:'Caso B · préstamos, fusiones y contracción', policy:false,
    description:'Base: Caso A construido sin redistribución. Eliminar 14, 19, 18, 15, 1 y 3; prioridad izquierda–derecha.',
    start:()=>buildTree(reference), operations:[14,19,18,15,1,3].map(key=>['remove',key])},
  {id:'busquedas', label:'Buscar 22, buscar 23 y rango [10,25]', policy:false,
    description:'Base: Caso A sin redistribución. Dos búsquedas por valor y un recorrido por hojas enlazadas.',
    start:()=>buildTree(reference), operations:[['search',22],['search',23],['range',10,25]]},
  {id:'split', label:'Split de raíz y regreso a una hoja', policy:false,
    description:'Base: insertar 12, 7, 30, 18. Luego insertar 3, buscar 18, eliminar 3 y eliminar 7.',
    start:()=>buildTree([12,7,30,18]), operations:[['insert',3],['search',18],['remove',3],['remove',7]]},
  {id:'redistribucion', label:'Caso C · evitar un split de hoja', policy:true,
    description:'Base: insertar 10,20,30,40,50,60 sin redistribución. Insertar 45; compara ambas políticas.',
    start:()=>buildTree([10,20,30,40,50,60]), operations:[['insert',45]]},
  {id:'internos', label:'Caso C · redistribución interna', policy:true,
    description:'Base: insertar 1…32 con redistribución. Insertar 33 desborda un directorio; compara ambas políticas.',
    start:()=>buildTree(ascending(32),2,{redistribute:true}), operations:[['insert',33]]},
  {id:'prestamo', label:'Préstamo interno desde la derecha', policy:false,
    description:'Base: insertar 1…40 sin redistribución y eliminar 1…24. Eliminar 25 provoca préstamo de un hijo entre directorios.',
    start:()=>ascending(24).reduce((tree,key)=>remove(tree,key).tree,buildTree(ascending(40))), operations:[['remove',25]]},
  {id:'frontera', label:'Separador válido después de eliminar su dato', policy:false,
    description:'Base: insertar 2,4,10,12,14. Eliminar 10 sin underflow y buscarlo: el separador 10 permanece.',
    start:()=>buildTree([2,4,10,12,14]), operations:[['remove',10],['search',10]]},
  {id:'vacio', label:'Árbol vacío · operaciones propias', policy:false,
    description:'Orden d=2. Hoja raíz vacía. Introduce una clave para comenzar.',
    start:()=>createTree(), operations:[]},
];
export function execute(tree, [operation,key,upper], redistribute) {
  if (operation==='insert') return insert(tree,key,{redistribute});
  if (operation==='remove') return remove(tree,key);
  if (operation==='search') return search(tree,key);
  if (operation==='range') return range(tree,key,upper);
  throw new Error('Operación desconocida.');
}
export function exampleTrace(preset, redistribute) {
  let tree=preset.start();
  const steps=[{tree,operation:'Preparación',key:'',action:'inicio',nodeIds:[tree.root],path:[],transient:null,explanation:preset.description}];
  for (const operation of preset.operations) {
    const result=execute(tree,operation,redistribute);
    steps.push(...result.steps); tree=result.tree;
  }
  return steps;
}
function svgElement(tag, attributes = {}, text) {
  const element=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key,value] of Object.entries(attributes)) element.setAttribute(key,String(value));
  if (text!==undefined) element.textContent=text;
  return element;
}
// Layout retains readable cell sizes; only the labelled container scrolls.
export function renderTree(step) {
  const {tree}=step, positions=new Map(), sizes=new Map();
  const cell=Math.max(48,...Object.values(tree.nodes).flatMap(p=>p.keys.map(k=>String(k).length*9+22)));
  const own=p=>Math.max(96,p.keys.length*cell+(p.leaf ? 12 : 32));
  function measure(id) {
    const p=tree.nodes[id];
    const width=p.leaf ? own(p) : Math.max(own(p),p.children.reduce((sum,c)=>sum+measure(c),0)+(p.children.length-1)*32);
    sizes.set(id,width); return width;
  }
  const width=measure(tree.root)+48, svgHeight=height(tree)*132+148;
  function place(id,left,depth) {
    const p=tree.nodes[id], w=own(p), span=sizes.get(id);
    positions.set(id,{x:left+(span-w)/2,y:40+depth*132,w});
    if (!p.leaf) {
      const total=p.children.reduce((sum,c)=>sum+sizes.get(c),0)+(p.children.length-1)*32;
      let x=left+(span-total)/2;
      for (const c of p.children) {place(c,x,depth+1); x+=sizes.get(c)+32;}
    }
  }
  place(tree.root,24,0);
  const svg=svgElement('svg',{viewBox:`0 0 ${width} ${svgHeight}`,width,height:svgHeight,role:'img','aria-label':`Árbol B+ de orden ${tree.d}, altura ${height(tree)}. ${step.transient ? 'Estado transitorio.' : 'Estado estable.'}`,class:'db-bplus-svg'});
  svg.append(svgElement('title',{},`${step.operation}: ${step.key}. ${step.explanation}`));
  const edges=svgElement('g',{'aria-hidden':'true'}), cards=svgElement('g',{'aria-hidden':'true'});
  svg.append(edges,cards);
  for (const p of Object.values(tree.nodes)) {
    const {x,y,w}=positions.get(p.id);
    const active=step.nodeIds.includes(p.id), visited=step.path.includes(p.id), transient=step.transient?.nodeId===p.id;
    if (!p.leaf) p.children.forEach((id,i)=>{
      const child=positions.get(id), start=x+16+i*(w-32)/Math.max(1,p.keys.length);
      const route=step.path.includes(p.id) && (step.path.includes(id) || step.nodeIds.includes(id));
      edges.append(svgElement('path',{d:`M ${start} ${y+42} L ${child.x+child.w/2} ${child.y-17}`,class:route ? 'db-bplus-edge db-bplus-route' : 'db-bplus-edge'}));
    });
    if (p.leaf && p.next) {
      const next=positions.get(p.next), from=x+w+3, to=next.x-3, linkY=y+20;
      edges.append(svgElement('path',{d:`M ${from+5} ${linkY-4} L ${from} ${linkY} L ${from+5} ${linkY+4} M ${from} ${linkY} H ${to} M ${to-5} ${linkY-4} L ${to} ${linkY} L ${to-5} ${linkY+4}`,class:'db-bplus-leaf-link'}));
    }
    const group=svgElement('g',{class:`db-bplus-node${active ? ' is-active' : ''}${visited ? ' is-visited' : ''}${transient ? ' is-transient' : ''}`});
    group.append(svgElement('text',{x,y:y-12,class:'db-bplus-label'},`${p.id}${p.id===tree.root ? ' · raíz' : p.leaf ? ' · hoja' : ' · directorio'}${active ? ' · activa' : ''}`));
    group.append(svgElement('rect',{x,y,width:w,height:42,rx:5,class:'db-bplus-page'}));
    const offset=p.leaf ? 6 : 16;
    p.keys.forEach((key,i)=>{
      group.append(svgElement('rect',{x:x+offset+i*cell+2,y:y+5,width:cell-4,height:32,rx:3,class:p.leaf ? 'db-bplus-key' : 'db-bplus-separator'}));
      group.append(svgElement('text',{x:x+offset+(i+.5)*cell,y:y+26,'text-anchor':'middle',class:'db-bplus-value'},String(key)));
    });
    if (!p.keys.length) group.append(svgElement('text',{x:x+w/2,y:y+26,'text-anchor':'middle',class:'db-bplus-value'},p.leaf ? '∅' : '1 hijo'));
    if (!p.leaf) p.children.forEach((_,i)=>group.append(svgElement('circle',{cx:x+16+i*(w-32)/Math.max(1,p.keys.length),cy:y+42,r:3,class:'db-bplus-pointer'})));
    group.append(svgElement('text',{x,y:y+63,class:'db-bplus-label'},`${p.keys.length}/${2*tree.d} ${p.leaf ? 'entradas' : 'separadores'}${transient ? ' · transitorio' : ''}`));
    cards.append(group);
  }
  return svg;
}
function pageDescription(step) {
  const lines=[], {tree}=step;
  let level=[tree.root], depth=0;
  while (level.length) {
    lines.push(el('p',`Nivel ${depth}: ${level.map(id=>`${id} [${tree.nodes[id].keys.join(', ')}]`).join(' · ')}`));
    level=level.flatMap(id=>tree.nodes[id].children ?? []); depth++;
  }
  const leaves=Object.values(tree.nodes).filter(p=>p.leaf);
  lines.push(el('p',`Enlaces de hojas: ${leaves.sort((a,b)=>positionsInLeaves(tree,a.id)-positionsInLeaves(tree,b.id)).map(p=>p.id).join(' ↔ ')}. Extremos con enlace nulo.`));
  return lines;
}
function positionsInLeaves(tree,id) {
  let p=tree.nodes[id], count=0;
  while(p.prev) {count++; p=tree.nodes[p.prev];} return count;
}
export function parseKey(raw) {
  if (!/^[+-]?\d+$/.test(raw.trim())) throw new Error('Escribe una clave entera, sin decimales ni notación exponencial.');
  const key=Number(raw);
  if (!Number.isSafeInteger(key)) throw new Error('La clave excede el intervalo de enteros seguros.');
  return key;
}
export function init(root) {
  attach(root,()=>{
    const box=el('section',undefined,'db-bplus'); box.append(el('h3','Explorar árboles B+'));
    const setup=el('div',undefined,'db-viz-form');
    const preset=selectField('Ejemplo',presets.map(p=>[p.id,p.label]));
    const policy=selectField('Política de inserción',[['plain','Ordinaria · sin redistribución'],['redistribute','Con redistribución · derecha, luego izquierda']]);
    setup.append(preset.wrapper,policy.wrapper);
    const description=el('p'), policyNote=el('p','Al eliminar: préstamo izquierdo, luego derecho; fusión con izquierdo si existe. Solo hermanos del mismo padre.');
    const form=el('form',undefined,'db-viz-form');
    const operation=selectField('Operación nueva',[['search','Buscar'],['insert','Insertar'],['remove','Eliminar'],['range','Buscar rango cerrado']]);
    const key=field('Clave entera / límite inferior','22'), upper=field('Límite superior del rango','25');
    key.input.inputMode=upper.input.inputMode='text';
    const submit=el('button','Ejecutar desde el estado mostrado'); submit.type='submit';
    const error=el('p','','db-viz-error'); error.setAttribute('role','alert');
    form.append(operation.wrapper,key.wrapper,upper.wrapper,submit,error);
    const controls=el('div',undefined,'db-viz-controls');
    const reset=el('button','Reiniciar'), previous=el('button','Anterior'), next=el('button','Siguiente');
    for (const b of [reset,previous,next]) {b.type='button'; controls.append(b);}
    const live=el('p','','db-viz-status'); live.setAttribute('aria-live','polite'); live.setAttribute('aria-atomic','true');
    const explanation=el('p'), condition=el('p',undefined,'db-bplus-condition');
    const legend=el('p','Celdas azules: separadores. Celdas blancas: datos. Borde grueso y etiqueta «activa»: página afectada. Borde discontinuo: ocupación transitoria. Flechas ↔: enlaces entre hojas.','db-bplus-legend');
    const region=el('div',undefined,'db-viz-scroll db-bplus-scroll');
    region.tabIndex=0; region.setAttribute('role','region'); region.setAttribute('aria-label','Diagrama del árbol B+. Desplazamiento horizontal con teclado cuando sea necesario.');
    const focusControls=el('div',undefined,'db-viz-controls');
    const focusRoot=el('button','Centrar raíz'), focusActive=el('button','Centrar página activa');
    for(const b of [focusRoot,focusActive]) {b.type='button';focusControls.append(b);}
    const scrollHint=el('p','Si el árbol supera el ancho disponible, desplázate dentro del diagrama o centra una página.','db-bplus-legend');
    const details=el('details'), summary=el('summary','Estructura textual por niveles y enlaces'); details.append(summary);
    const textual=el('div'); details.append(textual);
    box.append(setup,description,policyNote,form,controls,live,explanation,condition,legend,focusControls,scrollHint,region,details);
    let steps=[], position=0;
    function center(id) {
      const groups=region.querySelectorAll('.db-bplus-node');
      const group=[...groups].find(g=>g.firstElementChild.textContent.startsWith(id+' ·'));
      if (!group) return;
      const card=group.querySelector('rect');
      region.scrollLeft=Number(card.getAttribute('x'))+Number(card.getAttribute('width'))/2-region.clientWidth/2;
    }
    function draw() {
      const step=steps[position];
      region.replaceChildren(renderTree(step));
      textual.replaceChildren(...pageDescription(step));
      live.textContent=`Paso ${position} de ${steps.length-1} · ${step.operation}${step.key!=='' ? ' '+step.key : ''} · ${step.transient ? 'Estado transitorio' : 'Estado estable'}.`;
      explanation.textContent=step.explanation;
      condition.textContent=`Orden d=${step.tree.d} · altura ${height(step.tree)} · ${values(step.tree).length} claves · ${Object.keys(step.tree.nodes).length} páginas. ${step.transient ? `${step.transient.nodeId} requiere reparación antes de ejecutar otra operación.` : 'Se puede iniciar una operación desde este estado.'}${step.matches ? ` Resultado acumulado: [${step.matches.join(', ')}].` : ''}`;
      reset.disabled=previous.disabled=position===0; next.disabled=position===steps.length-1;
      submit.disabled=Boolean(step.transient);
      upper.input.disabled=operation.input.value!=='range';
      focusActive.disabled=!step.nodeIds.length;
      // The first draw is built detached by attach(); center after it is mounted.
      requestAnimationFrame(()=>center(step.nodeIds.at(-1) ?? step.tree.root));
    }
    function load() {
      const selected=presets.find(p=>p.id===preset.input.value);
      // Calculate before replacing the current valid timeline.
      const calculated=exampleTrace(selected,policy.input.value==='redistribute');
      steps=calculated; position=0; description.textContent=selected.description; error.textContent=''; draw();
    }
    preset.input.onchange=()=>{policy.input.value=presets.find(p=>p.id===preset.input.value).policy ? 'redistribute' : 'plain'; load();};
    policy.input.onchange=load;
    operation.input.onchange=()=>{error.textContent=''; upper.input.disabled=operation.input.value!=='range';};
    form.onsubmit=event=>{
      event.preventDefault();
      try {
        const step=steps[position];
        if (step.transient) throw new Error('Completa el rebalanceo antes de ejecutar otra operación.');
        const k=parseKey(key.input.value), op=operation.input.value;
        if (op==='insert' && values(step.tree).length>=60) throw new Error('El explorador admite hasta 60 claves. Elimina alguna antes de insertar.');
        const args=op==='range' ? [op,k,parseKey(upper.input.value)] : [op,k];
        const result=execute(step.tree,args,policy.input.value==='redistribute');
        steps=result.steps; position=0; description.textContent='Traza nueva desde el estado estable seleccionado. Reiniciar recupera ese punto de partida.';
        error.textContent=''; draw();
      } catch (e) {error.textContent=e.message;}
    };
    reset.onclick=()=>{position=0;error.textContent='';draw();};
    previous.onclick=()=>{if(position>0){position--;error.textContent='';draw();}};
    next.onclick=()=>{if(position<steps.length-1){position++;error.textContent='';draw();}};
    focusRoot.onclick=()=>center(steps[position].tree.root);
    focusActive.onclick=()=>center(steps[position].nodeIds.at(-1));
    load(); return box;
  });
}
