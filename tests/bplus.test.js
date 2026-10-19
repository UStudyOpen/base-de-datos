import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree, buildTree, insert, remove, search, range, height, values, validateTree} from '../assets/js/visualizaciones/bplus-model.js';
import {presets, exampleTrace, parseKey} from '../assets/js/visualizaciones/bplus.js';

const A = [12,7,30,18,3,25,9,21,15,40,1,27,33,10,5,22,36,14,28,19];
const sorted = keys => [...keys].sort((a,b)=>a-b);
const shape = tree => {
  let ids = [tree.root]; const levels = [];
  while (ids.length) {
    levels.push(ids.map(id => tree.nodes[id].keys));
    ids = ids.flatMap(id => tree.nodes[id].children ?? []);
  }
  return levels;
};

// Independent oracle: enumerate every leaf entry with all ancestor constraints,
// compare against a Set and traverse BOTH linked lists separately from the tree.
// Does not call the model's traversal, search, height or validator.
function audit(tree, expected, transient = null) {
  const pages = [], leaves = [], depths = [], entries = [], used = new Set();
  function walk(id, ancestors = [], depth = 0) {
    assert.ok(tree.nodes[id], `missing child ${id}`);
    assert.ok(!used.has(id), `cycle/shared child ${id}`); used.add(id);
    const p = tree.nodes[id]; pages.push(p);
    const k = p.keys.length, root = id === tree.root;
    const minimum = root ? (p.leaf ? 0 : 1) : tree.d;
    if (transient?.nodeId === id) {
      assert.equal(k, transient.kind === 'overflow' ? 2*tree.d+1 : minimum-1);
    } else assert.ok(k >= minimum && k <= 2*tree.d, `occupancy ${id}`);
    assert.deepEqual(p.keys, sorted(new Set(p.keys)), `strict order ${id}`);
    assert.ok(p.keys.every(Number.isSafeInteger));
    // Also verify separators, even in an empty-subtree transient state.
    for (const key of p.keys) for (const [lo,hi] of ancestors) assert.ok(lo <= key && key < hi, `interval ${key} at ${id}`);
    if (p.leaf) { leaves.push(p); depths.push(depth); entries.push(...p.keys); }
    else {
      assert.equal(p.children.length, k+1, `arity ${id}`);
      for (let i=0;i<p.children.length;i++) walk(p.children[i], [...ancestors,[i ? p.keys[i-1] : -Infinity, i<k ? p.keys[i] : Infinity]], depth+1);
    }
  }
  walk(tree.root);
  assert.equal(pages.length,Object.keys(tree.nodes).length,'all pages reachable');
  assert.equal(new Set(depths).size,1,'all leaves at same depth');
  assert.deepEqual(entries,sorted(expected),'conservation and global uniqueness');
  let id = leaves[0].id, forward = [], backward = [];
  while (id !== null) { assert.ok(forward.length < leaves.length,'forward cycle'); forward.push(id); id=tree.nodes[id].next; }
  id = leaves.at(-1).id;
  while (id !== null) { assert.ok(backward.length < leaves.length,'backward cycle'); backward.push(id); id=tree.nodes[id].prev; }
  assert.deepEqual(forward,leaves.map(p=>p.id));
  assert.deepEqual(backward,leaves.map(p=>p.id).reverse());
  if (transient) assert.ok(used.has(transient.nodeId));
  if (!entries.length && !transient) { assert.equal(pages.length,1); assert.ok(pages[0].leaf); }
  return depths[0];
}
function auditTrace(result, before, after) {
  let changed = false;
  for (const [i,step] of result.steps.entries()) {
    if (['insertar','eliminar'].includes(step.action)) changed=true;
    audit(step.tree,changed ? after : before,step.transient);
    validateTree(step.tree,{transient:step.transient});
    assert.ok(Object.isFrozen(step.tree));
    assert.ok(Object.isFrozen(step.tree.nodes[step.tree.root].keys));
    if (step.transient) assert.match(step.explanation,/transitorio|transitoria|hermano|préstamo/);
    if (step.action==='hermano') {
      const tree=step.tree, target=step.nodeIds[0];
      const parent=Object.values(tree.nodes).find(p=>!p.leaf && p.children.includes(target));
      const index=parent.children.indexOf(target), offset=step.side==='left' ? -1 : 1;
      assert.equal(step.siblingId,parent.children[index+offset] ?? null,'only adjacent siblings with same parent');
      const previous=result.steps[i-1];
      const second=previous.action==='hermano' && previous.nodeIds[0]===target;
      const firstSide=step.operation==='Insertar' ? 'right' : 'left';
      assert.equal(step.side,second ? (firstSide==='left' ? 'right' : 'left') : firstSide,'deterministic sibling priority');
      if (second && previous.siblingId) {
        const count=previous.tree.nodes[previous.siblingId].keys.length;
        assert.ok(step.operation==='Insertar' ? count===2*tree.d : count===tree.d,'second candidate only when first cannot help');
      }
    }
  }
  assert.equal(result.steps.at(-1).transient,null);
  audit(result.tree,after);
}

test('A: actual insertions reproduce the known structure and split counts', () => {
  let tree=createTree(2), keys=new Set(), leafSplits=0, internalSplits=0;
  for (const key of A) {
    const before=new Set(keys); keys.add(key);
    const previous=JSON.stringify(tree), r=insert(tree,key);
    auditTrace(r,before,keys); assert.equal(JSON.stringify(tree),previous,'input not mutated');
    leafSplits+=r.steps.filter(s=>s.action==='split-hoja').length;
    internalSplits+=r.steps.filter(s=>s.action==='split-directorio').length;
    tree=r.tree;
  }
  assert.deepEqual(shape(tree),[[[21]],[[7,12,15],[27,33]],[[1,3,5],[7,9,10],[12,14],[15,18,19],[21,22,25],[27,28,30],[33,36,40]]]);
  assert.equal(leafSplits,6); assert.equal(internalSplits,1); assert.equal(height(tree),2);
});

test('B: hand-derived deletion certificates check every leaf, separator, sibling and height', () => {
  // Independently worked on paper from the interval/occupancy definitions.
  // No official answer is assumed and no expected tree is generated by remove().
  const certificates = [
    [14,[[[21]],[[7,10,15],[27,33]],[[1,3,5],[7,9],[10,12],[15,18,19],[21,22,25],[27,28,30],[33,36,40]]],['prestar-hoja'],['left']],
    [19,[[[21]],[[7,10,15],[27,33]],[[1,3,5],[7,9],[10,12],[15,18],[21,22,25],[27,28,30],[33,36,40]]],[],[]],
    [18,[[[21]],[[7,10],[27,33]],[[1,3,5],[7,9],[10,12,15],[21,22,25],[27,28,30],[33,36,40]]],['fusion-hojas'],['left','right']],
    [15,[[[21]],[[7,10],[27,33]],[[1,3,5],[7,9],[10,12],[21,22,25],[27,28,30],[33,36,40]]],[],[]],
    [1,[[[21]],[[7,10],[27,33]],[[3,5],[7,9],[10,12],[21,22,25],[27,28,30],[33,36,40]]],[],[]],
    [3,[[[10,21,27,33]],[[5,7,9],[10,12],[21,22,25],[27,28,30],[33,36,40]]],['fusion-hojas','fusion-directorios','contraer-raiz'],['left','right','left','right']],
  ];
  let tree=buildTree(A), keys=new Set(A);
  for (const [key,expected,actions,sides] of certificates) {
    const before=new Set(keys); keys.delete(key);
    const r=remove(tree,key); auditTrace(r,before,keys);
    assert.deepEqual(shape(r.tree),expected,`delete ${key}`);
    assert.deepEqual(r.steps.filter(s=>/prestar|fusion|contraer/.test(s.action)).map(s=>s.action),actions);
    assert.deepEqual(r.steps.filter(s=>s.action==='hermano').map(s=>s.side),sides);
    assert.equal(audit(r.tree,keys),key===3 ? 1 : 2);
    // Every considered sibling belongs to the parent selected in that step.
    for (const s of r.steps.filter(s=>s.siblingId)) {
      const siblings=Object.values(s.tree.nodes).find(p=>!p.leaf && p.children.includes(s.nodeIds[0]));
      assert.ok(siblings.children.includes(s.siblingId));
    }
    tree=r.tree;
  }
});

test('Search and range follow boundaries, count pages and include the stopping leaf', () => {
  const tree=buildTree(A), before=JSON.stringify(tree);
  const r=search(tree,22); assert.equal(r.found,true); assert.equal(r.pages,3);
  assert.deepEqual(r.steps.at(-1).path.map(id=>tree.nodes[id].keys),[[21],[27,33],[21,22,25]]);
  assert.equal(search(tree,23).found,false);
  assert.deepEqual(range(tree,10,25).values,[10,12,14,15,18,19,21,22,25]);
  assert.equal(range(tree,10,25).pages,7);
  for (const [a,b] of [[-100,0],[20,20],[40,100],[41,100],[-100,100]]) {
    const r=range(tree,a,b); assert.deepEqual(r.values,sorted(A).filter(x=>a<=x && x<=b));
    r.steps.forEach(s=>audit(s.tree,new Set(A)));
  }
  assert.equal(JSON.stringify(tree),before);
});

test('C: redistribution avoids leaf splits; both policies remain separate and deterministic', () => {
  const tree=buildTree([10,20,30,40,50,60]);
  const plain=insert(tree,45), redistributed=insert(tree,45,{redistribute:true});
  assert.deepEqual(shape(plain.tree),[[[30,45]],[[10,20],[30,40],[45,50,60]]]);
  assert.deepEqual(shape(redistributed.tree),[[[40]],[[10,20,30],[40,45,50,60]]]);
  assert.ok(!plain.steps.some(s=>s.action==='hermano'));
  assert.ok(!redistributed.steps.some(s=>s.action==='split-hoja'));
  assert.deepEqual(redistributed,insert(tree,45,{redistribute:true}));
  auditTrace(redistributed,new Set([10,20,30,40,50,60]),new Set([10,20,30,40,45,50,60]));
});

test('C: insertion redistributes internal directories through the parent', () => {
  let tree=createTree();
  for (let key=1;key<=32;key++) tree=insert(tree,key,{redistribute:true}).tree;
  const r=insert(tree,33,{redistribute:true});
  const step=r.steps.find(s=>s.action==='redistribuir-directorio');
  assert.ok(step); assert.equal(step.side,'left');
  assert.ok(!r.steps.some(s=>s.action==='split-directorio'));
  auditTrace(r,new Set(Array.from({length:32},(_,i)=>i+1)),new Set(Array.from({length:33},(_,i)=>i+1)));
});

test('D: root, empty tree, missing keys, duplicate rejection and safe integer limits', () => {
  for (const d of [1,2,3]) {
    const empty=createTree(d); audit(empty,new Set()); assert.equal(height(empty),0);
    assert.equal(search(empty,4).found,false); assert.deepEqual(range(empty,-1,9).values,[]);
    assert.equal(remove(empty,4).changed,false);
    let tree=insert(empty,Number.MIN_SAFE_INTEGER).tree;
    tree=insert(tree,Number.MAX_SAFE_INTEGER).tree;
    const before=JSON.stringify(tree);
    assert.throws(()=>insert(tree,Number.MAX_SAFE_INTEGER),/ya existe/);
    for (const invalid of [NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,'3',null]) {
      assert.throws(()=>insert(tree,invalid),/entero/); assert.throws(()=>remove(tree,invalid),/entero/); assert.throws(()=>search(tree,invalid),/entero/);
    }
    assert.equal(JSON.stringify(tree),before);
    tree=remove(tree,Number.MIN_SAFE_INTEGER).tree;
    const r=remove(tree,Number.MAX_SAFE_INTEGER); auditTrace(r,new Set([Number.MAX_SAFE_INTEGER]),new Set());
    assert.equal(height(r.tree),0);
  }
  for (const d of [0,-1,1.5,Infinity]) assert.throws(()=>createTree(d));
  assert.throws(()=>range(createTree(),4,3),/inferior/);
});

test('D: a deleted boundary is retained; equality still routes to its right', () => {
  let tree=buildTree([2,4,10,12,14]);
  const root=tree.root; assert.deepEqual(tree.nodes[root].keys,[10]);
  tree=remove(tree,10).tree;
  assert.deepEqual(tree.nodes[root].keys,[10]);
  const r=search(tree,10); assert.equal(r.found,false);
  assert.deepEqual(tree.nodes[r.pageId].keys,[12,14]);
  audit(tree,new Set([2,4,12,14]));
  tree=insert(tree,11).tree; assert.deepEqual(tree.nodes[root].keys,[10]);
  audit(tree,new Set([2,4,11,12,14]));
});

function random(seed) { return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed;}; }
function shuffle(list,rand) {
  const a=[...list]; for (let i=a.length-1;i;i--) {const j=rand()%(i+1); [a[i],a[j]]=[a[j],a[i]];} return a;
}
test('D: fixed-seed sequences cover both sides of every rotation and merge, and chained splits', () => {
  const events=new Set();
  for (const d of [1,2,3]) for (const redistribute of [false,true]) {
    const rand=random(381), order=shuffle(Array.from({length:100},(_,i)=>i+1),rand);
    let tree=createTree(d), keys=new Set();
    for (const key of order) {
      const before=new Set(keys); keys.add(key);
      const r=insert(tree,key,{redistribute}); auditTrace(r,before,keys);
      r.steps.forEach(s=>events.add(`${s.action}:${s.side ?? ''}`)); tree=r.tree;
    }
    for (const key of order) {
      const before=new Set(keys); keys.delete(key);
      const r=remove(tree,key); auditTrace(r,before,keys);
      r.steps.forEach(s=>events.add(`${s.action}:${s.side ?? ''}`));
      assert.ok(height(tree)-height(r.tree) >= 0 && height(tree)-height(r.tree)<=1);
      tree=r.tree;
    }
    audit(tree,new Set());
  }
  for (const action of ['redistribuir-hoja','redistribuir-directorio','prestar-hoja','prestar-directorio','fusion-hojas','fusion-directorios']) {
    for (const side of ['left','right']) assert.ok(events.has(`${action}:${side}`),`${action} ${side} covered`);
  }
  for (const action of ['split-hoja','split-directorio','contraer-raiz']) assert.ok(events.has(`${action}:`));
});

test('Mixed fixed-seed updates agree with an independent ordered Set and full leaf scan', () => {
  for (const d of [1,2,3]) for (const redistribute of [false,true]) {
    const rand=random(9081); let tree=createTree(d), keys=new Set();
    for (let i=0;i<250;i++) {
      const key=rand()%81-40, before=new Set(keys);
      if (rand()%3 && !keys.has(key)) { keys.add(key); const r=insert(tree,key,{redistribute}); auditTrace(r,before,keys); tree=r.tree; }
      else {keys.delete(key); const r=remove(tree,key); auditTrace(r,before,keys); tree=r.tree;}
      assert.equal(search(tree,key).found,keys.has(key));
      assert.deepEqual(range(tree,-15,16).values,sorted(keys).filter(x=>x>=-15 && x<=16));
      assert.deepEqual(values(tree),sorted(keys));
    }
  }
});

test('The independent checker detects actual structural corruption', () => {
  const tree=buildTree(A), keys=new Set(A);
  const corrupt = change => {
    const t=structuredClone(tree); change(t);
    assert.throws(()=>audit(t,keys)); assert.throws(()=>validateTree(t));
  };
  corrupt(t=>{t.nodes[t.root].keys[0]=100;});
  corrupt(t=>{t.nodes[t.root].children.pop();});
  corrupt(t=>{Object.values(t.nodes).find(p=>p.leaf).next=null;});
  corrupt(t=>{Object.values(t.nodes).find(p=>p.leaf).keys.reverse();});
  corrupt(t=>{Object.values(t.nodes).find(p=>p.leaf).keys.splice(1);});
  corrupt(t=>{t.nodes[t.root].children[1]=t.nodes[t.root].children[0];});
});

test('Every visualization preset is deterministic and valid under both insertion policies', () => {
  for (const preset of presets) for (const policy of [false,true]) {
    const steps=exampleTrace(preset,policy);
    assert.deepEqual(steps,exampleTrace(preset,policy));
    let expected=new Set(values(preset.start()));
    for (const step of steps) {
      if (step.action==='insertar') expected.add(step.key);
      if (step.action==='eliminar') expected.delete(step.key);
      audit(step.tree,expected,step.transient);
    }
    assert.equal(steps.at(-1).transient,null);
  }
  for (const [raw,key] of [['-12',-12],[' +2 ',2],['0',0]]) assert.equal(parseKey(raw),key);
  for (const raw of ['', '2.3','1e3','NaN','9007199254740992','12abc']) assert.throws(()=>parseKey(raw));
});
