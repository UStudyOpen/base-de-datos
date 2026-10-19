// DOM helpers and snapshot navigation. No state shared between component roots.
export const setText = xs => xs.length ? xs.join('') : '∅';
export const ruleText = f => `${setText(f.left)} → ${setText(f.right)}`;
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function field(label, value, multiline = false) {
  const wrapper = el('label', undefined, 'db-viz-field');
  const input = el(multiline ? 'textarea' : 'input');
  input.value = value;
  input.spellcheck = false;
  wrapper.append(el('span', label), input);
  return {wrapper, input};
}
export function selectField(label, options) {
  const wrapper = el('label', undefined, 'db-viz-field');
  const input = el('select');
  for (const [value, text] of options) { const option = el('option', text); option.value = value; input.append(option); }
  wrapper.append(el('span', label), input);
  return {wrapper, input};
}
export function table(caption, headings, rows) {
  const region = el('div', undefined, 'db-viz-scroll');
  region.tabIndex = 0; region.setAttribute('role', 'region'); region.setAttribute('aria-label', caption);
  const t = el('table'); t.append(el('caption', caption));
  const head = el('thead'); const tr = el('tr');
  headings.forEach(h => { const th = el('th', h); th.scope = 'col'; tr.append(th); }); head.append(tr); t.append(head);
  const body = el('tbody'); rows.forEach(row => { const r = el('tr'); row.forEach(x => r.append(el('td', String(x)))); body.append(r); }); t.append(body); region.append(t); return region;
}
export function player(steps, render) {
  if (!steps.length) throw new Error('La traza está vacía.');
  let position = 0;
  const box = el('div', undefined, 'db-viz-player');
  const controls = el('div', undefined, 'db-viz-controls');
  const content = el('div');
  const live = el('p', '', 'db-viz-status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  const buttons = ['Reiniciar', 'Anterior', 'Siguiente'].map(name => { const b = el('button', name); b.type = 'button'; controls.append(b); return b; });
  function draw() {
    content.replaceChildren(render(steps[position]));
    live.textContent = `Paso ${position} de ${steps.length - 1}. ${steps[position].explanation}`;
    buttons[0].disabled = buttons[1].disabled = position === 0;
    buttons[2].disabled = position === steps.length - 1;
  }
  buttons[0].onclick = () => { position = 0; draw(); };
  buttons[1].onclick = () => { if (position > 0) position--; draw(); };
  buttons[2].onclick = () => { if (position < steps.length - 1) position++; draw(); };
  box.append(controls, live, content); draw(); return box;
}
export function attach(root, build) {
  if (root.dataset.dbReady) return;
  // Build and validate detached DOM before exposing any controls. Fallback remains.
  const panel = build(); panel.classList.add('db-viz-interactive');
  root.prepend(panel); root.dataset.dbReady = 'true';
}
