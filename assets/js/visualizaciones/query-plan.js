import {el,selectField,table,attach} from './core.js';
import {examples,exampleTrace,comparePlans,validatePlan,predicateText,frequencies} from './query-plan-model.js';
const symbols={table:'Relación',project:'π · Proyección',select:'σ · Selección',product:'× · Producto',join:'⋈ · Join',natural:'⋈ · Natural join',delta:'δ · Sin duplicados',group:'γ · Agregación',union:'⊎ · Unión aditiva',intersect:'∩ · Intersección',difference:'∖ · Diferencia',rename:'ρ · Renombramiento'};
const svgNS='http://www.w3.org/2000/svg';
function svgEl(tag,attributes={},text) {
  const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attributes))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;
}
function lines(text,limit=30) {
  const result=[];let line='';
  for(const word of text.split(/\s+/)) {
    if(line && (line+' '+word).length>limit) { result.push(line);line=word; }else line+=(line?' ':'')+word;
  }
  if(line)result.push(line);return result;
}
function parameters(n) {
  if(n.type==='table')return n.name;
  if(n.predicate)return predicateText(n.predicate);
  if(n.type==='project')return n.attributes.join(', ');
  if(n.type==='group')return `${n.groups.join(', ') || 'global'}; ${n.aggregates.map(a=>`${a.fn}(${a.attribute??'*'}) → ${a.as}`).join(', ')}`;
  return '';
}
function nodes(plan) {return [plan,...plan.children.flatMap(nodes)];}
function signature(n) {return JSON.stringify({...n,children:n.children.map(c=>c.id)});}
function tree(plan,other,metrics,caption) {
  const otherNodes=new Map(nodes(other).map(n=>[n.id,signature(n)])),validation=validatePlan(plan),invalid=new Set(validation.errors.map(e=>e.nodeId));
  const items=[],levelHeight=[];let leaf=0;
  function layout(n,depth) {
    const children=n.children.map(c=>layout(c,depth+1));
    const content=[...lines(parameters(n)),...lines(`Produce: ${n.schema.join(', ') || '()'}`),...lines(`Requiere: ${n.required.join(', ') || '∅'}`)];
    const h=64+content.length*20;
    const x=children.length?children.reduce((s,c)=>s+c.x,0)/children.length:24+leaf++*300;
    const item={n,depth,children,x,h,content};items.push(item);levelHeight[depth]=Math.max(levelHeight[depth]??0,h);return item;
  }
  const rootItem=layout(plan,0);const y=[],width=Math.max(330,leaf*300+24);let height=24;
  levelHeight.forEach((h,d)=>{y[d]=height;height+=h+48;});
  const svg=svgEl('svg',{class:'db-plan-svg',width,height,viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':caption});
  svg.append(svgEl('title',{},caption),svgEl('desc',{},'Árbol lógico. Las aristas conectan un operador con sus entradas inferiores. La descripción textual detalla los mismos nodos.'));
  for(const item of items)for(const c of item.children)svg.append(svgEl('path',{d:`M ${item.x+135} ${y[item.depth]+item.h} V ${y[c.depth]-24} H ${c.x+135} V ${y[c.depth]}`,class:'db-plan-edge'}));
  for(const {n,x,h,depth,content} of items) {
    const changed=otherNodes.get(n.id)!==signature(n);
    const g=svgEl('g',{class:`db-plan-node db-plan-${n.type}${changed?' is-changed':''}${invalid.has(n.id)?' is-invalid':''}`,'data-node-id':n.id,'data-type':n.type});
    g.append(svgEl('title',{},`${n.id}. ${symbols[n.type]}. ${content.join(' ')}${invalid.has(n.id)?'. Atributo ausente.':''}`));
    g.append(svgEl('rect',{x,y:y[depth],width:270,height:h,rx:n.type==='select'?18:6}));
    g.append(svgEl('text',{x:x+12,y:y[depth]+25,class:'db-plan-value'},symbols[n.type]??n.type));
    content.forEach((line,i)=>g.append(svgEl('text',{x:x+12,y:y[depth]+48+i*20,class:'db-plan-label'},line)));
    const count=metrics?.[n.id];g.append(svgEl('text',{x:x+12,y:y[depth]+h-8,class:'db-plan-label'},count?`${count.rows} filas · ${count.columns} atributos`:'Sin evaluación'));
    svg.append(g);
  }
  const region=el('div',undefined,'db-viz-scroll db-plan-scroll');region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label',caption+'; desplazamiento horizontal y vertical');region.append(svg);region.dataset.rootX=rootItem.x;
  return region;
}
function textTree(plan) {
  const pre=el('pre');
  const visit=(n,depth)=>`${'  '.repeat(depth)}${symbols[n.type]} ${parameters(n)} [${n.id}]\n${'  '.repeat(depth)}  Produce: ${n.schema.join(', ') || '()'}; requiere: ${n.required.join(', ') || '∅'}\n${n.children.map(c=>visit(c,depth+1)).join('')}`;
  pre.textContent=visit(plan,0);return pre;
}
function centerTree(region) {
  const x=Number(region.dataset.rootX);region.scrollLeft=region.clientWidth<294?x-12:x+135-region.clientWidth/2;region.scrollTop=0;
}
function tuple(row) {return Object.entries(row).map(([k,v])=>`${k}: ${v===null?'NULL':v}`).join('; ') || '()';}
function resultTable(caption,result) {
  return result?table(caption,['Tupla','Multiplicidad'],frequencies(result.rows).map(x=>[tuple(x.row),x.count])):el('p','Sin resultado: el plan está mal definido.','db-viz-error');
}
export function init(root) {
  if(root.dataset.dbReady)return;
  attach(root,()=>{
    let trace=exampleTrace(root.dataset.queryExample??'valido'),position=0;
    const panel=el('div',undefined,'db-query-plan'),choice=selectField('Ejemplo',examples.map(e=>[e.id,e.name]));
    const form=el('div',undefined,'db-viz-form');form.append(choice.wrapper);
    const controls=el('div',undefined,'db-viz-controls');
    const buttons=['Reiniciar','Anterior','Siguiente'].map(name=>{const b=el('button',name);b.type='button';controls.append(b);return b;});
    const live=el('p','', 'db-viz-status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
    const content=el('div');
    panel.append(el('h3','Explorador de planes lógicos'),form,controls,live,content);
    const draw=()=>{
      const step=trace.steps[position],comparison=comparePlans(step.before,step.after,trace.data);
      panel.dataset.position=position;panel.dataset.example=trace.id;panel.dataset.classification=step.classification;
      live.textContent=`Paso ${position} de ${trace.steps.length-1}. ${step.ruleName}. Estado: ${step.classification}.`;
      const rule=el('p',step.explanation,'db-plan-explanation');
      const conditions=el('p',`Precondiciones: ${step.preconditions}`);
      const preserve=el('p',`Atributos que deben preservarse: ${step.preserve.join(', ') || '∅'}.`);
      const legend=el('p','π proyección · σ selección · × producto · ⋈ join · δ duplicados · γ agregación. Borde discontinuo: nodo modificado. Borde de error: referencia ausente. Leer de las hojas a la raíz.','db-plan-legend');
      const diagrams=el('div',undefined,'db-plan-comparison');
      for(const [plan,other,result,caption] of [[step.before,step.after,comparison.original,'Plan anterior'],[step.after,step.before,comparison.modified,'Plan propuesto']]) {
        const figure=el('figure'),region=tree(plan,other,result?.metrics,caption);
        const center=el('button',`Centrar raíz del ${caption.toLowerCase()}`);center.type='button';center.onclick=()=>centerTree(region);
        figure.append(el('figcaption',caption),center,region);
        const details=el('details');details.append(el('summary',`Descripción textual: ${caption.toLowerCase()}`),textTree(plan));figure.append(details);diagrams.append(figure);
      }
      const results=el('div',undefined,'db-plan-results');
      results.append(el('h4','Comparación de resultados'),el('p',comparison.classification+'. Esta comprobación finita no demuestra una equivalencia universal.'));
      if(comparison.errors.length) {
        const error=el('p',comparison.errors.map(e=>e.message).join(' '),'db-viz-error');error.setAttribute('role','status');results.append(error);
      }
      if(comparison.modified)results.append(table('Frecuencia de cada tupla en ambos planes',['Tupla','Anterior','Propuesto','Cambio'],comparison.difference.map(x=>[tuple(x.row),x.before,x.after,x.after-x.before])));
      else results.append(resultTable('Resultado del plan anterior',comparison.original),resultTable('Resultado del plan propuesto',comparison.modified));
      const baseData=el('details');baseData.append(el('summary','Datos de entrada (ocurrencias)'));
      for(const [name,rows] of Object.entries(trace.data)) {
        const schema=nodes(step.before).find(n=>n.type==='table'&&n.name===name)?.schema??Object.keys(rows[0]??{});
        baseData.append(table(`Relación ${name}`,schema,rows.map(row=>schema.map(x=>row[x]))));
      }
      content.replaceChildren(rule,conditions,preserve,legend,diagrams,results,baseData);
      requestAnimationFrame(()=>panel.querySelectorAll('.db-plan-scroll').forEach(centerTree));
      buttons[0].disabled=buttons[1].disabled=position===0;buttons[2].disabled=position===trace.steps.length-1;
    };
    buttons[0].onclick=()=>{position=0;draw();};buttons[1].onclick=()=>{if(position>0){position--;draw();}};buttons[2].onclick=()=>{if(position<trace.steps.length-1){position++;draw();}};
    let observedWidth=0;
    const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width!==observedWidth){observedWidth=entry.contentRect.width;panel.querySelectorAll('.db-plan-scroll').forEach(centerTree);}});observer.observe(panel);
    choice.input.value=trace.id;choice.input.onchange=()=>{trace=exampleTrace(choice.input.value);position=0;draw();};draw();return panel;
  });
}
