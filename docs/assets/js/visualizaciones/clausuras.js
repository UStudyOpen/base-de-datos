import {el, field, selectField, table, player, attach, setText, ruleText} from './core.js';
export const subset = (a, b) => a.every(x => b.includes(x));
export const union = (...sets) => [...new Set(sets.flat())].sort();
export const difference = (a, b) => a.filter(x => !b.includes(x));
export const fixture = {universe: [...'ABCDE'], rules: [['A','B'],['A','C'],['B','E'],['CE','A'],['CE','D']].map(([l,r]) => ({left:[...l], right:[...r]}))};
export function validate(universe, rules, seed = [], limit = 8) {
  if (!Array.isArray(universe) || universe.length > limit || new Set(universe).size !== universe.length || universe.some(x => !/^[A-Z]$/.test(x))) throw new Error(`Usa hasta ${limit} atributos distintos, de A a Z.`);
  if (!Array.isArray(rules) || rules.length > 40) throw new Error('Se admiten hasta 40 reglas.');
  if (!subset(seed, universe)) throw new Error('La semilla contiene atributos ajenos al esquema.');
  for (const f of rules) if (!Array.isArray(f.left) || !Array.isArray(f.right) || !subset([...f.left,...f.right], universe)) throw new Error('Una regla contiene atributos ajenos al esquema.');
}
export function parse(universe, rules, seed = '', limit = 8) {
  const attrs = s => {
    if (!/^[A-Z\s,∅]*$/.test(s)) throw new Error('Escribe atributos de una letra mayúscula; separa con comas o espacios.');
    const a = s.replace(/[\s,∅]/g,'');
    if (new Set(a).size !== a.length) throw new Error('No repitas atributos dentro de un conjunto.');
    return [...a].sort();
  };
  const u = attrs(universe), x = attrs(seed);
  const f = rules.trim() ? rules.split(/;|\n/).filter(s => s.trim()).map(s => {
    const sides = s.split(/->|→/); if (sides.length !== 2) throw new Error('Cada regla debe tener la forma A -> BC; usa ∅ para el vacío.');
    return {left:attrs(sides[0]),right:attrs(sides[1])};
  }) : [];
  validate(u,f,x,limit); return {universe:u,rules:f,seed:x};
}
// Pending rules are removed even when they add no attribute. Choice is input order.
export function closureTrace(universe, rules, seed) {
  let known = union(seed), pending = rules.map((_,i) => i), used = [];
  const steps = [];
  function snapshot(operation, explanation, added = []) {
    steps.push({step:steps.length, operation, explanation, known:[...known], pending:[...pending], used:[...used], applicable:pending.filter(i => subset(rules[i].left,known)), applied:operation === 'aplicar' ? used.at(-1) : null, added});
  }
  snapshot('inicio', `Semilla ${setText(known)}. Invariante: solo atributos implicados.`);
  while (true) {
    const i = pending.find(i => subset(rules[i].left,known));
    if (i === undefined) break;
    const added = difference(rules[i].right,known);
    known = union(known,rules[i].right); pending = pending.filter(j => j!==i); used.push(i);
    snapshot('aplicar', `${ruleText(rules[i])}: antecedente contenido. ${added.length ? 'Añade '+setText(added) : 'No añade atributos; se retira y se continúa'}.`, added);
  }
  snapshot('fin', `No queda ninguna regla pendiente aplicable. Clausura: ${setText(known)}.`);
  return steps;
}
export function closure(universe, rules, seed) {
  let known = new Set(seed), pending = [...rules];
  while (true) {
    const index = pending.findIndex(f => f.left.every(a => known.has(a)));
    if (index < 0) return universe.filter(a => known.has(a));
    const [f] = pending.splice(index,1); f.right.forEach(a => known.add(a));
  }
}
export function subsets(universe) {
  const out = [[]];
  for (const a of universe) out.push(...out.map(x => [...x,a]));
  return out.sort((a,b) => a.length-b.length || a.join('').localeCompare(b.join('')));
}
export function keyCertificate(universe, rules, candidate) {
  const result = closure(universe,rules,candidate);
  const deletions = candidate.map(a => ({removed:a, result:closure(universe,rules,candidate.filter(x => x!==a))}));
  return {candidate,result,deletions,isKey:result.length===universe.length && deletions.every(d => d.result.length<universe.length)};
}
export function keys(universe, rules) {
  const found = [];
  for (const candidate of subsets(universe)) {
    if (found.some(k => subset(k,candidate))) continue;
    if (closure(universe,rules,candidate).length===universe.length) found.push(candidate);
  }
  return found;
}
export const presets = [
  ['principal','ABCDE','A -> B; A -> C; B -> E; CE -> A; CE -> D','A'],
  ['ciclo','ABC','A -> B; B -> A; B -> C','A'],
  ['constantes','ABC','∅ -> A; A -> B','∅'],
  ['vacio','ABC','','A'],
  ['redundancia','ABC','A -> A; A -> B; B -> C; A -> C','A']
];
export function init(root) {
  attach(root, () => {
    const box = el('section'); box.append(el('h3','Explorar clausuras y llaves'));
    const form = el('form',undefined,'db-viz-form');
    const u=field('Atributos (máximo 8)','ABCDE'), f=field('Dependencias (una por línea o separadas por ;)',presets[0][2],true), x=field('Semilla','A');
    const preset=selectField('Ejemplo',presets.map(p=>[p[0],p[0]]));
    const submit=el('button','Calcular'); submit.type='submit';
    const error=el('p','', 'db-viz-error'); error.setAttribute('role','alert');
    const output=el('div');
    form.append(preset.wrapper,u.wrapper,f.wrapper,x.wrapper,submit,error); box.append(form,output);
    function calculate() {
      try {
        const data=parse(u.input.value,f.input.value,x.input.value);
        const cert=keyCertificate(data.universe,data.rules,data.seed);
        const result=el('div');
        result.append(player(closureTrace(data.universe,data.rules,data.seed),state=>{
          const view=el('div'); view.append(el('p',`Acumulado: {${setText(state.known)}}`));
          view.append(table('Estado de las reglas',['Regla','Estado'],data.rules.map((r,i)=>[ruleText(r),state.applied===i?'Aplicada en este paso':state.used.includes(i)?'Aplicada antes':state.applicable.includes(i)?'Pendiente, aplicable':'Pendiente, antecedente incompleto']))); return view;
        }));
        result.append(el('p',`Semilla: ${cert.isKey?'llave candidata':cert.result.length===data.universe.length?'superllave no minimal':'no es superllave'}.`));
        const all=keys(data.universe,data.rules);
        result.append(table('Todas las llaves y certificado de minimalidad',['Llave','Clausuras al quitar un atributo'],all.map(k=>[setText(k),keyCertificate(data.universe,data.rules,k).deletions.map(d=>`sin ${d.removed}: ${setText(d.result)}`).join('; ')||'Vacía: no hay subconjunto propio'])));
        if (cert.deletions.length) result.append(table('Comprobación de la semilla',['Atributo eliminado','Clausura'],cert.deletions.map(d=>[d.removed,setText(d.result)])));
        output.replaceChildren(result); error.textContent='';
      } catch(e) { output.replaceChildren(); error.textContent=e.message; }
    }
    form.onsubmit=e=>{e.preventDefault();calculate();};
    preset.input.onchange=()=>{const p=presets.find(p=>p[0]===preset.input.value);u.input.value=p[1];f.input.value=p[2];x.input.value=p[3];calculate();};
    calculate(); return box;
  });
}
