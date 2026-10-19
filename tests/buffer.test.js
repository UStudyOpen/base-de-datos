import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBuffer,stepBuffer,traceBuffer,restoreSnapshot,validateBuffer,priority,pin,unpin,usePages,mainOperations,beladyPages,treePages,presets} from '../assets/js/visualizaciones/buffer-model.js';
import {pageStates} from '../assets/js/visualizaciones/paginas.js';

// Independent oracle: ordered page names, a page dictionary and physical positions.
// It does not call model selection, snapshots or invariant helpers.
function reference(ops,n,policy) {
  const slots=Array(n).fill(null),pages=new Map();let fifo=[],recent=[],reads=0,writes=0,hits=0,tick=0;
  return ops.map(op=>{
    let result='unpin',victim=null,write=0,read=0;
    if(op.type==='unpin') {
      const item=pages.get(op.pageId);
      if(!item || item.pins===0)result='rechazo';
      else {item.pins--;if(op.dirty)item.dirty=true;}
    }else if(pages.has(op.pageId)) {
      const item=pages.get(op.pageId);item.pins++;item.used=++tick;hits++;
      recent=recent.filter(p=>p!==op.pageId);recent.push(op.pageId);result='hit';
    }else{
      let position=slots.indexOf(null);
      if(position<0) {
        victim=(policy==='FIFO'?fifo:recent).find(p=>pages.get(p).pins===0)??null;
        if(victim!==null) {
          position=slots.indexOf(victim);write=Number(pages.get(victim).dirty);writes+=write;
          pages.delete(victim);fifo=fifo.filter(p=>p!==victim);recent=recent.filter(p=>p!==victim);
        }
      }
      if(position<0)result='rechazo';
      else{
        slots[position]=op.pageId;pages.set(op.pageId,{pins:1,dirty:false,loaded:++tick,used:tick});
        fifo.push(op.pageId);recent.push(op.pageId);reads++;read=1;result='miss';
      }
    }
    return {frames:slots.map(p=>p===null?null:[p,pages.get(p).pins,pages.get(p).dirty]),times:slots.map(p=>p===null?null:[pages.get(p).loaded,pages.get(p).used]),reads,writes,hits,clock:tick,result,victim,read,write,order:[...(policy==='FIFO'?fifo:recent)]};
  });
}
const frameData=s=>s.frames.map(f=>f.pageId===null?null:[f.pageId,f.pinCount,f.dirty]);
function compare(ops,n=3,policy='FIFO') {
  const trace=traceBuffer(ops,n,policy),expected=reference(ops,n,policy);
  expected.forEach((e,i)=>{
    const {state,event}=trace[i+1];assert.deepEqual(frameData(state),e.frames,`${policy}/${n} step ${i+1}`);
    assert.deepEqual(state.frames.map(f=>f.pageId===null?null:[f.ordenDeCarga,f.ultimoAcceso]),e.times);
    for(const k of ['reads','writes','hits','clock'])assert.equal(state[k],e[k],`${k}: step ${i+1}`);
    assert.equal(event.result,e.result);assert.equal(event.victim?.pageId??null,e.victim);
    assert.equal(event.reads,e.read);assert.equal(event.writes,e.write);
    assert.deepEqual(priority(state).map(f=>f.pageId),e.order);assert.deepEqual(validateBuffer(state),[]);
    const before=trace[i].state;
    if(event.result==='rechazo')assert.strictEqual(state,before);
    if(event.victim)assert.equal(before.frames[event.victim.frame].pinCount,0);
    if(event.result==='miss' && before.frames.some(f=>f.pageId===null))assert.equal(event.victim,null);
  });return trace;
}

test('A: empty, loads, hits, nested pins, partial/full unpin and cumulative dirty',()=>{
  const initial=createBuffer();assert.equal(initial.frames.length,3);assert.deepEqual(initial.pageTable,{});assert.deepEqual(validateBuffer(initial),[]);
  const t=compare([pin('A'),pin('A'),unpin('A',true),unpin('A')]);
  assert.equal(t[2].state.frames[0].pinCount,2);assert.equal(t[2].state.reads,1);assert.equal(t[2].event.result,'hit');
  assert.equal(t[3].state.frames[0].pinCount,1);assert.equal(t[4].state.frames[0].pinCount,0);assert.equal(t[4].state.frames[0].dirty,true);assert.equal(t[4].state.writes,0);
});
test('A: clean/dirty eviction, frame free before victim, full pinned pool and illegal unpin',()=>{
  for(const policy of ['FIFO','LRU']) {
    const t=compare([unpin('Z'),pin('A'),pin('A'),unpin('A',true),pin('B'),unpin('A'),unpin('A'),pin('B')],1,policy);
    assert.equal(t[5].event.result,'rechazo');assert.equal(t[5].event.request,'miss');assert.equal(t[5].state.reads,1);
    assert.equal(t[8].state.writes,1);assert.equal(t[8].event.victim.pageId,'A');
    const clean=compare([pin('A'),unpin('A'),pin('B')],1,policy);assert.equal(clean.at(-1).state.writes,0);
    compare(presets.find(p=>p.id==='limites').operations,3,policy);
  }
});
test('A: validation, immutability and exact snapshot restoration',()=>{
  const state=createBuffer();
  for(const n of [0,-1,1.5,9,'3'])assert.throws(()=>createBuffer(n));
  for(const op of [pin(''),pin('<script>'),pin('x'.repeat(17)),{type:'unpin',pageId:'A',dirty:0},{type:'flush',pageId:'A'},null]) {
    const r=stepBuffer(state,op);assert.strictEqual(r.state,state);assert.equal(r.event.result,'rechazo');
  }
  for(const s of [{...state,pageTable:{A:0}},{...state,reads:1},{...state,frames:[{...state.frames[0],pinCount:-1}]}])assert.ok(validateBuffer(s).length);
  assert.ok(validateBuffer({...state,frames:[null]}).length);
  const invalidPage={name:'A'};stepBuffer(state,{type:'pin',pageId:invalidPage});assert.equal(Object.isFrozen(invalidPage),false);
  const t=compare(mainOperations);const json=JSON.stringify(t);assert.throws(()=>{t[1].state.frames[0].dirty=true;},TypeError);
  for(let i=0;i<t.length;i++) {
    assert.deepEqual(restoreSnapshot(t[i]),t[i]);
    if(i+1<t.length)assert.deepEqual(stepBuffer(restoreSnapshot(t[i]).state,t[i+1].operation).state,t[i+1].state);
  }
  assert.equal(JSON.stringify(t),json);
  compare(usePages(['__proto__','constructor','toString','__proto__']),2);
});
test('B: FIFO by load, LRU by last pin, unpin leaves recency and pinned pages are skipped',()=>{
  const ops=[...usePages(['A','B','C','A']),pin('D')];
  assert.equal(compare(ops,3,'FIFO').at(-1).event.victim.pageId,'A');
  assert.equal(compare(ops,3,'LRU').at(-1).event.victim.pageId,'B');
  for(const policy of ['FIFO','LRU']) {
    const t=compare([pin('A'),pin('B'),unpin('B'),pin('C')],2,policy);
    assert.equal(t.at(-1).event.victim.pageId,'B');assert.equal(t.at(-1).state.frames[0].pageId,'A');
    const u=compare([pin('A'),pin('B'),unpin('A'),unpin('B')],2,policy);
    assert.deepEqual(priority(u[2].state).map(f=>f.pageId),priority(u[4].state).map(f=>f.pageId));
  }
});
test('C: every one of the 18 operations, independent oracle and printed trace',()=>{
  const source=readFileSync(new URL('../almacenamiento/buffer-manager.qmd',import.meta.url),'utf8');
  for(const [policy,reads,expectedVictims] of [['FIFO',7,[[9,'A'],[10,'B'],[12,'C'],[15,'D']]],['LRU',6,[[9,'B'],[12,'C'],[15,'D']]]]) {
    const t=compare(mainOperations,3,policy),last=t.at(-1).state;
    assert.equal(last.reads,reads);assert.equal(last.writes,1);
    assert.deepEqual(last.frames.filter(f=>f.dirty).map(f=>f.pageId),['A']);
    assert.deepEqual(t.filter(s=>s.event.victim).map(s=>[s.step,s.event.victim.pageId]),expectedVictims);
    assert.equal(t[12].state.frames.find(f=>f.pageId==='D').pinCount,1);
    const section=source.split(`### ${policy}\n`)[1].split('\n### ')[0];
    const rows=section.split('\n').filter(l=>/^\| \d+ \|/.test(l));assert.equal(rows.length,18);
    rows.forEach((row,i)=>{
      const cells=row.split('|').slice(1,-1).map(c=>c.trim()),s=t[i+1];
      assert.deepEqual(cells.slice(2,5),s.state.frames.map(f=>f.pageId===null?'—':`${f.pageId}/${f.pinCount}/${Number(f.dirty)}`));
      assert.deepEqual(cells.slice(-2).map(Number),[s.state.reads,s.state.writes]);
    });
  }
});
test('C: interleaved pin C evicts dirty A; pin E is rejected atomically',()=>{
  for(const policy of ['FIFO','LRU']) {
    const t=compare(presets.find(p=>p.id==='intercaladas').operations,3,policy);
    assert.equal(t[13].event.victim.pageId,'A');assert.equal(t[13].event.writes,1);
    assert.equal(t[14].event.result,'rechazo');assert.strictEqual(t[14].state,t[13].state);
    assert.equal(t[14].state.reads,policy==='FIFO'?7:6);assert.equal(t[14].state.writes,2);
    assert.ok(t[14].state.frames.every(f=>f.pinCount===1));
  }
});
test('D: Belady totals and stack inclusion at every reference',()=>{
  const traces={};
  for(const [policy,n,reads] of [['FIFO',3,9],['FIFO',4,10],['LRU',3,10],['LRU',4,8]]) {
    const t=compare(usePages(beladyPages),n,policy);assert.equal(t.at(-1).state.reads,reads);assert.equal(t.at(-1).state.writes,0);traces[policy+n]=t;
  }
  const pages=(key,i)=>new Set(traces[key][i].state.frames.filter(f=>f.pageId!==null).map(f=>f.pageId));
  for(let i=0;i<=24;i++)for(const p of pages('LRU3',i))assert.ok(pages('LRU4',i).has(p));
  assert.deepEqual([...pages('FIFO3',14)].sort(),['1','2','5']);assert.deepEqual([...pages('FIFO4',14)].sort(),['2','3','4','5']);
});
test('E: fixed records, disk arithmetic, rounding and page directory',()=>{
  const capacity=Math.floor((4096-96)/100);assert.equal(capacity,40);assert.equal(Math.ceil(1e6/capacity),25000);assert.equal(Math.ceil(1000001/capacity),25001);
  const random=n=>n*(6.46+4.17+.13),contiguous=n=>6.46+4.17+n*.13;
  assert.ok(Math.abs(random(1000)-10760)<1e-8);assert.ok(Math.abs(contiguous(1000)-140.63)<1e-8);
  assert.ok(Math.abs(random(1000)/contiguous(1000)-76.5128351)<1e-6);
  assert.ok(Math.abs(contiguous(25000)-3260.63)<1e-8);assert.ok(Math.abs(random(25000)-269000)<1e-8);
  assert.equal(Math.floor(4096/8),512);assert.equal(Math.ceil(1000/512),2);
});
test('E: slotted page byte coverage, fragmentation, compaction, slot reuse and stable RID',()=>{
  assert.deepEqual(pageStates.map(s=>s.freeTotal),[116,82,58,14,34,34,4,4]);
  assert.deepEqual(pageStates.map(s=>s.largestFree),[116,82,58,14,20,34,4,4]);
  for(const s of pageStates) {
    // Byte occupancy oracle: detect overlaps independently of the free-space formula.
    const occupied=new Set(Array.from({length:12+4*s.slotCount},(_,i)=>i));
    for(const r of s.records)for(let b=r.offset;b<r.offset+r.length;b++){assert.ok(b>=0 && b<128);assert.ok(!occupied.has(b));occupied.add(b);}
    const empty=Array.from({length:128},(_,i)=>i).filter(i=>!occupied.has(i));assert.equal(empty.length,s.freeTotal);
    let largest=0,streak=0;for(let i=0;i<128;i++){streak=occupied.has(i)?0:streak+1;largest=Math.max(largest,streak);}assert.equal(largest,s.largestFree);
    assert.equal(new Set(s.records.map(r=>r.slot)).size,s.records.length);
  }
  const before=pageStates[4].records.find(r=>r.name==='t3'),after=pageStates[5].records.find(r=>r.name==='t3');
  assert.equal(before.slot,after.slot);assert.equal(before.offset,38);assert.equal(after.offset,58);
  assert.equal(pageStates[6].records.find(r=>r.name==='t4').slot,2);assert.equal(pageStates[6].slotCount,3);
  assert.deepEqual(pageStates[6].records,pageStates[7].records);assert.ok(pageStates[7].freeTotal<10+4);
});
test('F: reproducible sequences agree with independent queues at every step',()=>{
  for(const policy of ['FIFO','LRU'])for(const n of [1,2,3,4,7,8]) {
    let seed=173+n;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    const ops=Array.from({length:600},()=>{const p=String(rnd()%11);return rnd()%3===0?unpin(p,Boolean(rnd()%2)):pin(p);});
    compare(ops,n,policy);compare(usePages(Array.from({length:180},(_,i)=>String(i%(n+1)))),n,policy);
  }
});
test('F: B+ bounds, attaining constructions and capacity threshold',()=>{
  const alternation=Array.from({length:40},(_,i)=>i%2?4:1),cycle=Array.from({length:40},(_,i)=>[1,4,2,5,3][i%5]);
  for(const [policy,leaves,n] of [['FIFO',alternation,3],['LRU',alternation,3],['LRU',cycle,7],['LRU',cycle,8]]) {
    const t=compare(usePages(treePages(leaves)),n,policy);
    for(let m=1;m<=leaves.length;m++) {
      const reads=t[m*6].state.reads;
      if(n===3)assert.equal(reads,policy==='FIFO'?Math.ceil(5*m/2):2*m+1);
      if(n===7 && m>=2)assert.equal(reads,m+3);
      if(n===8)assert.ok(reads<=8);
    }
  }
  let seed=9481;const leaves=Array.from({length:500},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%5+1;});
  const large=compare(usePages(treePages(leaves)),7,'LRU');
  for(const upper of ['R','D1','D2'])assert.equal(large.filter(s=>s.event.result==='miss' && s.operation.pageId===upper).length,1);
  // Exhaust all four-search sequences on this specific tree, not a proof for all m.
  for(let code=0;code<625;code++) {
    let x=code;const leaves=Array.from({length:4},()=>{const l=x%5+1;x=Math.floor(x/5);return l;});
    for(const policy of ['FIFO','LRU']) {
      const t=traceBuffer(usePages(treePages(leaves)),3,policy);let prev=0,previousCost=0;
      for(let m=1;m<=4;m++) {
        const reads=t[m*6].state.reads,cost=reads-prev;
        assert.ok(reads<=(policy==='FIFO'?Math.ceil(5*m/2):2*m+1));
        if(policy==='FIFO' && previousCost===3)assert.ok(cost<=2);
        if(policy==='LRU' && m>1)assert.equal(t[(m-1)*6+1].event.result,'hit');
        prev=reads;previousCost=cost;
      }
    }
  }
});
