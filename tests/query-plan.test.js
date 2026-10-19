import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {node,tableNode as table,select,project,binary,delta,attr,literal,compare,and,or,not,evaluate,validatePlan,applyRule,exampleTrace,examples,universityPlan,universityData,comparePlans} from '../assets/js/visualizaciones/query-plan-model.js';
// Independent oracle: fixed schema tuples encoded as positional arrays, with
// occurrence counting rather than the engine's serialization/frequency helpers.
const counts=(rows,columns)=>{
 const m={};for(const row of rows){const key=JSON.stringify(columns.map(c=>row[c]));m[key]=(m[key]??0)+1;}
 return Object.fromEntries(Object.entries(m).sort(([a],[b])=>a.localeCompare(b)));
};
const eq=(a,b)=>assert.deepEqual(counts(a,Object.keys(a[0]??b[0]??{}).sort()),counts(b,Object.keys(a[0]??b[0]??{}).sort()));
const R=table('R','R',['x']),S=table('S','S',['x']),T=table('T','T',['x']);
const cmp=(op,name,v)=>compare(op,attr(name),literal(v));
const op=(type,a,b,semantics='bag')=>binary(type,`${type}-${a.id}-${b.id}`,a,b,{semantics});
const expand=(a,b)=>[...Array(a).fill(null).map(()=>({x:0})),...Array(b).fill(null).map(()=>({x:1}))];

test('P5: arithmetic multiplicity oracles for union/intersection/difference, including empty bags',()=>{
 for(let a=0;a<=3;a++)for(let b=0;b<=3;b++)for(let c=0;c<=3;c++)for(let d=0;d<=3;d++) {
   const data={R:expand(a,b),S:expand(c,d)};
   for(const [type,n,m] of [['union',a+c,b+d],['intersect',Math.min(a,c),Math.min(b,d)],['difference',Math.max(a-c,0),Math.max(b-d,0)]])
     assert.deepEqual(counts(evaluate(op(type,R,S),data),['x']),counts(expand(n,m),['x']));
   for(const [type,n,m] of [['union',Number(a+c>0),Number(b+d>0)],['intersect',Number(a>0&&c>0),Number(b>0&&d>0)],['difference',Number(a>0&&c===0),Number(b>0&&d===0)]])
     assert.deepEqual(counts(evaluate(op(type,R,S,'set'),data),['x']),counts(expand(n,m),['x']));
 }
});
test('P5: selection and projection preserve and sum occurrence counts',()=>{
 const data={P:[{id:1,x:2},{id:2,x:2},{id:2,x:2},{id:3,x:4}]},P=table('P','P',['id','x']);
 assert.deepEqual(counts(evaluate(project('p',['x'],P),data),['x']),{'[2]':3,'[4]':1});
 assert.deepEqual(counts(evaluate(select('s',cmp('=', 'x',2),P),data),['id','x']),{'[1,2]':1,'[2,2]':2});
 assert.deepEqual(counts(evaluate(delta('d',project('p',['x'],P)),data),['x']),{'[2]':1,'[4]':1});
});
test('P5: product, theta/equijoin and natural join multiply occurrences',()=>{
 const A=table('A','A',['a']),B=table('B','B',['b']),data={A:[{a:1},{a:1},{a:2}],B:[{b:1},{b:1},{b:1}]};
 assert.deepEqual(counts(evaluate(op('product',A,B),data),['a','b']),{'[1,1]':6,'[2,1]':3});
 const p=compare('=',attr('a'),attr('b'));
 eq(evaluate(binary('join','j',A,B,{predicate:p}),data),evaluate(select('s',p,op('product',A,B)),data));
 assert.deepEqual(counts(evaluate(binary('natural','n',R,S),{R:[{x:1},{x:1}],S:[{x:1},{x:1},{x:1},{x:2}]}),['x']),{'[1]':6});
});
test('P5: commutativity and associativity on all small duplicate counts',()=>{
 const A=table('A','A',['a']),B=table('B','B',['b']),C=table('C','C',['c']);
 for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++) {
  const data={R:expand(a,b),S:expand(b,c),T:expand(c,a),A:Array(a).fill({a:1}),B:Array(b).fill({b:1}),C:Array(c).fill({c:1})};
  for(const type of ['union','intersect']) {
   eq(evaluate(op(type,R,S),data),evaluate(op(type,S,R),data));
   eq(evaluate(op(type,op(type,R,S),T),data),evaluate(op(type,R,op(type,S,T)),data));
  }
  for(const type of ['product','natural']) {
   eq(evaluate(op(type,A,B),data),evaluate(op(type,B,A),data));
   eq(evaluate(op(type,op(type,A,B),C),data),evaluate(op(type,A,op(type,B,C)),data));
  }
 }
 const A1=table('A','A',['a','k']),B1=table('B','B',['k','b']),C1=table('C','C',['b','c']);
 const data={A:[{a:0,k:1},{a:0,k:1}],B:[{k:1,b:2}],C:[{b:2,c:3},{b:2,c:3}]};
 eq(evaluate(op('natural',op('natural',A1,B1),C1),data),evaluate(op('natural',A1,op('natural',B1,C1)),data));
});
test('P5: qualified theta joins reassociate only with predicates available at each join',()=>{
 const A=table('A','A',['a']),B=table('B','B',['b']),C=table('C','C',['c']);
 const ab=compare('=',attr('a'),attr('b')),bc=compare('=',attr('b'),attr('c'));
 const left=binary('join','outer',binary('join','inner',A,B,{predicate:ab}),C,{predicate:bc});
 const right=binary('join','outer',A,binary('join','inner',B,C,{predicate:bc}),{predicate:ab});
 const data={A:[{a:1},{a:1},{a:2}],B:[{b:1},{b:2}],C:[{c:1},{c:1}]};eq(evaluate(left,data),evaluate(right,data));
 const bad=binary('join','bad',B,C,{predicate:ab});assert.equal(validatePlan(bad).valid,false);
});
test('P5: distributivity holds for sets and fails for additive bags, with exact witness',()=>{
 const left=op('intersect',R,op('union',S,T));
 const R2=table('R2','R',['x']),right=op('union',op('intersect',R,S),op('intersect',R2,T));
 const data={R:[{x:1}],S:[{x:1}],T:[{x:1}]};
 assert.deepEqual(counts(evaluate(left,data),['x']),{'[1]':1});assert.deepEqual(counts(evaluate(right,data),['x']),{'[1]':2});
 for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++) {
  const data={R:expand(a,b),S:expand(b,c),T:expand(c,a)};
  eq(evaluate(delta('d',left),data),evaluate(delta('d',right),data));
 }
});
test('P5: selection laws across union/intersection/difference/product/join',()=>{
 const p=cmp('=', 'x',1),q=cmp('≥','x',0);
 for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++) {
  const data={R:expand(a,b),S:expand(c,a)};
  eq(evaluate(select('s',and(p,q),R),data),evaluate(select('p',p,select('q',q,R)),data));
  for(const type of ['union','intersect','difference']) {
   eq(evaluate(select('s',p,op(type,R,S)),data),evaluate(op(type,select('r',p,R),select('ss',p,S)),data));
   if(type!=='union')eq(evaluate(select('s',p,op(type,R,S)),data),evaluate(op(type,select('r',p,R),S),data));
  }
 }
 const A=table('A','A',['a']),B=table('B','B',['b']),data={A:[{a:1},{a:1},{a:2}],B:[{b:1},{b:2}]};
 for(const type of ['product','join']) {
  const j=(a,b)=>binary(type,'j',a,b,type==='join'?{predicate:compare('=',attr('a'),attr('b'))}:{});
  eq(evaluate(select('s',cmp('=', 'a',1),j(A,B)),data),evaluate(j(select('s',cmp('=', 'a',1),A),B),data));
 }
});
test('P5: OR splitting overlap and disjoint repair, also with duplicate input rows',()=>{
 const p=cmp('>', 'x',0),q=cmp('<','x',3),S2=table('R2','R',['x']),data={R:[{x:2},{x:2},{x:4}]};
 const original=select('s',or(p,q),R),bad=op('union',select('p',p,R),select('q',q,S2));
 assert.equal(evaluate(original,data).length,3);assert.equal(evaluate(bad,data).length,5);
 eq(evaluate(original,data),evaluate(op('union',select('p',p,R),select('q',and(q,not(p)),S2)),data));
});
test('P5: complete valid trace is built with verified rules, preserves bags and does not mutate input',()=>{
 const trace=exampleTrace('valido');assert.equal(trace.steps.length,5);
 const input=universityPlan(),snapshot=JSON.stringify(input),expected=[{'e.nombre':'Alex','c.nombre':'Bases de Datos'},{'e.nombre':'Alex','c.nombre':'Bases de Datos'}];
 for(const step of trace.steps) {
  assert.equal(validatePlan(step.plan).valid,true);eq(evaluate(step.plan,trace.data),expected);
  if(step.rule!=='inicio')assert.ok(step.preconditions&&step.justification&&step.preserve);
 }
 assert.equal(JSON.stringify(input),snapshot);assert.equal(Object.isFrozen(trace.steps[4].plan),true);
 const result=comparePlans(trace.steps[0].plan,trace.steps.at(-1).plan,trace.data);assert.equal(result.original.metrics.EC.rows,24);
 assert.equal(result.modified.rows.length,2);
});
test('P5: validated rewrite shapes reject unsatisfied preconditions and absent targets',()=>{
 const p=universityPlan();assert.throws(()=>applyRule(p,'E','product-to-join'),/Precondición/);
 assert.throws(()=>applyRule(p,'missing','push-selection'),/desconocidos/);
 assert.throws(()=>applyRule(p,'where','remove-delta'),/desconocidos/);
 const joined=exampleTrace('valido').steps[3].plan;
 assert.throws(()=>applyRule(joined,'output','push-projection',{keep:[['e.nombre'],['c.nombre']]}),/Precondición/);
 assert.equal(validatePlan(joined).valid,true);
});
test('P5: projection retains pending filters and join attributes, with independent output',()=>{
 const data={A:[{a:1,z:7},{a:1,z:8}],B:[{b:1,v:2},{b:2,v:2}]};
 const A=table('A','A',['a','z']),B=table('B','B',['b','v']),p=compare('=',attr('a'),attr('b'));
 const plan=project('out',['v'],binary('join','j',A,B,{predicate:p}));
 const rewritten=applyRule(plan,'out','push-projection').after;
 assert.deepEqual(counts(evaluate(rewritten,data),['v']),{'[2]':2});eq(evaluate(plan,data),evaluate(rewritten,data));
 const selected=project('out',['a'],select('s',cmp('=', 'z',7),A));
 const pushed=applyRule(selected,'out','push-projection').after;
 assert.ok(pushed.children[0].children[0].schema.includes('z'));eq(evaluate(selected,data),evaluate(pushed,data));
});
test('P5: schemas, renaming collisions and missing references are structural errors even on empty inputs',()=>{
 const renamed=node('rename','r',[R],{mapping:{x:'y'}});assert.deepEqual(renamed.schema,['y']);
 assert.deepEqual(binary('natural','n',R,S).required,['x']);assert.deepEqual(delta('d',R).required,['x']);
 assert.deepEqual(evaluate(renamed,{R:[{x:2},{x:2}]}),[{y:2},{y:2}]);
 assert.equal(validatePlan(select('s',cmp('=', 'x',1),renamed)).valid,false);
 const A=table('A','A',['x','y']);assert.equal(validatePlan(node('rename','r',[A],{mapping:{x:'y'}})).valid,false);
 assert.equal(validatePlan(op('union',R,renamed)).valid,false);assert.equal(validatePlan(op('product',R,S)).valid,false);
 const invalid=project('p',['y'],R);assert.throws(()=>evaluate(invalid,{R:[]}),/Falta y/);
 const t=exampleTrace('atributos');const c=comparePlans(t.steps[1].before,t.steps[1].after,t.data);
 assert.equal(c.classification,'mal definida');assert.equal(c.modified,null);assert.equal(c.errors[0].attribute,'e.rut');
});
test('P5: delta rules, lost keys and complete joins, plus failed difference/union rewrites',()=>{
 const data={R:[{x:1},{x:1},{x:2}],S:[{x:1}]},p=cmp('=', 'x',1);
 eq(evaluate(delta('d',select('s',p,R)),data),evaluate(select('s',p,delta('d',R)),data));
 eq(evaluate(delta('d',op('intersect',R,S)),data),evaluate(op('intersect',delta('dr',R),delta('ds',S)),data));
 assert.notDeepEqual(counts(evaluate(delta('d',op('difference',R,S)),data),['x']),counts(evaluate(op('difference',delta('dr',R),delta('ds',S)),data),['x']));
 assert.notDeepEqual(counts(evaluate(delta('d',op('union',R,S)),data),['x']),counts(evaluate(op('union',delta('dr',R),delta('ds',S)),data),['x']));
 const A=table('A','A',['a']),B=table('B','B',['b']),data2={A:[{a:1},{a:1}],B:[{b:1},{b:1},{b:1}]};
 for(const type of ['product','join','natural']) {
  const j=(a,b)=>binary(type,'j',a,b,type==='join'?{predicate:compare('=',attr('a'),attr('b'))}:{});
  eq(evaluate(delta('d',j(A,B)),data2),evaluate(j(delta('da',A),delta('db',B)),data2));
 }
 const t=exampleTrace('distinct');assert.equal(evaluate(t.steps[1].before,t.data).length,1);assert.equal(evaluate(t.steps[1].after,t.data).length,2);
});
test('P5: grouping aggregates, complete-row deduplication and empty global/grouped input',()=>{
 const G=table('G','G',['g','v']);const group=child=>node('group','g',[child],{groups:['g'],aggregates:['MIN','MAX','SUM','COUNT','AVG'].map(fn=>({fn,attribute:'v',as:fn}))});
 const data={G:[{g:'A',v:2},{g:'A',v:2},{g:'A',v:8}]};
 assert.deepEqual(evaluate(group(G),data),[{g:'A',MIN:2,MAX:8,SUM:12,COUNT:3,AVG:4}]);
 assert.deepEqual(evaluate(group(delta('d',G)),data),[{g:'A',MIN:2,MAX:8,SUM:10,COUNT:2,AVG:5}]);
 eq(evaluate(delta('d',group(G)),data),evaluate(group(G),data));
 assert.deepEqual(evaluate(group(G),{G:[]}),[]);
 const global=node('group','g',[G],{groups:[],aggregates:[{fn:'COUNT',as:'n'},{fn:'SUM',attribute:'v',as:'s'}]});
 assert.deepEqual(evaluate(global,{G:[]}),[{n:0,s:null}]);
 const P=table('P','P',['id','g','v']),data2={P:[{id:1,g:'A',v:2},{id:2,g:'A',v:2}]};
 eq(evaluate(group(delta('d',P)),data2),evaluate(group(P),data2));
});
test('P5: every diagnostic has an independently counted counterexample or explained missing attribute',()=>{
 for(const {id} of examples) {
  const t=exampleTrace(id);
  for(const s of t.steps) {
   if(s.classification==='mal definida')assert.equal(validatePlan(s.after).valid,false);
   else if(s.classification==='incorrecta')assert.notDeepEqual(counts(evaluate(s.before,t.data),s.before.schema),counts(evaluate(s.after,t.data),s.after.schema));
   else eq(evaluate(s.before,t.data),evaluate(s.after,t.data));
  }
 }
});
test('P5: reject NULL, incompatible comparisons and nonnumeric sums instead of coercing SQL semantics',()=>{
 assert.throws(()=>evaluate(R,{R:[{x:null}]}),/nulos/);
 assert.throws(()=>evaluate(select('s',cmp('=', 'x','1'),R),{R:[{x:1}]}),/tipos/);
 const g=node('group','g',[R],{groups:[],aggregates:[{fn:'SUM',attribute:'x',as:'s'}]});
 assert.throws(()=>evaluate(g,{R:[{x:'a'}]}),/números/);
});
test('P5: SQLite executes the public source examples and compares bags, syntax/semantic failures and advanced rewrite',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const code=String.raw`
import sqlite3,re,json
from pathlib import Path
from collections import Counter
root=Path(${JSON.stringify(root)})
a=(root/'procesamiento/planes-logicos.qmd').read_text(); b=(root/'procesamiento/reescritura.qmd').read_text()
def block(text,id):return re.search(r'\x60{3}\{\.sql #'+id+r'\}\n(.*?)\x60{3}',text,re.S).group(1)
c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON');c.executescript(block(a,'p5-datos'))
original=block(a,'p5-original'); rewritten=block(a,'p5-reescrito')
assert Counter(c.execute(original))==Counter(c.execute(rewritten))==Counter({('Alex','Bases de Datos'):2})
assert Counter(c.execute(original.replace('SELECT e.nombre','SELECT DISTINCT e.nombre')))==Counter({('Alex','Bases de Datos'):1})
assert Counter(c.execute(block(b,'p5-avanzado')))==Counter(c.execute(block(b,'p5-avanzado-reescrito')))==Counter({('Alex',):1})
x=block(b,'p5-avanzado').replace('SELECT DISTINCT','SELECT');y=block(b,'p5-avanzado-reescrito').replace('SELECT DISTINCT','SELECT')
assert Counter(c.execute(x))==Counter({('Alex',):2});assert Counter(c.execute(y))==Counter({('Alex',):4})
assert c.execute(block(b,'p5-agregados')).fetchall()==[('A',2,8,12,3,4.0)]
assert c.execute(block(b,'p5-agregados').replace('FROM R GROUP','FROM (SELECT DISTINCT g,v FROM R) GROUP')).fetchall()==[('A',2,8,10,2,5.0)]
assert {r[0] for r in c.execute("SELECT name FROM main.sqlite_schema WHERE type='table'")}=={'Estudiante','Curso','Inscribe'}
for sql,reason in [('SELECT nombre FROM Estudiante WHERE carrera =','incomplete'),('SELECT nombre FROM Estudiante, Curso','ambiguous'),('SELECT fantasma FROM Estudiante','no such column'),('SELECT e.nombre FROM (SELECT nombre FROM Estudiante) e JOIN Inscribe i ON e.rut=i.rut','no such column')]:
 try:c.execute(sql)
 except sqlite3.OperationalError as e:assert reason in str(e),str(e)
 else:raise AssertionError(sql)
assert c.execute('SELECT COUNT(*) FROM Estudiante, Curso').fetchone()==(6,)
# Independent SQL witnesses for overlap, premature deduplication and lost keys.
assert c.execute('WITH R(x) AS (VALUES(2)) SELECT x FROM R WHERE x>0 OR x<3').fetchall()==[(2,)]
assert c.execute('WITH R(x) AS (VALUES(2)) SELECT x FROM R WHERE x>0 UNION ALL SELECT x FROM R WHERE x<3').fetchall()==[(2,),(2,)]
print('SQLite',sqlite3.sqlite_version,': public P5 source examples, bags and four counterexamples passed')
`;
 const result=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);console.log(result.stdout.trim());
});
test('P5: pure model has no browser dependency',()=>{
 const source=readFileSync(new URL('../assets/js/visualizaciones/query-plan-model.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:document|window)\b/);
});

test('P5: five-stage rewrite agrees with an independent three-loop SQL oracle on 80 duplicate-rich instances',()=>{
 const trace=exampleTrace('valido');let seed=157;
 const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let trial=0;trial<80;trial++) {
  const data={E:[],I:[],C:[]};
  for(let i=0;i<random(6);i++)data.E.push({'e.rut':`r${random(3)}`,'e.nombre':['Alex','Sol'][random(2)],'e.carrera':['Computación','Artes'][random(2)]});
  for(let i=0;i<random(8);i++)data.I.push({'i.rut':`r${random(3)}`,'i.codigo':`C${random(2)}`,'i.semestre':['2026-1','2026-2'][random(2)]});
  for(let i=0;i<random(5);i++)data.C.push({'c.codigo':`C${random(2)}`,'c.nombre':['Datos','Cálculo'][random(2)],'c.creditos':random(7)});
  const expected=[];for(const e of data.E)for(const i of data.I)for(const c of data.C)
   if(e['e.rut']===i['i.rut']&&i['i.codigo']===c['c.codigo']&&e['e.carrera']==='Computación'&&i['i.semestre']==='2026-2')expected.push({'e.nombre':e['e.nombre'],'c.nombre':c['c.nombre']});
  for(const step of trace.steps)assert.deepEqual(counts(evaluate(step.plan,data),['e.nombre','c.nombre']),counts(expected,['e.nombre','c.nombre']));
 }
});

test('P5: premature projection through intersection and a removed predicate have different, evaluable results',()=>{
 const A=table('A','A',['a','b']),B=table('B','B',['a','b']),data={A:[{a:1,b:2}],B:[{a:1,b:3}]};
 assert.deepEqual(evaluate(project('p',['a'],op('intersect',A,B)),data),[]);
 assert.deepEqual(evaluate(op('intersect',project('pa',['a'],A),project('pb',['a'],B)),data),[{a:1}]);
 const E=table('E','E',['e.rut','e.nombre']),I=table('I','I',['i.rut']),p=compare('=',attr('e.rut'),attr('i.rut'));
 const d={E:[{'e.rut':'r1','e.nombre':'Alex'},{'e.rut':'r2','e.nombre':'Sol'}],I:[{'i.rut':'r1'}]};
 const original=project('p',['e.nombre'],binary('join','j',E,I,{predicate:p}));
 const bad=project('p',['e.nombre'],op('product',project('pe',['e.nombre'],E),I));
 assert.deepEqual(evaluate(original,d),[{'e.nombre':'Alex'}]);assert.deepEqual(evaluate(bad,d),[{'e.nombre':'Alex'},{'e.nombre':'Sol'}]);
});
