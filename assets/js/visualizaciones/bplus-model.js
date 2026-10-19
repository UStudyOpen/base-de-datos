// Pure B+tree model. No browser APIs. Separators are interval boundaries,
// deliberately NOT recomputed as exact subtree minima after deletion.
const copy = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function integer(key) {
  if (!Number.isSafeInteger(key)) throw new Error('La clave debe ser un entero seguro de JavaScript.');
}
function node(tree, leaf, keys = [], children = []) {
  const id = `P${tree.nextId++}`;
  const page = leaf ? {id, leaf, keys, prev: null, next: null} : {id, leaf, keys, children};
  tree.nodes[id] = page;
  return page;
}
export function createTree(d = 2) {
  if (!Number.isSafeInteger(d) || d < 1 || !Number.isSafeInteger(2*d+1)) throw new Error('El orden debe ser un entero positivo seguro.');
  const tree = {d, root: null, nextId: 1, nodes: {}};
  tree.root = node(tree, true).id;
  return freeze(tree);
}
export function height(tree) {
  let page = tree.nodes[tree.root], h = 0;
  while (!page.leaf) { h++; page = tree.nodes[page.children[0]]; }
  return h;
}
export function values(tree) {
  const visit = id => { const p = tree.nodes[id]; return p.leaf ? [...p.keys] : p.children.flatMap(visit); };
  return visit(tree.root);
}

// Checks even transient snapshots; only the declared page may violate occupancy.
// Interval, arity, reachability, balance and leaf-link checks are never relaxed.
export function validateTree(tree, {transient = null} = {}) {
  const fail = message => { throw new Error(`Invariante B+: ${message}`); };
  if (!Number.isSafeInteger(tree.d) || tree.d < 1) fail('orden');
  const seen = new Set(), leaves = [], depths = new Set(), all = [];
  let exceptionUsed = false;
  function visit(id, low, high, depth) {
    const p = tree.nodes[id];
    if (!p || seen.has(id) || p.id !== id) fail('puntero o ciclo');
    seen.add(id);
    if (p.keys.some((x,i) => !Number.isSafeInteger(x) || x < low || x >= high || (i && x <= p.keys[i-1]))) fail(`orden/intervalo en ${id}`);
    const root = id === tree.root, k = p.keys.length;
    const min = root ? (p.leaf ? 0 : 1) : tree.d, max = 2*tree.d;
    if (k < min || k > max) {
      const kind = k > max ? 'overflow' : root ? 'root-single-child' : 'underflow';
      const count = kind === 'overflow' ? max+1 : min-1;
      if (!transient || transient.nodeId !== id || transient.kind !== kind || k !== count) fail(`ocupación en ${id}`);
      exceptionUsed = true;
    }
    if (p.leaf) { leaves.push(p); depths.add(depth); all.push(...p.keys); }
    else {
      if (p.children.length !== k+1) fail(`aridad en ${id}`);
      p.children.forEach((child,i) => visit(child, i ? p.keys[i-1] : low, i < k ? p.keys[i] : high, depth+1));
    }
  }
  visit(tree.root, -Infinity, Infinity, 0);
  if (seen.size !== Object.keys(tree.nodes).length) fail('páginas inalcanzables');
  if (depths.size !== 1) fail('profundidad desigual');
  if (all.some((x,i) => i && x <= all[i-1])) fail('claves repetidas o fuera de orden');
  leaves.forEach((p,i) => {
    if (p.prev !== (leaves[i-1]?.id ?? null) || p.next !== (leaves[i+1]?.id ?? null)) fail(`enlaces en ${p.id}`);
  });
  if (transient && !exceptionUsed) fail('excepción transitoria innecesaria');
  return true;
}
function violation(tree) {
  for (const p of Object.values(tree.nodes)) {
    if (p.keys.length > 2*tree.d) return {nodeId:p.id, kind:'overflow'};
    if (p.id === tree.root && !p.leaf && !p.keys.length) return {nodeId:p.id, kind:'root-single-child'};
    if (p.id !== tree.root && p.keys.length < tree.d) return {nodeId:p.id, kind:'underflow'};
  }
  return null;
}
function context(input, operation, key) {
  validateTree(input);
  const tree = copy(input), steps = [], path = [];
  function record(action, explanation, nodeIds = [], extra = {}) {
    const transient = violation(tree);
    validateTree(tree, {transient});
    steps.push(freeze({tree:copy(tree), operation, key, action, explanation,
      nodeIds:[...nodeIds], path:[...path], transient, ...extra}));
  }
  record('inicio', `${operation}: ${key}. Árbol inicial válido; orden d=${tree.d}, máximo ${2*tree.d} por página.`, [tree.root]);
  return {tree, steps, path, record};
}
function descend(ctx, key) {
  let p = ctx.tree.nodes[ctx.tree.root];
  const parents = [];
  while (!p.leaf) {
    ctx.path.push(p.id);
    let i = 0;
    while (i < p.keys.length && key >= p.keys[i]) i++;
    parents.push({parent:p, index:i});
    const low = i ? p.keys[i-1] : '−∞', high = i < p.keys.length ? p.keys[i] : '+∞';
    ctx.record('descenso', `${p.id}: ${key} pertenece a [${low}, ${high}). Tomar puntero ${i} hacia ${p.children[i]}; la igualdad avanza a la derecha.`, [p.id,p.children[i]]);
    p = ctx.tree.nodes[p.children[i]];
  }
  ctx.path.push(p.id);
  ctx.record('hoja', `${p.id} es hoja: comparar ${key} con [${p.keys.join(', ')}]. El recorrido termina aquí.`, [p.id]);
  return {page:p, parents};
}
function finish(ctx, extra = {}) {
  validateTree(ctx.tree);
  return freeze({tree:ctx.tree, steps:ctx.steps, ...extra});
}
export function search(input, key) {
  integer(key);
  const ctx = context(input, 'Buscar', key), {page} = descend(ctx, key);
  const found = page.keys.includes(key);
  ctx.record('fin', `${page.id}: ${found ? `se encontró ${key}` : `${key} no está almacenada`}. ${ctx.path.length} páginas de índice visitadas; árbol sin cambios.`, [page.id]);
  return finish(ctx, {found, pageId:page.id, pages:ctx.path.length});
}
export function range(input, low, high) {
  integer(low); integer(high);
  if (low > high) throw new Error('El límite inferior no puede superar al superior.');
  const ctx = context(input, 'Rango', `${low}…${high}`), {page} = descend(ctx, low), found = [];
  let p = page, leaves = 0;
  while (p) {
    leaves++;
    const matches = p.keys.filter(x => x >= low && x <= high);
    found.push(...matches);
    ctx.record('rango', `${p.id}: añadir [${matches.join(', ')}]. ${p.keys.some(x => x > high) ? `Aparece una clave mayor que ${high}: detener el scan.` : p.next ? `Seguir el enlace hacia ${p.next}.` : 'No hay más hojas.'}`, [p.id], {matches:[...found]});
    if (p.keys.some(x => x > high)) break;
    p = ctx.tree.nodes[p.next];
    if (p) ctx.path.push(p.id);
  }
  const pages = height(input)+leaves;
  ctx.record('fin', `Rango cerrado [${low}, ${high}]: [${found.join(', ')}]. ${pages} páginas de índice visitadas; árbol sin cambios.`, [], {matches:[...found]});
  return finish(ctx, {values:found, pages});
}

// Transfer one outer child through the parent's separator. Used in both policies.
function rotate(tree, parent, boundary, left, right, toRight) {
  if (left.leaf) {
    if (toRight) right.keys.unshift(left.keys.pop());
    else left.keys.push(right.keys.shift());
    parent.keys[boundary] = right.keys[0];
  } else if (toRight) {
    right.children.unshift(left.children.pop());
    right.keys.unshift(parent.keys[boundary]);
    parent.keys[boundary] = left.keys.pop();
  } else {
    left.children.push(right.children.shift());
    left.keys.push(parent.keys[boundary]);
    parent.keys[boundary] = right.keys.shift();
  }
}
export function insert(input, key, {redistribute = false} = {}) {
  integer(key);
  const ctx = context(input, 'Insertar', key), {tree, record} = ctx;
  const {page, parents} = descend(ctx, key);
  if (page.keys.includes(key)) throw new Error(`La clave ${key} ya existe. Se admiten solo claves distintas; el árbol no cambió.`);
  let i = 0;
  while (i < page.keys.length && page.keys[i] < key) i++;
  page.keys.splice(i,0,key);
  let p = page;
  record('insertar', `${p.id}: insertar ${key} ordenadamente. Ocupación ${p.keys.length}/${2*tree.d}. ${p.keys.length > 2*tree.d ? 'Overflow transitorio: hay que reparar esta página.' : 'La ocupación es válida.'}`, [p.id]);
  while (p.keys.length > 2*tree.d) {
    const edge = parents.pop(), parent = edge?.parent, index = edge?.index;
    if (redistribute && parent) {
      let moved = false;
      for (const side of ['right','left']) {
        const neighbor = tree.nodes[parent.children[index+(side === 'right' ? 1 : -1)]];
        record('hermano', `${p.id}: examinar hermano ${side === 'right' ? 'derecho' : 'izquierdo'} del mismo padre ${parent.id}. ${neighbor ? `${neighbor.id} tiene ${neighbor.keys.length}/${2*tree.d}: ${neighbor.keys.length < 2*tree.d ? 'puede recibir una unidad' : 'sin espacio'}.` : 'No existe.'}`, neighbor ? [p.id,neighbor.id,parent.id] : [p.id,parent.id], {side, siblingId:neighbor?.id ?? null});
        if (!neighbor || neighbor.keys.length >= 2*tree.d) continue;
        const toRight = side === 'right';
        rotate(tree, parent, toRight ? index : index-1, toRight ? p : neighbor, toRight ? neighbor : p, toRight);
        record(p.leaf ? 'redistribuir-hoja' : 'redistribuir-directorio', `${p.id} transfiere ${p.leaf ? 'una entrada' : 'un hijo, haciendo bajar y subir separadores por el padre'} hacia ${neighbor.id}. Se ajusta la frontera de ${parent.id}; ocupación restaurada sin split.`, [p.id,neighbor.id,parent.id], {side, siblingId:neighbor.id});
        moved = true; break;
      }
      if (moved) break;
    }
    const leaf = p.leaf;
    let separator, right;
    if (leaf) {
      right = node(tree,true,p.keys.splice(tree.d));
      separator = right.keys[0];
      right.next = p.next; right.prev = p.id;
      if (p.next) tree.nodes[p.next].prev = right.id;
      p.next = right.id;
    } else {
      separator = p.keys[tree.d];
      right = node(tree,false,p.keys.splice(tree.d+1),p.children.splice(tree.d+1));
      p.keys.pop();
    }
    if (parent) {
      parent.keys.splice(index,0,separator); parent.children.splice(index+1,0,right.id);
    } else {
      tree.root = node(tree,false,[separator],[p.id,right.id]).id;
    }
    record(leaf ? 'split-hoja' : 'split-directorio', `${p.id} se divide en ${p.id} y ${right.id}. ${leaf ? `${tree.d} entradas a la izquierda y ${tree.d+1} a la derecha; COPIAR ${separator} al padre, conservarlo como dato y reparar enlaces.` : `${tree.d} separadores por lado; PROMOCIONAR ${separator}, que sale de ambos directorios.`} ${parent ? `Insertar frontera y puntero en ${parent.id}.` : `Crear raíz ${tree.root}; la altura aumenta en uno.`} ${violation(tree) ? 'El padre tiene overflow transitorio: continuar arriba.' : 'Ocupaciones válidas.'}`, [p.id,right.id,parent?.id ?? tree.root], {separator, newRoot:!parent});
    if (!parent) break;
    p = parent;
  }
  record('fin', `Inserción de ${key} terminada. Orden, intervalos, ocupación y enlaces válidos. Altura ${height(tree)}.`, [], {path:[]});
  return finish(ctx, {changed:true});
}
export function remove(input, key) {
  integer(key);
  const ctx = context(input, 'Eliminar', key), {tree, record} = ctx;
  const {page, parents} = descend(ctx, key);
  const position = page.keys.indexOf(key);
  if (position < 0) {
    record('fin', `${page.id}: ${key} no existe; no se modifica ninguna página.`, [page.id]);
    return finish(ctx, {changed:false});
  }
  page.keys.splice(position,1);
  let p = page;
  record('eliminar', `${p.id}: retirar ${key}; quedan ${p.keys.length} entradas. ${p.id !== tree.root && p.keys.length < tree.d ? 'Underflow transitorio: se requiere rebalanceo.' : 'Ocupación válida: conservar los separadores de los ancestros.'}`, [p.id]);
  while (p.id !== tree.root && p.keys.length < tree.d) {
    const {parent,index} = parents.pop();
    const left = tree.nodes[parent.children[index-1]], right = tree.nodes[parent.children[index+1]];
    let borrowed = false;
    for (const [side,neighbor] of [['left',left],['right',right]]) {
      record('hermano', `${p.id}: intentar préstamo desde ${side === 'left' ? 'izquierda' : 'derecha'}, mismo padre ${parent.id}. ${neighbor ? `${neighbor.id} tiene ${neighbor.keys.length}; ${neighbor.keys.length > tree.d ? `supera el mínimo ${tree.d} y puede prestar` : `está al mínimo ${tree.d}, no puede prestar`}.` : 'No existe ese hermano.'}`, neighbor ? [p.id,neighbor.id,parent.id] : [p.id,parent.id], {side, siblingId:neighbor?.id ?? null});
      if (!neighbor || neighbor.keys.length <= tree.d) continue;
      const fromLeft = side === 'left';
      rotate(tree,parent,fromLeft ? index-1 : index,fromLeft ? neighbor : p,fromLeft ? p : neighbor,fromLeft);
      record(p.leaf ? 'prestar-hoja' : 'prestar-directorio', `${neighbor.id} presta ${p.leaf ? 'una entrada' : 'un hijo mediante rotación por el separador del padre'} a ${p.id}. Actualizar la frontera atravesada en ${parent.id}. Ambos cumplen el mínimo; no se propaga el déficit.`, [p.id,neighbor.id,parent.id], {side, siblingId:neighbor.id});
      borrowed = true; break;
    }
    if (borrowed) break;
    const a = left ?? p, b = left ? p : right, boundary = left ? index-1 : index;
    const separator = parent.keys[boundary], leaf = a.leaf;
    if (leaf) {
      a.keys.push(...b.keys); a.next = b.next;
      if (b.next) tree.nodes[b.next].prev = a.id;
    } else { a.keys.push(separator,...b.keys); a.children.push(...b.children); }
    delete tree.nodes[b.id];
    parent.keys.splice(boundary,1); parent.children.splice(boundary+1,1);
    record(leaf ? 'fusion-hojas' : 'fusion-directorios', `Ningún hermano puede prestar. Fusionar ${a.id} y ${b.id}, conservando ${a.id}. ${leaf ? `Reparar enlaces y descartar la frontera ${separator}; no es un dato nuevo.` : `Bajar la frontera ${separator} entre los separadores y concatenar hijos.`} Retirar puntero a ${b.id} de ${parent.id}. ${violation(tree) ? 'El padre queda con déficit transitorio; continuar hacia arriba.' : 'El padre conserva ocupación válida.'}`, [a.id,parent.id], {side:left ? 'left' : 'right', removedId:b.id, separator});
    p = parent;
  }
  const root = tree.nodes[tree.root];
  if (!root.leaf && root.keys.length === 0) {
    tree.root = root.children[0]; delete tree.nodes[root.id];
    record('contraer-raiz', `${root.id} tiene un único hijo: ${tree.root} pasa a ser raíz. La altura disminuye en uno para todas las hojas.`, [tree.root]);
  }
  record('fin', `Eliminación de ${key} terminada. ${values(tree).length ? `Altura ${height(tree)}.` : 'Árbol vacío: raíz hoja sin entradas y enlaces nulos.'} Todos los invariantes restablecidos.`, [], {path:[]});
  return finish(ctx, {changed:true});
}
export function buildTree(keys, d = 2, options = {}) {
  let tree = createTree(d);
  for (const key of keys) tree = insert(tree,key,options).tree;
  return tree;
}
