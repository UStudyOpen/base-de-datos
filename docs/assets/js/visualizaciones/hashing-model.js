// Pure, immutable hashing model. All mutations are private to an operation;
// an exception discards the entire tentative trace and leaves its input intact.
const clone = x => structuredClone(x);
export function immutable(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(immutable); Object.freeze(x);
  }
  return x;
}
export const limits = Object.freeze({maxKey:65535, maxDepth:8, maxKeys:60, maxCapacity:16});
function int(x, lo, hi, name) {
  if (!Number.isSafeInteger(x) || x < lo || x > hi) throw new Error(`${name}: entero entre ${lo} y ${hi}.`);
}
export function hash(key, n) {
  int(key,0,limits.maxKey,'Clave'); int(n,1,256,'Número de buckets'); return key % n;
}
export function suffix(key, depth) {
  int(key,0,limits.maxKey,'Clave'); int(depth,0,limits.maxDepth,'Profundidad');
  return depth ? (key % 2**depth).toString(2).padStart(depth,'0') : 'ε';
}
export function values(state) {
  return state.kind==='static' ? state.buckets.flat(2) : Object.values(state.buckets).flatMap(b=>b.keys);
}
function recorder(state, operation, key) {
  const steps=[];
  const record=(action,explanation,extra={})=>steps.push(immutable({state:clone(state),operation,key,action,
    explanation,transient:false,active:[],changed:[],visited:[],...extra}));
  record('inicio',`${operation} ${key}: estado inicial; B=${state.B}.`);
  return {steps,record,finish:extra=>immutable({state:clone(state),steps,...extra})};
}
export function createStatic(N=4,B=3) {
  int(N,1,16,'N'); int(B,1,limits.maxCapacity,'Capacidad');
  return immutable({kind:'static',N,B,buckets:Array.from({length:N},()=>[[]])});
}
export function validateStatic(s) {
  int(s.N,1,16,'N'); int(s.B,1,limits.maxCapacity,'Capacidad');
  if(s.kind!=='static' || s.buckets.length!==s.N) throw new Error('Estructura estática inválida.');
  const keys=[];
  s.buckets.forEach((chain,i)=>{
    if(!chain.length) throw new Error('Falta página principal.');
    chain.forEach((page,j)=>{
      if(page.length>s.B || (j<chain.length-1 && page.length!==s.B) || (j>0 && !page.length)) throw new Error('Capacidad o cadena inválida.');
      page.forEach(k=>{if(hash(k,s.N)!==i) throw new Error('Ubicación inválida.');keys.push(k);});
    });
  });
  if(new Set(keys).size!==keys.length) throw new Error('Clave duplicada.');
  return true;
}
export function staticSearch(input,key) {
  validateStatic(input); const i=hash(key,input.N), state=clone(input), c=recorder(state,'Buscar',key),visited=[];
  c.record('seleccion',`h(${key})=${key} mod ${state.N}=${i}. Seleccionar bucket ${i}.`,{index:i,active:[String(i)]});
  for(let j=0;j<state.buckets[i].length;j++) {
    visited.push(`${i}:${j}`); const found=state.buckets[i][j].includes(key);
    c.record('lectura',`Leer página ${j+1} del bucket ${i}: ${found?'clave encontrada.':'no contiene la clave.'} ${visited.length} lectura(s).`,{index:i,active:[String(i)],visited:[...visited],found});
    if(found) return c.finish({found:true,reads:visited.length});
  }
  c.record('ausente',`Cadena agotada: ${key} no existe. ${visited.length} lectura(s).`,{index:i,active:[String(i)],visited});
  return c.finish({found:false,reads:visited.length});
}
export function staticInsert(input,key) {
  validateStatic(input); const i=hash(key,input.N);
  if(values(input).includes(key)) throw new Error('La clave ya existe; inserción duplicada.');
  if(values(input).length>=limits.maxKeys) throw new Error('Máximo de 60 claves.');
  const state=clone(input), c=recorder(state,'Insertar',key),chain=state.buckets[i];
  c.record('seleccion',`h(${key})=${key} mod ${state.N}=${i}. Bucket ${i}; comprobar duplicados recorriendo su cadena.`,{index:i,active:[String(i)],visited:chain.map((_,j)=>`${i}:${j}`)});
  if(chain.at(-1).length===state.B) {
    chain.push([]);
    c.record('overflow',`La página ${chain.length-1} está llena: crear y enlazar overflow, página ${chain.length}. La clave ${key} sigue pendiente.`,{index:i,active:[String(i)],changed:[`${i}:${chain.length-1}`],transient:true});
  }
  chain.at(-1).push(key);validateStatic(state);
  c.record('insertado',`Insertar ${key} en bucket ${i}, página ${chain.length}. Ocupación ${chain.at(-1).length}/${state.B}.`,{index:i,active:[String(i)],changed:[`${i}:${chain.length-1}`]});
  return c.finish();
}
export function createExtendable(B=2,maxDepth=limits.maxDepth) {
  int(B,1,limits.maxCapacity,'Capacidad');int(maxDepth,0,limits.maxDepth,'Profundidad máxima');
  return immutable({kind:'extendable',B,g:0,maxDepth,nextId:1,directory:['H0'],buckets:{H0:{id:'H0',l:0,s:0,keys:[]}}});
}
export function validateExtendable(s) {
  const fail=()=>{throw new Error('Invariante de hashing extensible incumplido.');};
  int(s.B,1,limits.maxCapacity,'Capacidad');int(s.maxDepth,0,limits.maxDepth,'Profundidad máxima');int(s.g,0,s.maxDepth,'Profundidad global');
  if(s.kind!=='extendable' || s.directory.length!==2**s.g) fail();
  if(s.directory.some(id=>!s.buckets[id])) fail();
  const all=[];
  for(const [id,b] of Object.entries(s.buckets)) {
    int(b.l,0,s.g,'Profundidad local');int(b.s,0,2**b.l-1,'Sufijo');
    if(b.id!==id || b.keys.length>s.B) fail();
    const refs=s.directory.flatMap((ref,i)=>ref===id?[i]:[]);
    if(refs.length!==2**(s.g-b.l) || refs.some(i=>i%2**b.l!==b.s)) fail();
    b.keys.forEach(k=>{int(k,0,limits.maxKey,'Clave');if(k%2**b.l!==b.s || s.directory[k%2**s.g]!==id)fail();all.push(k);});
  }
  if(new Set(all).size!==all.length || all.length>limits.maxKeys) fail();return true;
}
function locate(state,key,c,transient=false) {
  const index=key%2**state.g, id=state.directory[index];
  c.record('seleccion',`${key} en binario: ${key.toString(2)}; últimos ${state.g} bits: ${suffix(key,state.g)}. Entrada ${index} → ${id}, l=${state.buckets[id].l}.`,{index,active:[id],transient});
  return {index,id,b:state.buckets[id]};
}
export function search(input,key) {
  validateExtendable(input);int(key,0,limits.maxKey,'Clave');
  const state=clone(input),c=recorder(state,'Buscar',key),{index,id,b}=locate(state,key,c),found=b.keys.includes(key);
  c.record('resultado',`Examinar ${id} [${b.keys.join(', ')}]: ${found?'clave encontrada':'clave ausente'}. Una lectura de bucket, más directorio si está en disco.`,{index,active:[id],found});
  return c.finish({found});
}
export function insert(input,key) {
  validateExtendable(input);int(key,0,limits.maxKey,'Clave');
  if(values(input).includes(key)) throw new Error('La clave ya existe; inserción duplicada.');
  if(values(input).length>=limits.maxKeys) throw new Error('Máximo de 60 claves.');
  const state=clone(input),c=recorder(state,'Insertar',key);let splits=0,doublings=0;
  while(true) {
    const {index,id,b}=locate(state,key,c,splits>0);
    if(b.keys.length<state.B) {
      b.keys.push(key);validateExtendable(state);
      c.record('insertado',`${id} tiene espacio: insertar ${key}. l=${b.l}, g=${state.g}. Estado estable.`,{index,active:[id]});break;
    }
    const l=b.l, mustDouble=l===state.g;
    c.record('lleno',`${id} está lleno (${state.B}/${state.B}); l=${l} ${mustDouble?'=':'<'} g=${state.g}. ${mustDouble?'Duplicar antes de dividir.':'Dividir sin duplicar.'} La clave ${key} sigue pendiente.`,{index,active:[id],transient:true});
    if(mustDouble) {
      if(state.g===state.maxDepth) throw new Error(`No se pueden separar las claves dentro de la profundidad máxima ${state.maxDepth}. Estado anterior conservado.`);
      const old=state.directory.length;state.directory.push(...state.directory);state.g++;doublings++;
      validateExtendable(state);
      c.record('doubling',`l=${l} coincidía con g=${state.g-1}: duplicar de ${old} a ${state.directory.length} referencias; g=${state.g}. Buckets sin copiar. Falta dividir ${id}.`,{index:key%2**state.g,active:[id],changed:Array.from({length:old},(_,i)=>i+old),transient:true});
    }
    const newId=`H${state.nextId++}`, q={id:newId,l:l+1,s:b.s+2**l,keys:[]};
    b.l=l+1;state.buckets[newId]=q;
    const previous=[...b.keys];b.keys=[];
    for(const k of previous) (Math.floor(k/2**l)%2 ? q : b).keys.push(k);
    const changed=[];
    state.directory.forEach((ref,i)=>{if(ref===id && Math.floor(i/2**l)%2){state.directory[i]=newId;changed.push(i);}});
    splits++;validateExtendable(state);
    c.record('split',`Dividir ${id} por el bit ${l+1} desde la derecha (peso ${2**l}). ${id}: sufijo ${suffix(b.s,b.l)}, [${b.keys.join(', ')}]; nuevo ${newId}: sufijo ${suffix(q.s,q.l)}, [${q.keys.join(', ')}]. Ambos l=${l+1}; g=${state.g}. Reintentar ${key}.`,{index:key%2**state.g,active:[id,newId],changed,newIds:[newId],oldLocal:l,transient:true,withDoubling:mustDouble});
  }
  return c.finish({splits,doublings});
}
export function remove(input,key) {
  validateExtendable(input);int(key,0,limits.maxKey,'Clave');
  const state=clone(input),c=recorder(state,'Eliminar',key),{index,id,b}=locate(state,key,c);
  const position=b.keys.indexOf(key);
  if(position<0) {
    c.record('ausente',`${key} no existe en ${id}; estructura sin cambios.`,{index,active:[id]});
    return c.finish({found:false,merges:0,halvings:0});
  }
  b.keys.splice(position,1);
  c.record('eliminado',`Quitar ${key} de ${id}: ${b.keys.length?'no queda vacío; terminar sin merge.':'queda vacío; evaluar hermano si l>0.'}`,{index,active:[id],transient:!b.keys.length && b.l>0});
  let merges=0,halvings=0;
  if(!b.keys.length) {
    if(b.l>0) {
      const buddyIndex=index ^ 2**(b.l-1), buddyId=state.directory[buddyIndex], buddy=state.buckets[buddyId];
      c.record('hermano',`Cambiar bit de peso ${2**(b.l-1)}: entrada ${suffix(buddyIndex,state.g)} → ${buddyId}. l(${id})=${b.l}, l(${buddyId})=${buddy.l}. ${buddy.l===b.l?'Profundidades iguales: fusionar.':'Profundidades distintas: lado hermano subdividido; no se fusiona.'}`,{index,active:[id,buddyId],buddyId,buddyIndex,transient:true});
      if(buddy.l===b.l) {
        const oldLocal=b.l, changed=[];buddy.l--;buddy.s%=2**buddy.l;
        state.directory.forEach((ref,i)=>{if(ref===id || ref===buddyId){state.directory[i]=buddyId;changed.push(i);}});
        delete state.buckets[id];merges++;validateExtendable(state);
        c.record('merge',`${id} estaba vacío: conservar ${buddyId} y retirar ${id}. l:${oldLocal}→${buddy.l}; sufijo ${suffix(buddy.s,buddy.l)}. No se intenta otra fusión.`,{index,active:[buddyId],changed,removedId:id,oldLocal,transient:true});
      }
    }
    while(state.g>0 && Object.values(state.buckets).every(x=>x.l<state.g)) {
      const old=state.g;state.directory=state.directory.slice(0,state.directory.length/2);state.g--;halvings++;
      validateExtendable(state);
      c.record('halving',`Todos los buckets tenían l<${old}; ambas mitades repetían punteros. Reducir g:${old}→${state.g}; quedan ${state.directory.length} referencias.`,{index:key%2**state.g,active:[state.directory[key%2**state.g]],transient:true});
    }
  }
  validateExtendable(state);
  c.record('fin',`Eliminación terminada: ${merges} merge, ${halvings} reducción(es). g=${state.g}. Estado estable.`,{index:key%2**state.g,active:[state.directory[key%2**state.g]]});
  return c.finish({found:true,merges,halvings});
}
export const staticKeys=Object.freeze([8,12,5,16,21,4,9,20,13,3,7,24,17,28]);
export const insertKeys=Object.freeze([12,5,3,18,6,29,10,16,20,27]);
export const deleteKeys=Object.freeze([12,16,20,10,18,5,3]);
export function buildExtendable(keys,B=2,maxDepth=limits.maxDepth) {
  return keys.reduce((s,k)=>insert(s,k).state,createExtendable(B,maxDepth));
}
export function buildStatic(N=4) {return staticKeys.reduce((s,k)=>staticInsert(s,k).state,createStatic(N));}
