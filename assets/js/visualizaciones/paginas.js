import {el,table,player,attach} from './core.js';

// A small fixed sequence, not a general byte-storage engine.
const t1={name:'t1',slot:1,offset:98,length:30};
const t2={name:'t2',slot:2,offset:78,length:20};
const t3={name:'t3',slot:3,offset:38,length:40};
const compactT3={...t3,offset:58};
const t4={name:'t4',slot:2,offset:28,length:30};
const descriptions=[
  ['Página vacía',[],0,[],'128 B de capacidad: 12 B de encabezado y 116 B libres. No hay slots.'],
  ['Insertar t1 (30 B)',[t1],1,[],'Se reserva slot 1 (4 B). t1 ocupa [98,128), RID (P,1). Quedan 82 B libres.'],
  ['Insertar t2 (20 B)',[t1,t2],2,[],'Se reserva slot 2. t2 ocupa [78,98), RID (P,2). Quedan 58 B libres.'],
  ['Insertar t3 (40 B)',[t1,t2,t3],3,[],'Se reserva slot 3. t3 ocupa [38,78), RID (P,3). Quedan 14 B libres entre directorio y datos.'],
  ['Eliminar t2',[t1,t3],3,[[78,98]],'Slot 2 queda reservado y libre. Hay 34 B libres en total: 14 B centrales y un hueco de 20 B. Ninguna región alcanza 30 B.'],
  ['Compactar antes de t4',[t1,compactT3],3,[],'t3 se mueve de offset 38 a 58. Su slot 3 ahora apunta a (58,40); conserva RID (P,3). Se reúnen 34 B contiguos en [24,58).'],
  ['Insertar t4 (30 B)',[t1,compactT3,t4],3,[],'t4 reutiliza slot 2 y ocupa [28,58). No crece el directorio. Quedan 4 B libres. t3 conserva RID (P,3).'],
  ['Intentar t5 (10 B)',[t1,compactT3,t4],3,[],'Rechazo sin cambios: t5 necesita 10 B de datos y un nuevo slot de 4 B; solo hay 4 B libres. Compactar otra vez no agrega capacidad.']
];
function freeze(value){if(value && typeof value==='object' && !Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const pageStates=freeze(descriptions.map(([operation,records,slotCount,holes,explanation],step)=>{
  const directoryEnd=12+4*slotCount,firstRecord=Math.min(128,...records.map(r=>r.offset));
  const freeTotal=128-directoryEnd-records.reduce((s,r)=>s+r.length,0),centralFree=firstRecord-directoryEnd;
  return {step,operation,explanation,capacity:128,header:12,slotBytes:4,slotCount,directoryEnd,records,holes,freeTotal,centralFree,largestFree:Math.max(centralFree,...holes.map(([a,b])=>b-a))};
}));
const ns='http://www.w3.org/2000/svg';
function svgEl(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
function diagram(s) {
  const svg=svgEl('svg',{viewBox:'0 0 808 155',width:808,height:155,role:'img','aria-label':`${s.operation}: página P, 128 bytes, ${s.freeTotal} libres en total.`,class:'db-page-svg'});
  svg.append(svgEl('title',{},s.operation),svgEl('desc',{},s.explanation));
  const segments=[{start:0,end:12,label:'Header',type:'header'}];
  for(let i=1;i<=s.slotCount;i++)segments.push({start:12+4*(i-1),end:12+4*i,label:String(i),type:'slot'});
  if(s.centralFree)segments.push({start:s.directoryEnd,end:s.directoryEnd+s.centralFree,label:`${s.centralFree}`,type:'free'});
  for(const [a,b]of s.holes)segments.push({start:a,end:b,label:'Hueco',type:'hole'});
  for(const r of s.records)segments.push({start:r.offset,end:r.offset+r.length,label:r.name,type:'record'});
  segments.forEach(({start,end,label,type})=>{
    const g=svgEl('g',{'data-start':start,'data-end':end,class:`db-page-${type}`});
    g.append(svgEl('title',{},`${type}: [${start},${end}), ${end-start} bytes`),svgEl('rect',{x:20+start*6,y:36,width:(end-start)*6,height:72}),svgEl('text',{x:20+(start+end)*3,y:77,'text-anchor':'middle'},label));
    svg.append(g);
  });
  svg.append(svgEl('text',{x:20,y:24},'Página P · offsets desde 0'),svgEl('text',{x:20,y:137},'0'),svgEl('text',{x:788,y:137,'text-anchor':'end'},'128 bytes'));
  const region=el('div',undefined,'db-viz-scroll db-page-scroll');region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label','Distribución de los 128 bytes; desplazamiento horizontal');region.append(svg);return region;
}
export function init(root) {
  attach(root,()=>{
    const panel=el('div',undefined,'db-pages');
    panel.append(player(pageStates,s=>{
      panel.dataset.position=String(s.step);
      const box=el('div');box.append(el('p',s.operation,'db-buffer-operation'));
      const counts=el('p',`Capacidad: 128 B · Header: 12 B · Directorio: ${s.slotCount*4} B · Libre total: ${s.freeTotal} B · Libre central: ${s.centralFree} B · Mayor región libre: ${s.largestFree} B`,'db-page-counts');
      box.append(counts,diagram(s));
      box.append(el('p','Header y slots crecen desde la izquierda; registros desde la derecha. Blanco: libre central. Hueco: bytes liberados; se distinguen por borde discontinuo. Los números 1, 2, 3 son slots del directorio.'));
      const rows=Array.from({length:s.slotCount},(_,i)=>{
        const r=s.records.find(r=>r.slot===i+1);return [i+1,r?.name??'Libre reservado',r?`(P,${r.slot})`:'—',r?.offset??'—',r?.length??'—'];
      });
      box.append(table('Directorio de slots · offsets físicos en bytes',['Slot','Registro','RID','Offset','Longitud'],rows));return box;
    }));return panel;
  });
}
