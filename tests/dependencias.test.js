import test from 'node:test';
import assert from 'node:assert/strict';
import {closure, closureTrace, keys, subsets, keyCertificate, fixture, parse} from '../assets/js/visualizaciones/clausuras.js';
import {project, normalForms, minimalCover, bcnf, synthesize, preservation} from '../assets/js/visualizaciones/normalizacion.js';
// Independent semantic oracle: all possible agreement sets of two tuples.
// A set C is admissible iff every FD whose left side agrees has its right side in C.
function reference(u,fs,x) {
  const closed=[];
  for(let mask=0;mask<2**u.length;mask++){
    const c=new Set(u.filter((_,i)=>mask & 2**i));
    if(x.every(a=>c.has(a)) && fs.every(f=>!f.left.every(a=>c.has(a)) || f.right.every(a=>c.has(a))))closed.push(c);
  }
  return u.filter(a=>closed.every(c=>c.has(a)));
}
function refKeys(u,fs) {
  const superkeys=subsets(u).filter(x=>reference(u,fs,x).length===u.length);
  return superkeys.filter(x=>!superkeys.some(y=>y.length<x.length && y.every(a=>x.includes(a))));
}
function isNormal(u,fs,third=false) {
  const prime=new Set(refKeys(u,fs).flat());
  return subsets(u).every(x=>{const c=reference(u,fs,x);return c.length===u.length || c.every(a=>x.includes(a)||(third&&prime.has(a)));});
}
// Independent chase of a decomposition, using symbol equivalence classes.
function lossless(u,fs,parts) {
  const rows=parts.map((s,i)=>u.map(a=>s.includes(a)?'a'+a:`b${i}${a}`));
  const parent=new Map(rows.flat().map(s=>[s,s]));
  const root=s=>{while(parent.get(s)!==s)s=parent.get(s);return s;};
  let change=true;
  while(change){change=false;for(const f of fs)for(const r of rows)for(const s of rows){
    if(!f.left.every(a=>root(r[u.indexOf(a)])===root(s[u.indexOf(a)])))continue;
    for(const a of f.right){let x=root(r[u.indexOf(a)]),y=root(s[u.indexOf(a)]);if(x!==y){if(y.startsWith('a'))[x,y]=[y,x];parent.set(y,x);change=true;}}
  }}
  return rows.some(r=>u.every((a,i)=>root(r[i])===root('a'+a)));
}
const {universe:u,rules:f}=fixture;
test('P1: three candidate keys, 22 superkeys, prime attributes, 3NF but not BCNF',()=>{
 assert.deepEqual(keys(u,f),[['A'],['B','C'],['C','E']]);
 assert.equal(subsets(u).filter(x=>reference(u,f,x).length===5).length,22);
 const nf=normalForms(u,f);assert.deepEqual(nf.prime,[...'ABCE']);assert.equal(nf.third,true);assert.equal(nf.bcnf,false);
 for(const k of keys(u,f))assert.equal(keyCertificate(u,f,k).isKey,true);
});
test('P2: BCNF cut, chase and lost dependencies',()=>{
 const result=bcnf(u,f,['B']);assert.deepEqual(result.components,[[...'BE'],[...'ABCD']]);
 assert.equal(lossless(u,f,result.components),true);
 assert.deepEqual(result.lost.map(x=>x.right.join('')),['A','D']);
 assert.deepEqual(result.lost[0].closure,[...'CE']);
 for(const s of result.components)assert.ok(isNormal(s,project(u,f,s)));
 // Two legal local instances; their join violates CE -> A and CE -> D.
 const be=[{B:0,E:0},{B:1,E:0}], abcd=[{A:0,B:0,C:0,D:0},{A:1,B:1,C:0,D:1}];
 const sat=(rows,fs)=>fs.every(g=>rows.every(t=>rows.every(s=>!g.left.every(a=>t[a]===s[a])||g.right.every(a=>t[a]===s[a]))));
 assert.ok(sat(be,project(u,f,[...'BE'])));assert.ok(sat(abcd,project(u,f,[...'ABCD'])));
 assert.equal(sat(abcd.map(t=>({...t,E:0})),f),false);
});
test('Cycles, constants, empty F, empty universe, redundant first rule',()=>{
 for(const [us,rs,x,expected] of [['ABC','A -> B; B -> A; B -> C','A','ABC'],['ABC','∅ -> A; A -> B','','AB'],['ABC','','A','A'],['ABC','A -> A; A -> B; B -> C','A','ABC'],['','','','']]) {
  const d=parse(us,rs,x);assert.deepEqual(closure(d.universe,d.rules,d.seed),[...expected]);
  const trace=closureTrace(d.universe,d.rules,d.seed);assert.deepEqual(trace.at(-1).known,[...expected]);
  for(let i=1;i<trace.length;i++)assert.ok(trace[i-1].known.every(a=>trace[i].known.includes(a)));
 }
 const d=parse('AB','∅ -> A');assert.equal(normalForms(d.universe,d.rules).bcnf,false);assert.ok(lossless(d.universe,d.rules,bcnf(d.universe,d.rules).components));
 assert.deepEqual(keys([...'ABC'],[]),[[...'ABC']]);
 assert.deepEqual(keys([...'AB'],parse('AB','∅ -> AB').rules),[[]]);
});
test('Derived projections include constants and paths through omitted attributes',()=>{
 const d=parse('ABC','∅ -> A; A -> B; B -> C');
 const p=project(d.universe,d.rules,[...'AC']);assert.deepEqual(reference([...'AC'],p,[]),[...'AC']);
});
test('Minimal cover reduction, equivalence, and K behavior',()=>{
 const d=parse('ABCD','A -> BC; AB -> C; B -> C; C -> C');const g=minimalCover(d.universe,d.rules).rules;
 for(const x of subsets(d.universe))assert.deepEqual(reference(d.universe,g,x),reference(d.universe,d.rules,x));
 const s=synthesize(d.universe,d.rules);assert.ok(lossless(d.universe,d.rules,s.components));assert.ok(preservation(d.universe,d.rules,s.components).preserved);
 assert.deepEqual(s.key,[...'AD']);assert.ok(s.components.some(c=>c.join('')==='AD'));
 const empty=synthesize([...'AB'],[]);assert.deepEqual(empty.components,[[...'AB']]);
 const constant=synthesize([...'AB'],parse('AB','∅ -> AB').rules);assert.deepEqual(constant.key,[]);assert.ok(lossless([...'AB'],parse('AB','∅ -> AB').rules,constant.components));
});
test('Deterministic random schemes: semantic closures, complete keys, covers and decomposition guarantees',()=>{
 let seed=231019;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let trial=0;trial<80;trial++){
  const us=[...'ABCDE'].slice(0,2+random(4)), all=subsets(us), fs=Array.from({length:1+random(7)},()=>({left:all[random(all.length)],right:[us[random(us.length)]]}));
  for(const x of all){assert.deepEqual(closure(us,fs,x),reference(us,fs,x));assert.deepEqual(closure(us,[...fs].reverse(),x),reference(us,fs,x));}
  assert.deepEqual(keys(us,fs),refKeys(us,fs));
  const g=minimalCover(us,fs).rules;
  for(const x of all)assert.deepEqual(reference(us,g,x),reference(us,fs,x));
  for(let i=0;i<g.length;i++){
   assert.equal(g[i].right.length,1);assert.ok(!reference(us,g.filter((_,j)=>i!==j),g[i].left).includes(g[i].right[0]));
   for(const a of g[i].left)assert.ok(!reference(us,g,g[i].left.filter(b=>b!==a)).includes(g[i].right[0]));
  }
  const b=bcnf(us,fs);assert.ok(lossless(us,fs,b.components));for(const s of b.components)assert.ok(isNormal(s,project(us,fs,s)));
  for(const simplify of [false,true]) {const s=synthesize(us,fs,simplify);assert.ok(lossless(us,fs,s.components));assert.ok(preservation(us,fs,s.components).preserved);for(const r of s.components)assert.ok(isNormal(r,project(us,fs,r),true));}
 }
});
test('Invalid input is rejected before state transition',()=>{
 for(const args of [['AA','',''],['AB','A -> C',''],['AB','A B',''],['AB','','Z'],['abcdef','',''],['ABCDEFGHI','','']])assert.throws(()=>parse(...args));
});
test('Trace identifies the exact newly applied rule without changing the closure', () => {
  const d=parse('ABC','A -> B; A -> B; B -> C','A');
  const trace=closureTrace(d.universe,d.rules,d.seed);
  assert.deepEqual(trace.filter(s=>s.operation==='aplicar').map(s=>s.applied),[0,1,2]);
  assert.deepEqual(trace.at(-1).known,[...'ABC']);
  assert.equal(trace.at(-1).applied,null);
  assert.deepEqual(trace.filter(s=>s.operation==='aplicar').map(s=>s.added.join('')),['B','','C']);
});
