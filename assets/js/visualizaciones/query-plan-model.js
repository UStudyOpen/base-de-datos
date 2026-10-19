// Finite, named-attribute bag algebra. Pure ES module; no SQL parser or DOM.
const clone = x => structuredClone(x);
const unique = xs => [...new Set(xs)];
const equalSchema = (a,b) => a.length === b.length && a.every(x => b.includes(x));
const subset = (a,b) => a.every(x => b.includes(x));
export function freeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
}
export const attr = name => ({kind:'attribute',name});
export const literal = value => ({kind:'literal',value});
export const compare = (op,left,right) => ({kind:'compare',op,left,right});
export const and = (...terms) => ({kind:'and',terms});
export const or = (...terms) => ({kind:'or',terms});
export const not = term => ({kind:'not',term});
export function references(p) {
  if (!p) return [];
  if (p.kind === 'attribute') return [p.name];
  if (p.kind === 'literal') return [];
  if (p.kind === 'compare') return unique([...references(p.left),...references(p.right)]);
  if (p.kind === 'not') return references(p.term);
  if (p.kind === 'and' || p.kind === 'or') return unique(p.terms.flatMap(references));
  throw new Error('Expresión de predicado no soportada.');
}
export function predicateText(p) {
  if (!p) return '';
  if (p.kind === 'attribute') return p.name;
  if (p.kind === 'literal') return typeof p.value === 'string' ? `'${p.value}'` : String(p.value);
  if (p.kind === 'compare') return `${predicateText(p.left)} ${p.op} ${predicateText(p.right)}`;
  if (p.kind === 'not') return `¬(${predicateText(p.term)})`;
  return p.terms.map(t => `(${predicateText(t)})`).join(p.kind === 'and' ? ' ∧ ' : ' ∨ ');
}
function derive(type,children,p) {
  const a=children[0]?.schema ?? [], b=children[1]?.schema ?? [];
  if (type==='table') return [...p.attributes];
  if (type==='project') return [...p.attributes];
  if (type==='rename') return a.map(x => p.mapping[x] ?? x);
  if (type==='product' || type==='join' || type==='natural') return unique([...a,...b]);
  if (type==='group') return [...p.groups,...p.aggregates.map(x=>x.as)];
  return [...a];
}
export function node(type,id,children=[],parameters={}) {
  const p=clone(parameters);
  const required=type==='project' ? p.attributes : type==='rename' ? Object.keys(p.mapping) :
    type==='natural' ? children[0].schema.filter(x=>children[1].schema.includes(x)) :
    ['delta','union','intersect','difference'].includes(type) ? children[0].schema :
    type==='group' ? unique([...p.groups,...p.aggregates.flatMap(x=>x.attribute?[x.attribute]:[])]) : references(p.predicate);
  return freeze({...p,type,id,children:[...children],schema:derive(type,children,p),required});
}
export const tableNode = (id,name,attributes) => node('table',id,[],{name,attributes});
export const select = (id,predicate,child) => node('select',id,[child],{predicate});
export const project = (id,attributes,child) => node('project',id,[child],{attributes});
export const binary = (type,id,left,right,parameters={}) => node(type,id,[left,right],parameters);
export const delta = (id,child) => node('delta',id,[child]);
const unary = new Set(['select','project','rename','delta','group']);
const binaries = new Set(['product','join','natural','union','intersect','difference']);

export function validatePlan(plan) {
  const errors=[],ids=new Set();
  const issue=(n,message,extra={})=>errors.push({nodeId:n.id,message,...extra});
  function visit(n) {
    if (!n || typeof n !== 'object') { errors.push({message:'Nodo ausente.'}); return; }
    if (!n.id || ids.has(n.id)) { issue(n,'Identificador ausente o repetido.'); return; }
    ids.add(n.id);
    if (!Array.isArray(n.children) || !Array.isArray(n.schema)) { issue(n,'Estructura de nodo inválida.'); return; }
    const arity=n.type==='table'?0:unary.has(n.type)?1:binaries.has(n.type)?2:-1;
    if (arity<0 || n.children.length!==arity) { issue(n,'Operador o aridad no soportados.'); return; }
    n.children.forEach(visit);
    const schemas=n.children.map(c=>c.schema??[]), available=unique(schemas.flat());
    for(const attribute of n.required??[]) if(!available.includes(attribute) && n.type!=='table')
      issue(n,`Falta ${attribute} en ${n.id}; disponibles: ${available.join(', ') || '∅'}.`,{attribute,available});
    if (n.type==='product' || n.type==='join') {
      const shared=schemas[0].filter(x=>schemas[1].includes(x));
      if(shared.length) issue(n,`Se necesitan alias disjuntos: ${shared.join(', ')}.`);
    }
    if (['union','intersect','difference'].includes(n.type) && !equalSchema(schemas[0],schemas[1])) issue(n,'Esquemas incompatibles.');
    if (['union','intersect','difference'].includes(n.type) && !['bag','set'].includes(n.semantics??'bag')) issue(n,'Semántica no soportada.');
    if (new Set(n.schema).size!==n.schema.length) issue(n,'Nombres de salida repetidos.');
    if (n.type==='group') {
      for(const a of n.aggregates) {
        if (!['MIN','MAX','SUM','COUNT','AVG'].includes(a.fn) || (a.fn!=='COUNT' && !a.attribute)) issue(n,'Agregado no soportado o sin argumento.');
      }
    }
    try {
      if (!equalSchema(n.schema,derive(n.type,n.children,n))) issue(n,'Esquema almacenado incoherente.');
      if (!equalSchema(n.required??[],node(n.type,n.id,n.children,n).required)) issue(n,'Atributos requeridos incoherentes.');
      function predicate(p) {
        if (!p || !['compare','and','or','not'].includes(p.kind)) throw new Error('Predicado inválido.');
        if (p.kind==='compare') {
          if(!['=','≠','<','≤','>','≥'].includes(p.op)) throw new Error('Comparación no soportada.');
          for(const x of [p.left,p.right]) if(!x || !['attribute','literal'].includes(x.kind) || (x.kind==='literal' && !scalar(x.value))) throw new Error('Argumento de comparación inválido.');
        } else if(p.kind==='not') predicate(p.term);
        else { if(!p.terms?.length) throw new Error('Conectivo vacío.'); p.terms.forEach(predicate); }
      }
      if (n.type==='select' || n.type==='join') predicate(n.predicate);
    } catch(e) { issue(n,e.message); }
  }
  visit(plan); return freeze({valid:errors.length===0,errors});
}
export function assertPlan(plan) {
  const v=validatePlan(plan); if(!v.valid) throw new Error(v.errors.map(e=>e.message).join(' ')); return plan;
}
const scalar = x => typeof x==='string' || typeof x==='boolean' || (typeof x==='number' && Number.isFinite(x));
function testPredicate(p,row) {
  if (p.kind==='and') return p.terms.every(t=>testPredicate(t,row));
  if (p.kind==='or') return p.terms.some(t=>testPredicate(t,row));
  if (p.kind==='not') return !testPredicate(p.term,row);
  const value=x=>x.kind==='attribute'?row[x.name]:x.value;
  const a=value(p.left),b=value(p.right);
  if(!scalar(a)||!scalar(b)||typeof a!==typeof b) throw new Error('El núcleo exige valores no nulos de tipos compatibles.');
  return {'=':()=>a===b,'≠':()=>a!==b,'<':()=>a<b,'≤':()=>a<=b,'>':()=>a>b,'≥':()=>a>=b}[p.op]();
}
export const tupleKey = row => JSON.stringify(Object.keys(row).sort().map(k=>[k,row[k]]));
export function frequencies(rows) {
  const m=new Map(); for(const row of rows) { const key=tupleKey(row); const entry=m.get(key)??{row:clone(row),count:0}; entry.count++;m.set(key,entry); }
  return [...m.values()].sort((a,b)=>tupleKey(a.row).localeCompare(tupleKey(b.row)));
}
const dedup = rows => frequencies(rows).map(x=>x.row);
export const sameBag = (a,b) => JSON.stringify(frequencies(a).map(x=>[tupleKey(x.row),x.count]))===JSON.stringify(frequencies(b).map(x=>[tupleKey(x.row),x.count]));
function run(n,data,metrics) {
  const children=n.children.map(c=>run(c,data,metrics));
  const [a,b]=children; let out;
  switch(n.type) {
    case 'table': {
      if(!Object.hasOwn(data,n.name) || !Array.isArray(data[n.name])) throw new Error(`Faltan datos de ${n.name}.`);
      out=data[n.name].map(row=>{
        if(!equalSchema(Object.keys(row),n.schema) || Object.values(row).some(x=>!scalar(x))) throw new Error(`Datos incompatibles o nulos en ${n.name}.`);
        return clone(row);
      }); break;
    }
    case 'select': out=a.filter(row=>testPredicate(n.predicate,row));break;
    case 'project': out=a.map(row=>Object.fromEntries(n.attributes.map(x=>[x,row[x]])));break;
    case 'rename': out=a.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[n.mapping[k]??k,v])));break;
    case 'delta': out=dedup(a);break;
    case 'product': case 'join': case 'natural': {
      const shared=n.children[0].schema.filter(x=>n.children[1].schema.includes(x));out=[];
      for(const r of a) for(const s of b) {
        if(n.type==='natural' && !shared.every(x=>r[x]===s[x])) continue;
        const row={...r,...s};if(n.type!=='join' || testPredicate(n.predicate,row))out.push(row);
      } break;
    }
    case 'union': out=[...a,...b];if(n.semantics==='set')out=dedup(out);break;
    case 'intersect': case 'difference': {
      const bm=new Map(frequencies(b).map(x=>[tupleKey(x.row),x.count]));out=[];
      for(const {row,count} of frequencies(a)) {
        const other=bm.get(tupleKey(row))??0;
        const k=n.semantics==='set'?(n.type==='intersect'?Number(other>0):Number(other===0)):
          n.type==='intersect'?Math.min(count,other):Math.max(count-other,0);
        for(let i=0;i<k;i++)out.push(clone(row));
      }break;
    }
    case 'group': {
      const groups=new Map();
      for(const row of a) { const g=Object.fromEntries(n.groups.map(x=>[x,row[x]])), k=tupleKey(g); if(!groups.has(k))groups.set(k,{g,rows:[]});groups.get(k).rows.push(row); }
      if(!n.groups.length&&!a.length)groups.set('global',{g:{},rows:[]});
      out=[...groups.values()].map(({g,rows})=>{
        const result={...g};for(const ag of n.aggregates) {
          const xs=ag.attribute?rows.map(r=>r[ag.attribute]):[];
          if(['SUM','AVG'].includes(ag.fn)&&xs.some(x=>typeof x!=='number')) throw new Error('SUM/AVG requieren números en este evaluador.');
          let v;
          if(ag.fn==='COUNT')v=rows.length;
          else if(!xs.length)v=null;
          else if(ag.fn==='MIN' || ag.fn==='MAX')v=xs.reduce((x,y)=>ag.fn==='MIN'?(x<y?x:y):(x>y?x:y));
          else {v=xs.reduce((x,y)=>x+y,0);if(ag.fn==='AVG')v/=xs.length;}
          result[ag.as]=v;
        }return result;
      });break;
    }
    default: throw new Error('Operador no soportado.');
  }
  metrics[n.id]={rows:out.length,columns:n.schema.length}; return out;
}
export function evaluate(plan,data) { assertPlan(plan);return run(plan,data,{}); }
export function evaluateWithMetrics(plan,data) { assertPlan(plan);const metrics={};return {rows:run(plan,data,metrics),metrics}; }
export function comparePlans(before,after,data) {
  const va=validatePlan(before),vb=validatePlan(after);
  const original=va.valid?evaluateWithMetrics(before,data):null;
  if(!va.valid||!vb.valid) return {classification:'mal definida',original,modified:null,errors:[...va.errors,...vb.errors],difference:[]};
  const modified=evaluateWithMetrics(after,data);
  const a=new Map(frequencies(original.rows).map(x=>[tupleKey(x.row),x])),b=new Map(frequencies(modified.rows).map(x=>[tupleKey(x.row),x]));
  const difference=unique([...a.keys(),...b.keys()]).sort().map(k=>({row:(a.get(k)??b.get(k)).row,before:a.get(k)?.count??0,after:b.get(k)?.count??0}));
  return {classification:sameBag(original.rows,modified.rows)?'coincide en esta instancia':'difiere en esta instancia',original,modified,errors:[],difference};
}
function rebuildSafe(n,children,changes={}) {
  const {type,id,children:ignored,schema,required,...p}=n;return node(type,id,children,{...p,...changes});
}
function mapAt(n,id,transform) { return n.id===id?transform(n):rebuildSafe(n,n.children.map(c=>mapAt(c,id,transform))); }
function find(n,id) { if(n.id===id)return n;for(const c of n.children){const r=find(c,id);if(r)return r;}return null; }
const conjuncts = p => p.kind==='and'?p.terms.flatMap(conjuncts):[p];
const conjunction = ps => ps.length===1?ps[0]:and(...ps);
function pushOne(base,p,id) {
  if(['product','join'].includes(base.type)) {
    const index=base.children.findIndex(c=>subset(references(p),c.schema));
    if(index>=0)return rebuildSafe(base,base.children.map((c,i)=>i===index?pushOne(c,p,id):c));
  }
  return select(id,p,base);
}
export const rules=freeze({
  'identify-joins':{name:'Identificar condiciones de join',preconditions:'Selección conjuntiva sobre productos; predicados totales y atributos presentes.',justification:'Separación de conjunciones y distribución de selección sobre productos.'},
  'product-to-join':{name:'Producto a join',preconditions:'Selección directamente sobre un producto; condición definida en sus esquemas disjuntos.',justification:'El θ-join se define como selección sobre producto.'},
  'push-selection':{name:'Push-selection',preconditions:'Selección sobre producto o join interno; cada término se mueve solo a un hijo con todos sus atributos.',justification:'El indicador del filtro depende solo de la rama a la que se desplaza.'},
  'push-projection':{name:'Push-projection',preconditions:'Proyección sobre join/producto o selección; conservar salida y argumentos de todos los operadores pendientes.',justification:'Sumar multiplicidades tras proyectar conserva el número de testigos si no se pierden argumentos.'}
});
export function applyRule(plan,targetId,rule,options={}) {
  assertPlan(plan);const target=find(plan,targetId),spec=rules[rule];
  if(!target||!spec)throw new Error('Regla o nodo objetivo desconocidos.');
  let counter=0;const used=new Set();(function walk(n){used.add(n.id);n.children.forEach(walk);})(plan);
  const fresh=stem=>{let id;do{id=`${targetId}-${stem}-${++counter}`;}while(used.has(id));used.add(id);return id;};
  const fail=()=>{throw new Error(`Precondición incumplida: ${spec.preconditions}`);};
  const rewritten=mapAt(plan,targetId,n=>{
    const child=n.children[0];
    if(rule==='identify-joins') {
      if(n.type!=='select'||child.type!=='product'||n.predicate.kind!=='and')return fail();
      const joins=[],locals=[];
      for(const p of conjuncts(n.predicate)) {
        const refs=references(p);const leaves=[];(function walk(x){if(!x.children.length)leaves.push(x.schema);else x.children.forEach(walk);})(child);
        (leaves.some(s=>subset(refs,s))?locals:joins).push(p);
      }
      if(!joins.length)return fail();
      let result=child;for(const p of joins)result=pushOne(result,p,fresh('condition'));
      return locals.length?select(n.id,conjunction(locals),result):result;
    }
    if(rule==='product-to-join') {
      if(n.type!=='select'||child.type!=='product')return fail();
      return binary('join',n.id,...child.children,{predicate:n.predicate});
    }
    if(rule==='push-selection') {
      if(n.type!=='select'||!['product','join'].includes(child.type))return fail();
      const ps=conjuncts(n.predicate);
      if(!ps.some(p=>child.children.some(c=>subset(references(p),c.schema))))return fail();
      let result=child;for(const p of ps)result=pushOne(result,p,fresh('filter'));return result;
    }
    if(rule==='push-projection') {
      if(n.type!=='project'||!['product','join','select'].includes(child.type))return fail();
      const needed=unique([...n.attributes,...child.required]);
      const expected=child.children.map(c=>needed.filter(x=>c.schema.includes(x)));
      const keeps=options.keep??expected;
      if(!Array.isArray(keeps)||keeps.length!==expected.length||expected.some((xs,i)=>!subset(xs,keeps[i])||!subset(keeps[i],child.children[i].schema)))return fail();
      const children=child.children.map((c,i)=>project(fresh('columns'),keeps[i],c));
      return project(n.id,n.attributes,rebuildSafe(child,children));
    }
    return fail();
  });
  assertPlan(rewritten);if(!equalSchema(plan.schema,rewritten.schema))throw new Error('La salida cambió de esquema.');
  return freeze({rule,ruleName:spec.name,preconditions:spec.preconditions,before:plan,after:rewritten,preserve:unique([...(target.required??[]),...target.schema,...(target.children[0]?.required??[])]),justification:spec.justification,classification:'correcta'});
}

export const universityData=freeze({
  E:[{'e.rut':'r1','e.nombre':'Alex','e.carrera':'Computación'},{'e.rut':'r2','e.nombre':'Alex','e.carrera':'Computación'},{'e.rut':'r3','e.nombre':'Sol','e.carrera':'Artes'}],
  I:[{'i.rut':'r1','i.codigo':'BD101','i.semestre':'2026-2'},{'i.rut':'r2','i.codigo':'BD101','i.semestre':'2026-2'},{'i.rut':'r3','i.codigo':'PROG101','i.semestre':'2026-2'},{'i.rut':'r1','i.codigo':'BD101','i.semestre':'2026-1'}],
  C:[{'c.codigo':'BD101','c.nombre':'Bases de Datos','c.creditos':6},{'c.codigo':'PROG101','c.nombre':'Programación','c.creditos':5}]
});
const eq=(name,value)=>compare('=',attr(name),literal(value));
export function universityPlan() {
  const E=tableNode('E','E',['e.rut','e.nombre','e.carrera']),I=tableNode('I','I',['i.rut','i.codigo','i.semestre']),C=tableNode('C','C',['c.codigo','c.nombre','c.creditos']);
  const a=compare('=',attr('e.rut'),attr('i.rut')),b=compare('=',attr('i.codigo'),attr('c.codigo'));
  return project('output',['e.nombre','c.nombre'],select('where',and(a,b,eq('e.carrera','Computación'),eq('i.semestre','2026-2')),binary('product','EC',binary('product','EI',E,I),C)));
}
function withPrefix(n,prefix) { return node(n.type,`${prefix}${n.id}`,n.children.map(c=>withPrefix(c,prefix)),Object.fromEntries(Object.entries(n).filter(([k])=>!['type','id','children','schema','required'].includes(k)))); }
function diagnostic(rule,before,after,explanation,classification,preserve=[]) {
  return freeze({rule,ruleName:rule,before,after,preconditions:'Propuesta para diagnóstico; no se acepta como aplicación de una regla certificada.',preserve,justification:explanation,classification});
}
export const examples=freeze([
  {id:'valido',name:'A · Cinco etapas válidas'},
  {id:'disyuncion',name:'B · Disyunción y solapamiento'},
  {id:'atributos',name:'C · Proyección mal definida'},
  {id:'distinct',name:'D · Pérdida de la llave y DISTINCT'},
  {id:'distributividad',name:'E · Conjuntos frente a bolsas'},
  {id:'agregacion',name:'F · SUM frente a MIN'}
]);
export function exampleTrace(id='valido') {
  let data,initial,steps=[];
  const record=(t,explanation=t.justification)=>steps.push({...t,explanation,plan:t.after});
  if(id==='valido') {
    data=universityData;initial=universityPlan();
    let plan=initial;
    function apply(target,rule,explanation) {const t=applyRule(plan,target,rule);plan=t.after;record(t,explanation);}
    apply('where','identify-joins','Separar conjunciones: e.rut = i.rut e i.codigo = c.codigo son condiciones de join; carrera y semestre son filtros locales.');
    // Both local conversions are one displayed stage; each carries its certificate.
    const ids=[];(function walk(n){if(n.type==='select'&&n.children[0].type==='product')ids.push(n.id);n.children.forEach(walk);})(plan);
    const before=plan,certificates=[];for(const target of ids){const t=applyRule(plan,target,'product-to-join');plan=t.after;certificates.push(t);}
    record({...certificates[0],before,after:plan,certificates},'Sustituir selección sobre producto por θ-join, manteniendo exactamente las igualdades solicitadas.');
    apply('where','push-selection','Adelantar carrera hacia E y semestre hacia I; los predicados entre ramas permanecen en los joins.');
    const beforeProjection=plan,certs=[];
    const t=applyRule(plan,'output','push-projection');plan=t.after;certs.push(t);
    const inner=plan.children[0].children[0];const innerT=applyRule(plan,inner.id,'push-projection');plan=innerT.after;certs.push(innerT);
    record({...t,before:beforeProjection,after:plan,certificates:certs},'Conservar nombres y claves de join. Carrera y semestre se descartan después de evaluar sus filtros. No se añade DISTINCT.');
  } else if(id==='disyuncion') {
    data={R:[{x:2}]};const R=tableNode('R','R',['x']),p=compare('>',attr('x'),literal(0)),q=compare('<',attr('x'),literal(3));
    initial=select('or',or(p,q),R);
    const proposed=binary('union','add',select('p',p,withPrefix(R,'p-')),select('q',q,withPrefix(R,'q-')));
    record(diagnostic('Reparto por UNION ALL',initial,proposed,'La fila x=2 satisface ambos predicados: aparece una vez en el original y dos en la unión aditiva.','incorrecta'));
    record(diagnostic('Comparar soportes con δ exterior',delta('distinct-old',initial),delta('distinct-new',proposed),'Aplicar δ a ambos planes conserva soporte. Esta reparación cambia la pregunta a resultados deduplicados.','correcta solo con δ final'));
  } else if(id==='atributos') {
    data={E:[{'e.rut':'r1','e.nombre':'Alex'}],I:[{'i.rut':'r1'}]};
    const E=tableNode('E','E',['e.rut','e.nombre']),I=tableNode('I','I',['i.rut']),p=compare('=',attr('e.rut'),attr('i.rut'));
    initial=project('out',['e.nombre'],binary('join','join',E,I,{predicate:p}));
    const bad=project('out',['e.nombre'],binary('join','join',project('early',['e.nombre'],E),I,{predicate:p}));
    record(diagnostic('Proyección prematura',initial,bad,'El join requiere e.rut, pero la proyección solo entrega e.nombre. No existe un resultado evaluable.','mal definida',['e.rut','i.rut','e.nombre']));
  } else if(id==='distinct') {
    data={E:[{rut:'r1',carrera:'Computación'},{rut:'r2',carrera:'Computación'}]};
    const projected=project('careers',['carrera'],tableNode('E','E',['rut','carrera']));initial=delta('distinct',projected);
    record(diagnostic('Retirar DISTINCT por una llave perdida',initial,projected,'rut distingue las filas base, pero ya no está en la proyección. Computación pasa de multiplicidad 1 a 2.','incorrecta'));
  } else if(id==='distributividad') {
    data={R:[{x:'a'}],S:[{x:'a'}],T:[{x:'a'}]};const t=name=>tableNode(name,name,['x']);
    initial=binary('intersect','left',t('R'),binary('union','ST',t('S'),t('T')));
    const proposed=binary('union','right',binary('intersect','RS',withPrefix(t('R'),'l-'),t('S')),binary('intersect','RT',withPrefix(t('R'),'r-'),t('T')));
    record(diagnostic('Distribuir intersección sobre unión aditiva',initial,proposed,'min(1,1+1)=1, mientras min(1,1)+min(1,1)=2. La ley de conjuntos falla en bolsas.','incorrecta'));
    record(diagnostic('Conservar solo el soporte',delta('set-left',initial),delta('set-right',proposed),'Con δ exterior ambos resultados representan el mismo conjunto {a}; las bolsas interiores siguen siendo distintas.','correcta solo con δ final'));
  } else if(id==='agregacion') {
    data={R:[{g:'A',v:2},{g:'A',v:2},{g:'A',v:8}]};const R=tableNode('R','R',['g','v']);
    const group=(name,child,fns)=>node('group',name,[child],{groups:['g'],aggregates:fns.map(fn=>({fn,attribute:'v',as:fn.toLowerCase()}))});
    initial=group('stats',R,['SUM','COUNT','AVG']);
    record(diagnostic('Deduplicar antes de SUM, COUNT y AVG',initial,group('stats',delta('dedup',R),['SUM','COUNT','AVG']),'[2,2,8] da suma 12, conteo 3 y promedio 4; [2,8] da 10, 2 y 5.','incorrecta'));
    record(diagnostic('Comparación de MIN y MAX',group('extremes',R,['MIN','MAX']),group('extremes',delta('dedup',R),['MIN','MAX']),'Al deduplicar filas completas se preservan los valores extremos de cada grupo. Se comparan ahora otros agregados.','correcta'));
  } else throw new Error('Ejemplo desconocido.');
  assertPlan(initial);
  const start={rule:'inicio',ruleName:'Plan original',before:initial,after:initial,plan:initial,preconditions:'Atributos no nulos; tipos compatibles; predicados puros y totales.',preserve:initial.schema,justification:'Plan inicial sin transformaciones.',classification:'original',explanation:'Leer desde las hojas hacia la raíz. π conserva las multiplicidades; δ las reduce a uno.'};
  return freeze({id,data,steps:[start,...steps]});
}
