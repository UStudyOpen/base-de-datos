import {closure, keys, subsets, subset, union, difference, fixture, parse} from './clausuras.js';
import {el, field, selectField, table, player, attach, setText, ruleText} from './core.js';
const copy = x => JSON.parse(JSON.stringify(x));
export function project(universe, rules, target) {
  if (!subset(target,universe)) throw new Error('Proyección fuera del esquema.');
  const out=[];
  for (const left of subsets(target)) {
    const right=difference(closure(universe,rules,left).filter(a=>target.includes(a)),left);
    if(right.length) out.push({left,right});
  }
  return out;
}
export function normalForms(universe,rules) {
  const candidateKeys=keys(universe,rules), prime=union(...candidateKeys), violations=[];
  for (const left of subsets(universe)) {
    const c=closure(universe,rules,left);
    if(c.length===universe.length) continue;
    for(const a of difference(c,left)) violations.push({left,right:[a],third:!prime.includes(a)});
  }
  return {candidateKeys,prime,bcnf:violations.length===0,third:!violations.some(v=>v.third),violations};
}
export function minimalCover(universe,rules) {
  let current=rules.flatMap(f=>union(f.right).map(a=>({left:union(f.left),right:[a]})));
  const steps=[];
  const record=(operation,explanation)=>steps.push({step:steps.length,operation,explanation,rules:copy(current)});
  record('dividir','Dividir consecuentes conserva equivalencia; cada regla tiene un atributo a la derecha.');
  for(let i=0;i<current.length;i++) {
    for(const a of [...current[i].left]) {
      const f=current[i], shorter=difference(f.left,[a]), c=closure(universe,current,shorter);
      const can=c.includes(f.right[0]);
      if(can) current[i]={left:shorter,right:[...f.right]};
      record('izquierda',`${ruleText(f)}: (${setText(shorter)})+ = ${setText(c)}. ${can?'Se elimina '+a+' de la izquierda; ambas bases se implican.':'Se conserva '+a+': no alcanza el consecuente.'}`);
    }
  }
  for(let i=0;i<current.length;) {
    const f=current[i], other=current.filter((_,j)=>j!==i), c=closure(universe,other,f.left);
    const redundant=subset(f.right,c);
    if(redundant) current=other; else i++;
    record('redundancia',`Sin ${ruleText(f)}, (${setText(f.left)})+ = ${setText(c)}. ${redundant?'Regla redundante: se elimina.':'Regla necesaria: se conserva.'}`);
  }
  record('fin','Cubierta minimal equivalente: no quedan atributos extraños ni reglas redundantes.');
  return {rules:current,steps};
}
export function preservation(universe,rules,components) {
  const projected=components.flatMap(s=>project(universe,rules,s));
  const lost=rules.filter(f=>!subset(f.right,closure(universe,projected,f.left))).map(f=>({...f,closure:closure(universe,projected,f.left)}));
  return {preserved:!lost.length,lost};
}
export function bcnf(universe,rules,preferred) {
  const tree={schema:[...universe],rules:copy(rules),path:'R'},steps=[];
  function record(operation,explanation) { steps.push({step:steps.length,operation,explanation,tree:copy(tree)}); }
  record('inicio','Cada nodo conserva las dependencias proyectadas sobre sus atributos.');
  function visit(node,first=false) {
    const forms=normalForms(node.schema,node.rules);
    let v=forms.violations[0];
    if(first && preferred) {
      const chosen=forms.violations.find(f=>setText(f.left)===setText(preferred));
      if(!chosen) throw new Error('El determinante elegido no viola BCNF.');
      v=chosen;
    }
    if(!v) {node.valid=true;record('hoja',`${node.path}(${setText(node.schema)}) está en BCNF: todo determinante no trivial es superllave.`);return;}
    const plus=closure(node.schema,node.rules,v.left), minus=union(difference(node.schema,plus),v.left);
    node.cut={left:v.left,plus,minus};
    node.children=[plus,minus].map((schema,i)=>({schema,rules:project(node.schema,node.rules,schema),path:node.path+(i?'-':'+')}));
    record('corte',`${node.path}: ${setText(v.left)}+ = ${setText(plus)}; complemento con determinante = ${setText(minus)}. Intersección ${setText(v.left)}; determina el componente +. Corte propio y sin pérdida.`);
    node.children.forEach(n=>visit(n));
  }
  visit(tree,true);
  const leaves=n=>n.children?n.children.flatMap(leaves):[n.schema];
  const components=leaves(tree), check=preservation(universe,rules,components);
  record('fin',check.preserved?'La unión de proyecciones implica todas las reglas originales.':'No se preservan: '+check.lost.map(f=>`${ruleText(f)} (clausura local ${setText(f.closure)})`).join('; '));
  return {components,tree,steps,...check};
}
export function oneKey(universe,rules) {
  let k=[...universe];
  for(const a of [...universe].reverse()) {const smaller=difference(k,[a]);if(closure(universe,rules,smaller).length===universe.length)k=smaller;}
  return k;
}
export function synthesize(universe,rules,simplify=false) {
  const cover=minimalCover(universe,rules), k=oneKey(universe,cover.rules);
  let components=cover.rules.map(f=>union(f.left,f.right));
  const steps=cover.steps.map(copy);
  steps.push({step:steps.length,operation:'relaciones',explanation:'Una relación XA por cada regla X → a de la cubierta.',rules:copy(cover.rules),components:copy(components)});
  components.push(k);
  steps.push({step:steps.length,operation:'llave',explanation:`Añadir siempre K = ${setText(k)}. Su proyección no tiene DF no triviales.`,rules:copy(cover.rules),components:copy(components)});
  if(simplify) {
    components=components.filter((s,i,all)=>!all.some((t,j)=>j!==i && subset(s,t) && (s.length<t.length || j<i)));
    steps.push({step:steps.length,operation:'simplificar',explanation:'Simplificación opcional: eliminar esquemas contenidos y copias repetidas.',rules:copy(cover.rules),components:copy(components)});
  }
  return {cover:cover.rules,key:k,components,steps};
}
function renderTree(node) {
  const box=el('div',undefined,'db-viz-tree');
  box.append(el('p',`${node.path} = {${setText(node.schema)}}${node.valid?' — BCNF':''}`));
  const details=el('details'), summary=el('summary','Base proyectada (sin reglas triviales)');
  details.append(summary,el('p',node.rules.map(ruleText).join('; ')||'Base vacía'));box.append(details);
  if(node.cut)box.append(el('p',`X = ${setText(node.cut.left)}; X+ = ${setText(node.cut.plus)}; U− = ${setText(node.cut.minus)}`));
  if(node.children)node.children.forEach(c=>box.append(renderTree(c)));
  return box;
}
export function init(root) {
  attach(root,()=>{
    const box=el('section');box.append(el('h3','Explorar la normalización'));
    const form=el('form',undefined,'db-viz-form');
    const u=field('Atributos (máximo 6)','ABCDE'),f=field('Dependencias (máximo 40)',fixture.rules.map(ruleText).join('; '),true);
    const mode=selectField('Procedimiento',[['bcnf','BCNF por clausura'],['cover','Cubierta minimal'],['synthesis','Síntesis 3NF: versión base'],['simple','Síntesis 3NF: simplificar esquemas contenidos']]);
    mode.input.value=root.dataset.dbMode||'bcnf';
    const choice=field('Primer determinante violatorio en BCNF (vacío: automático)','B');
    const submit=el('button','Generar traza');submit.type='submit';
    const error=el('p','','db-viz-error');error.setAttribute('role','alert');const output=el('div');
    form.append(u.wrapper,f.wrapper,mode.wrapper,choice.wrapper,submit,error);box.append(form,output);
    function calculate(){
      try {
        const data=parse(u.input.value,f.input.value,'',6);
        const preferred=mode.input.value==='bcnf' && choice.input.value.trim()?parse(u.input.value,'',choice.input.value,6).seed:undefined;
        const result=mode.input.value==='bcnf'?bcnf(data.universe,data.rules,preferred):mode.input.value==='cover'?minimalCover(data.universe,data.rules):synthesize(data.universe,data.rules,mode.input.value==='simple');
        output.replaceChildren(player(result.steps,state=>{
          const view=el('div');
          if(state.tree)view.append(renderTree(state.tree));
          if(state.rules)view.append(table('Cubierta actual',['Dependencia'],state.rules.map(f=>[ruleText(f)])));
          if(state.components)view.append(table('Relaciones de la síntesis',['Esquema','Forma normal (DF proyectadas)'],state.components.map(s=>{const nf=normalForms(s,project(data.universe,data.rules,s));return [setText(s),nf.bcnf?'BCNF (también 3NF)':nf.third?'3NF':'No está en 3NF'];})));
          return view;
        })); error.textContent='';
      }catch(e){output.replaceChildren();error.textContent=e.message;}
    }
    form.onsubmit=e=>{e.preventDefault();calculate();};
    mode.input.onchange=()=>{choice.input.disabled=mode.input.value!=='bcnf';calculate();};
    choice.input.disabled=mode.input.value!=='bcnf';calculate();return box;
  });
}
