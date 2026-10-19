// Pure, immutable teaching model. Logical time advances only on successful pin.
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const validPage = p => typeof p === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(p);
const blank = () => ({pageId:null,pinCount:0,dirty:false,ordenDeCarga:null,ultimoAcceso:null});
export function validateBuffer(s) {
  const errors=[];
  if (!s || !['FIFO','LRU'].includes(s.policy) || !Array.isArray(s.frames) || s.frames.length<1 || s.frames.length>8) return ['Configuración de buffer inválida.'];
  for (const key of ['clock','reads','writes','hits','misses']) if (!Number.isSafeInteger(s[key]) || s[key]<0) errors.push(`Contador inválido: ${key}.`);
  if (s.reads!==s.misses || s.clock!==s.hits+s.misses || s.writes>s.reads) errors.push('Contadores de acceso incoherentes.');
  const seen=new Set(),loads=new Set(),uses=new Set(),pairs=[];
  s.frames.forEach((f,i)=>{
    if (!f || typeof f!=='object') {errors.push(`Frame ${i}: formato inválido.`);return;}
    if (!Number.isSafeInteger(f.pinCount) || f.pinCount<0 || typeof f.dirty!=='boolean') errors.push(`Frame ${i}: pins o dirty inválidos.`);
    if (f.pageId===null) {
      if (f.pinCount!==0 || f.dirty!==false || f.ordenDeCarga!==null || f.ultimoAcceso!==null) errors.push(`Frame ${i}: libre incoherente.`);
    } else {
      if (!validPage(f.pageId) || seen.has(f.pageId)) errors.push(`Frame ${i}: PageID inválido o duplicado.`);
      seen.add(f.pageId); pairs.push([f.pageId,i]);
      if (!Number.isSafeInteger(f.ordenDeCarga) || !Number.isSafeInteger(f.ultimoAcceso) || f.ordenDeCarga<1 || f.ultimoAcceso<f.ordenDeCarga || f.ultimoAcceso>s.clock || loads.has(f.ordenDeCarga) || uses.has(f.ultimoAcceso)) errors.push(`Frame ${i}: orden inválido.`);
      loads.add(f.ordenDeCarga);uses.add(f.ultimoAcceso);
    }
  });
  if (!s.pageTable || Object.keys(s.pageTable).length!==pairs.length || pairs.some(([p,i])=>!Object.hasOwn(s.pageTable,p) || s.pageTable[p]!==i)) errors.push('Page table incoherente con frames.');
  return errors;
}
function check(s) {const errors=validateBuffer(s);if(errors.length)throw new Error(errors.join(' '));}
export function createBuffer(frameCount=3,policy='FIFO') {
  if (!Number.isInteger(frameCount) || frameCount<1 || frameCount>8) throw new Error('El buffer admite entre 1 y 8 frames.');
  const s={policy,frames:Array.from({length:frameCount},blank),pageTable:{},clock:0,reads:0,writes:0,hits:0,misses:0};
  check(s);return freeze(s);
}
export function priority(s) {
  const field=s.policy==='FIFO'?'ordenDeCarga':'ultimoAcceso';
  return s.frames.map((f,i)=>({...f,frame:i})).filter(f=>f.pageId!==null).sort((a,b)=>a[field]-b[field] || a.frame-b.frame);
}
export function operationText(op) {
  if (!op) return 'Inicio';
  return `${op.type}(${op.pageId}${op.type==='unpin'?`, ${op.dirty}`:''})`;
}
export function stepBuffer(state,operation) {
  check(state);
  const event={result:'rechazo',request:null,frame:null,pageId:typeof operation?.pageId==='string'?operation.pageId:null,victim:null,candidates:priority(state).filter(f=>f.pinCount===0).map(f=>f.pageId),order:priority(state).map(f=>f.pageId),reads:0,writes:0,pinBefore:null,pinAfter:null,dirtyBefore:null,dirtyAfter:null,explanation:''};
  const reject=message=>({state,event:freeze({...event,explanation:message})});
  if (!operation || !['pin','unpin'].includes(operation.type) || !validPage(operation.pageId) || (operation.type==='unpin' && typeof operation.dirty!=='boolean')) return reject('Operación inválida: use pin o unpin, un PageID de 1–16 letras, dígitos o _ y un booleano para unpin.');
  const {type,pageId}=operation;
  let index=Object.hasOwn(state.pageTable,pageId)?state.pageTable[pageId]:-1;
  if (type==='unpin' && (index<0 || state.frames[index].pinCount===0)) return reject(index<0?`Unpin rechazado: ${pageId} no está cargada. No cambia el buffer ni la E/S.`:`Unpin rechazado: ${pageId} ya tiene pinCount = 0. No cambia el buffer ni la E/S.`);
  if (type==='pin') {
    event.request=index>=0?'hit':'miss';
    if (index<0) {
      index=state.frames.findIndex(f=>f.pageId===null);
      if (index<0) {
        const candidate=priority(state).find(f=>f.pinCount===0);
        if (!candidate) return reject(`Miss de ${pageId} rechazado: todos los frames están fijados. No hay víctima elegible ni E/S; libere una página y vuelva a solicitarla.`);
        index=candidate.frame;event.victim={...state.frames[index],frame:index};
      }
    }
  }
  const next=structuredClone(state),f=next.frames[index];event.frame=index;
  event.pinBefore=f.pinCount;event.dirtyBefore=f.dirty;
  if (type==='unpin') {
    f.pinCount--;f.dirty ||= operation.dirty;event.result='unpin';
    event.explanation=`${operationText(operation)} en frame ${index}: pins ${event.pinBefore} → ${f.pinCount}; dirty ${event.dirtyBefore} → ${f.dirty}. ${f.pinCount===0?'Queda elegible.':'Sigue protegida.'} No escribe ni cambia recencia.`;
  } else {
    next.clock++;
    if (event.request==='hit') {
      f.pinCount++;f.ultimoAcceso=next.clock;next.hits++;event.result='hit';
      event.explanation=`Hit de ${pageId} en frame ${index}: pins ${event.pinBefore} → ${f.pinCount}; sin lectura. Renueva ultimoAcceso; conserva ordenDeCarga y dirty.`;
    } else {
      event.result='miss';event.reads=1;event.writes=Number(event.victim?.dirty??false);
      if (event.victim) delete next.pageTable[event.victim.pageId];
      Object.assign(f,{pageId,pinCount:1,dirty:false,ordenDeCarga:next.clock,ultimoAcceso:next.clock});
      // defineProperty also handles arbitrary valid keys such as __proto__ safely.
      Object.defineProperty(next.pageTable,pageId,{value:index,enumerable:true,writable:true,configurable:true});
      next.reads++;next.misses++;next.writes+=event.writes;
      event.explanation=event.victim?`Miss de ${pageId}: ${state.policy} elige ${event.victim.pageId}, primera elegible en el orden [${event.order.join(', ')}]. ${event.writes?'Escribe la víctima dirty antes de reutilizar su frame.':'La víctima está clean: no escribe.'} Lee ${pageId} en frame ${index}, con pin 1 y dirty false.`:`Miss de ${pageId}: usa el frame libre ${index}, sin expulsión. Una lectura; pin 1 y dirty false.`;
    }
  }
  event.pinAfter=f.pinCount;event.dirtyAfter=f.dirty;
  check(next);return {state:freeze(next),event:freeze(event)};
}
export function traceBuffer(operations,frameCount=3,policy='FIFO') {
  let state=createBuffer(frameCount,policy);
  const steps=[freeze({step:0,state,operation:null,event:{result:'inicio',frame:null,victim:null,candidates:[],order:[],reads:0,writes:0,explanation:'Buffer vacío. Sin lecturas ni escrituras.'},explanation:'Buffer vacío. Sin lecturas ni escrituras.'})];
  for (const operation of operations) {
    const result=stepBuffer(state,operation);state=result.state;
    steps.push(freeze({step:steps.length,state,operation:structuredClone(operation),event:result.event,explanation:result.event.explanation}));
  }
  return freeze(steps);
}
export function restoreSnapshot(snapshot) {const state=structuredClone(snapshot.state);check(state);return freeze({...structuredClone(snapshot),state});}
export const pin=pageId=>({type:'pin',pageId:String(pageId)});
export const unpin=(pageId,dirty=false)=>({type:'unpin',pageId:String(pageId),dirty});
export const usePages=pages=>pages.flatMap(p=>[pin(p),unpin(p)]);
export const mainOperations=freeze([
  pin('A'),unpin('A'),pin('B'),unpin('B',true),pin('C'),unpin('C'),pin('A'),unpin('A'),pin('D'),pin('A'),unpin('A',true),pin('B'),unpin('B'),unpin('D'),pin('E'),unpin('E'),pin('A'),unpin('A')
]);
export const beladyPages=freeze(['1','2','3','4','1','2','5','1','2','3','4','5']);
export const treePages=leaves=>leaves.flatMap(l=>['R',Number(l)<=3?'D1':'D2',`L${l}`]);
export const presets=freeze([
  {id:'principal',name:'18 operaciones',operations:mainOperations},
  {id:'intercaladas',name:'Pins intercalados: sin víctima',operations:[...mainOperations.slice(0,12),pin('C'),pin('E'),...mainOperations.slice(12)]},
  {id:'belady',name:'Belady: 12 solicitudes usar',operations:usePages(beladyPages)},
  {id:'limites',name:'Pins anidados, dirty y errores',operations:[unpin('Z'),pin('A'),pin('A'),unpin('A',true),unpin('A'),unpin('A'),pin('B'),pin('C'),pin('D'),pin('E')]},
  {id:'bplus',name:'B+: alternar dos ramas',operations:usePages(treePages([1,4,1,4,1,4]))},
  {id:'bplus-ciclo',name:'B+: cinco hojas',operations:usePages(treePages([1,4,2,5,3,1,4,2,5,3]))}
]);
