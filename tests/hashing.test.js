import test from 'node:test';
import assert from 'node:assert/strict';
import {createStatic,hash,staticInsert,staticSearch,validateStatic,createExtendable,insert,remove,search,values,validateExtendable,buildExtendable,buildStatic,staticKeys,insertKeys,deleteKeys,suffix} from '../assets/js/visualizaciones/hashing-model.js';

// Independent oracle: reconstruct all directory classes from low bits, without
// calling the model's validator, hash, suffix or values functions.
function check(s,expected) {
  assert.equal(s.directory.length,2**s.g);
  const found=[];
  for(const [id,b] of Object.entries(s.buckets)) {
    assert.equal(b.id,id);assert.ok(b.l>=0 && b.l<=s.g);
    assert.ok(b.keys.length<=s.B);
    const refs=s.directory.map((x,i)=>x===id?i:null).filter(x=>x!==null);
    assert.equal(refs.length,2**(s.g-b.l));
    const mask=(1<<b.l)-1;
    assert.deepEqual(refs,Array.from({length:2**s.g},(_,i)=>i).filter(i=>(i&mask)===b.s));
    for(const k of b.keys) {
      assert.equal(k&mask,b.s);assert.equal(s.directory[k&((1<<s.g)-1)],id);found.push(k);
    }
  }
  assert.ok(s.directory.every(id=>s.buckets[id]));
  assert.equal(new Set(found).size,found.length);
  assert.deepEqual(found.sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));
}
const certificate=s=>Object.values(s.buckets).map(b=>[b.s,b.l,[...b.keys]]).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
function transitions(result,expectedBefore,expectedAfter) {
  let prior=result.steps[0].state;
  for(const step of result.steps) {
    // Pending data are not placed until the final insertion; deletion removes
    // its key exactly at the 'eliminado' event.
    const actual=Object.values(step.state.buckets).flatMap(b=>b.keys);
    check(step.state,actual.includes(result.steps[0].key)?
      (result.steps[0].operation==='Insertar'?expectedAfter:expectedBefore):
      (result.steps[0].operation==='Insertar'?expectedBefore:expectedAfter));
    if(step.action==='doubling') {
      assert.equal(prior.buckets[step.active[0]].l,prior.g);
      assert.equal(step.state.g,prior.g+1);
      assert.deepEqual(step.state.directory,[...prior.directory,...prior.directory]);
    }
    if(step.action==='split') {
      const [a,b]=step.active;
      assert.equal(step.state.buckets[a].l,prior.buckets[a].l+1);
      assert.equal(step.state.buckets[b].l,step.state.buckets[a].l);
      assert.equal(step.state.g,prior.g);
      assert.deepEqual([...step.state.buckets[a].keys,...step.state.buckets[b].keys].sort((a,b)=>a-b),[...prior.buckets[a].keys].sort((a,b)=>a-b));
      assert.equal(step.withDoubling,result.steps[result.steps.indexOf(step)-1].action==='doubling');
    }
    if(step.action==='merge') {
      assert.equal(prior.buckets[step.removedId].keys.length,0);
      const survivor=step.active[0];
      assert.equal(prior.buckets[step.removedId].l,prior.buckets[survivor].l);
      assert.equal(step.state.buckets[survivor].l,prior.buckets[survivor].l-1);
    }
    if(step.action==='halving') {
      assert.ok(Object.values(prior.buckets).every(b=>b.l<prior.g));
      assert.equal(step.state.g,prior.g-1);
      assert.deepEqual(step.state.directory,prior.directory.slice(0,prior.directory.length/2));
    }
    prior=step.state;
  }
  check(result.state,expectedAfter);
}
test('Static: exact independent page certificates, ordering, capacity and totals',()=>{
  const expected={4:[[[8,12,16],[4,20,24],[28]],[[5,21,9],[13,17]],[[]],[[3,7]]],5:[[[5,20]],[[16,21]],[[12,7,17]],[[8,13,3],[28]],[[4,9,24]]]};
  for(const N of [4,5]) {
    let s=createStatic(N),overflows=0;
    for(const k of staticKeys) {
      const r=staticInsert(s,k);overflows+=r.steps.filter(x=>x.action==='overflow').length;s=r.state;
      assert.ok(validateStatic(s));assert.equal(hash(k,N),k%N);
      assert.ok(s.buckets.flat().every(p=>p.length<=3));
    }
    assert.deepEqual(s.buckets,expected[N]);
    assert.equal(overflows,N===4?3:1);assert.equal(s.buckets.flat().length,N===4?7:6);
    assert.deepEqual(values(s).sort((a,b)=>a-b),[...staticKeys].sort((a,b)=>a-b));
  }
});
test('Static: successful/unsuccessful searches, precise read paths and means',()=>{
  for(const N of [4,5]) {
    const s=buildStatic(N),expected=N===4?[3,2,1,2]:[2,1,1,2];
    [28,17,10,33].forEach((k,i)=>{
      const r=staticSearch(s,k);assert.equal(r.found,i<2);assert.equal(r.reads,expected[i]);
      const reads=r.steps.filter(x=>x.action==='lectura');
      assert.deepEqual(reads.at(-1).visited,Array.from({length:expected[i]},(_,j)=>`${k%N}:${j}`));
    });
    const total=staticKeys.reduce((sum,k)=>sum+staticSearch(s,k).reads,0);
    assert.equal(total,N===4?21:15);
    assert.throws(()=>staticInsert(s,8),/duplicada/);assert.throws(()=>staticInsert(s,-1));
  }
  let s=createStatic();s=staticInsert(s,8).state;s=staticInsert(s,12).state;
  assert.equal(s.buckets.flat().length,4,'collision alone creates no overflow');
});
test('Extendable: g=0, empty lookup and controlled errors preserve frozen state',()=>{
  const s=createExtendable();check(s,[]);assert.equal(s.g,0);assert.equal(suffix(0,0),'ε');
  assert.equal(search(s,0).found,false);assert.deepEqual(remove(s,1).state,s);
  for(const k of [-1,1.2,NaN,Infinity,65536,'3']) for(const fn of [insert,remove,search]) assert.throws(()=>fn(s,k));
  assert.throws(()=>createExtendable(0));assert.throws(()=>createExtendable(17));assert.throws(()=>createExtendable(2,9));
  assert.ok(Object.isFrozen(s.buckets.H0.keys));
  assert.throws(()=>s.directory.push('H1'),TypeError);
});
test('Case A: every stable certificate, exact five splits and three doublings',()=>{
  const expected=[
    [[0,0,[12]]],[[0,0,[12,5]]],[[0,1,[12]],[1,1,[5,3]]],
    [[0,1,[12,18]],[1,1,[5,3]]],[[0,2,[12]],[1,1,[5,3]],[2,2,[18,6]]],
    [[0,2,[12]],[1,2,[5,29]],[2,2,[18,6]],[3,2,[3]]],
    [[0,2,[12]],[1,2,[5,29]],[2,3,[18,10]],[3,2,[3]],[6,3,[6]]],
    [[0,2,[12,16]],[1,2,[5,29]],[2,3,[18,10]],[3,2,[3]],[6,3,[6]]],
    [[0,3,[16]],[1,2,[5,29]],[2,3,[18,10]],[3,2,[3]],[4,3,[12,20]],[6,3,[6]]],
    [[0,3,[16]],[1,2,[5,29]],[2,3,[18,10]],[3,2,[3,27]],[4,3,[12,20]],[6,3,[6]]],
  ];
  let s=createExtendable(),splits=0,doublings=0;const set=new Set();
  insertKeys.forEach((k,i)=>{
    const r=insert(s,k);transitions(r,set,new Set([...set,k]));set.add(k);s=r.state;
    assert.deepEqual(certificate(s),expected[i]);assert.equal(s.g,[0,0,1,1,2,2,3,3,3,3][i]);
    splits+=r.splits;doublings+=r.doublings;
    assert.ok(Object.isFrozen(r.steps.at(-1).state.directory));
  });
  assert.equal(splits,5);assert.equal(doublings,3);assert.equal(Object.keys(s.buckets).length,6);
  assert.deepEqual(s.directory.map(id=>s.buckets[id].s),[0,1,2,3,4,1,6,3]);
  assert.equal(search(s,29).found,true);assert.equal(search(s,13).found,false);
});
test('Case B: all deletion certificates, nonmergeable empty bucket and one merge policy',()=>{
  const expected=[
    [[0,3,[16]],[1,2,[5,29]],[2,3,[18,10]],[3,2,[3,27]],[4,3,[20]],[6,3,[6]]],
    [[0,2,[20]],[1,2,[5,29]],[2,3,[18,10]],[3,2,[3,27]],[6,3,[6]]],
    [[0,2,[]],[1,2,[5,29]],[2,3,[18,10]],[3,2,[3,27]],[6,3,[6]]],
    [[0,2,[]],[1,2,[5,29]],[2,3,[18]],[3,2,[3,27]],[6,3,[6]]],
    [[0,2,[]],[1,2,[5,29]],[2,2,[6]],[3,2,[3,27]]],
    [[0,2,[]],[1,2,[29]],[2,2,[6]],[3,2,[3,27]]],
    [[0,2,[]],[1,2,[29]],[2,2,[6]],[3,2,[27]]],
  ];
  let s=buildExtendable(insertKeys);const set=new Set(insertKeys);
  deleteKeys.forEach((k,i)=>{
    const after=new Set(set);after.delete(k);const r=remove(s,k);transitions(r,set,after);set.delete(k);s=r.state;
    assert.deepEqual(certificate(s),expected[i]);assert.equal(s.g,i<4?3:2);
    assert.equal(r.merges,[0,1,0,0,1,0,0][i]);assert.equal(r.halvings,i===4?1:0);
    if(k===20){assert.equal(r.steps.find(x=>x.action==='hermano').state.buckets[r.steps.find(x=>x.action==='hermano').buddyId].l,3);assert.equal(r.merges,0);}
  });
});
test('Case C: repeated growth/contraction, no aggressive merge of nonempty buckets',()=>{
  let s=buildExtendable([0,2]);const initial=s;
  for(let i=0;i<5;i++) {
    const a=insert(s,1);assert.equal(a.doublings,1);assert.equal(a.splits,1);
    const b=remove(a.state,1);assert.equal(b.merges,1);assert.equal(b.halvings,1);check(b.state,[0,2]);s=b.state;
    assert.equal(s.g,initial.g);
  }
  s=buildExtendable([4,8,1]);const r=remove(s,8);
  assert.equal(r.merges,0);assert.equal(r.state.g,1);check(r.state,[4,1]);
});
test('Case D: repeated splits, depth limit rollback, duplicates and absent deletes',()=>{
  let s=buildExtendable([0,8]);const before=JSON.stringify(s),r=insert(s,16);
  assert.equal(r.splits,4);assert.equal(r.doublings,4);assert.equal(r.state.g,4);check(r.state,[0,8,16]);assert.equal(JSON.stringify(s),before);
  s=buildExtendable([0,16],2,4);const exact=JSON.stringify(s);
  assert.throws(()=>insert(s,32),/profundidad máxima/);assert.equal(JSON.stringify(s),exact);
  assert.throws(()=>insert(s,0),/duplicada/);assert.deepEqual(remove(s,5).state,s);
  s=buildExtendable([0,16,32]);assert.equal(s.g,5);check(s,[0,16,32]);
  assert.throws(()=>insert(buildExtendable([0],1,0),1),/profundidad máxima/);
});
test('Valid redundant directories can halve repeatedly; validity is not insert-only reachability',()=>{
  const redundant={kind:'extendable',B:2,maxDepth:8,g:3,nextId:2,directory:['H0','H1','H0','H1','H0','H1','H0','H1'],buckets:{H0:{id:'H0',s:0,l:1,keys:[0,2]},H1:{id:'H1',s:1,l:1,keys:[1]}}};
  check(redundant,[0,1,2]);assert.ok(validateExtendable(redundant));
  assert.notEqual(redundant.g,Math.max(...Object.values(redundant.buckets).map(x=>x.l)));
  const r=remove(redundant,1);transitions(r,[0,1,2],[0,2]);assert.equal(r.merges,1);assert.equal(r.halvings,3);assert.equal(r.state.g,0);
});
test('Insert-only P1/P2 and seeded mixed operations agree with independent sets',()=>{
  let seed=0x1234abcd;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(const B of [1,2,3,5]) {
    let s=createExtendable(B);const set=new Set();
    for(let i=0;i<45;i++) {
      const k=random()%256;
      if(set.has(k)) continue;
      const r=insert(s,k);transitions(r,set,new Set([...set,k]));s=r.state;set.add(k);
      assert.equal(s.g,Math.max(...Object.values(s.buckets).map(b=>b.l)));
      for(const a of Object.values(s.buckets)) if(a.l>0) {
        const buddy=Object.values(s.buckets).find(b=>b.l===a.l && (a.s^2**(a.l-1))===b.s);
        if(buddy)assert.ok(a.keys.length+buddy.keys.length>=B+1);
      }
    }
    for(let i=0;i<250;i++) {
      const k=random()%128,op=random()%3;
      if(op===0 && !set.has(k) && set.size<60) {
        const r=insert(s,k);transitions(r,set,new Set([...set,k]));s=r.state;set.add(k);
      } else if(op===1) {
        const after=new Set(set);after.delete(k);const r=remove(s,k);
        if(set.has(k))transitions(r,set,after);
        assert.ok(r.merges<=1);s=r.state;set.delete(k);
      } else assert.equal(search(s,k).found,set.has(k));
      check(s,set);assert.ok(validateExtendable(s));
    }
  }
});
test('Validators reject broken aliases, pointers, occupancy and duplicates; key limit is atomic',()=>{
  const original=buildExtendable([0,1,2]);
  for(const mutate of [s=>s.directory.pop(),s=>s.directory[0]='missing',s=>s.buckets[s.directory[0]].keys.push(0),s=>s.buckets[s.directory[0]].l=8]) {
    const s=structuredClone(original);mutate(s);assert.throws(()=>validateExtendable(s));
  }
  const full=buildExtendable(Array.from({length:60},(_,i)=>i));const before=JSON.stringify(full);
  assert.throws(()=>insert(full,61),/60 claves/);assert.equal(JSON.stringify(full),before);
});
