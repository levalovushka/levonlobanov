// Small UI kit for the control panel: fill-bar sliders, collapsible sections,
// segmented switches, buttons and a colour row. Styles live in index.html.

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const decimals = (step) => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3);

/**
 * Fill-bar slider: the whole bar is the hit area, the fill shows the value, the label sits on
 * the left and the value on the right. Drag or click to set, arrows to nudge (Shift = x10),
 * double-click to reset to the default.
 */
export function slider({ label, min, max, step, value, def = value, unit = '', format, title, onInput, onChange }) {
  const root = el('div', 'sl');
  root.tabIndex = 0;
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-label', label);
  root.setAttribute('aria-valuemin', min);
  root.setAttribute('aria-valuemax', max);
  if (title) root.title = title;
  const fill = el('div', 'sl-fill');
  const lab = el('span', 'sl-label', label);
  const val = el('span', 'sl-val');
  root.append(fill, lab, val);

  const fmt = format || ((v) => v.toFixed(decimals(step)) + (unit ? ` ${unit}` : ''));
  const snap = (v) => {
    v = Math.min(max, Math.max(min, v));
    v = Math.round((v - min) / step) * step + min;
    return +v.toFixed(6);
  };
  let cur = snap(value);
  const draw = () => {
    fill.style.width = `${((cur - min) / (max - min)) * 100}%`;
    val.textContent = fmt(cur);
    root.setAttribute('aria-valuenow', cur);
  };
  const set = (v, fire) => {
    const n = snap(v);
    if (n === cur && fire !== 'force') return;
    cur = n; draw();
    if (fire) onInput?.(cur);
  };
  draw();

  const fromX = (x) => {
    const r = root.getBoundingClientRect();
    return min + ((x - r.left) / r.width) * (max - min);
  };
  let dragging = false;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    root.setPointerCapture(e.pointerId);
    root.classList.add('active');
    set(fromX(e.clientX), true);
  });
  root.addEventListener('pointermove', (e) => { if (dragging) set(fromX(e.clientX), true); });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('active');
    onChange?.(cur);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  // reset eases back (a rare, deliberate action); drag and keys stay instant
  let easeTimer = 0;
  root.addEventListener('dblclick', () => {
    root.classList.add('easing');
    clearTimeout(easeTimer);
    easeTimer = setTimeout(() => root.classList.remove('easing'), 260);
    set(def, 'force'); onInput?.(cur); onChange?.(cur);
  });
  root.addEventListener('keydown', (e) => {
    const k = e.shiftKey ? 10 : 1;
    let v = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = cur + step * k;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = cur - step * k;
    else if (e.key === 'Home') v = min;
    else if (e.key === 'End') v = max;
    if (v === null) return;
    e.preventDefault();
    set(v, true);
    onChange?.(cur);
  });
  return { el: root, set: (v) => set(v, false), get: () => cur };
}

/** Collapsible block. Open/closed state is remembered per id in localStorage. */
export function section(title, id, { open = true } = {}) {
  const key = `mosaic.section.${id}`;
  let stored = null;
  try { stored = localStorage.getItem(key); } catch {}
  const isOpen = stored === null ? open : stored === '1';
  const root = el('section', 'card sec' + (isOpen ? '' : ' closed'));
  const head = el('button', 'sec-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', isOpen);
  head.append(el('span', '', title));
  const chev = el('span', 'chev');
  chev.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  head.append(chev);
  const wrap = el('div', 'sec-wrap');
  const body = el('div', 'sec-body');
  wrap.append(body);
  root.append(head, wrap);
  head.addEventListener('click', () => {
    const closed = root.classList.toggle('closed');
    head.setAttribute('aria-expanded', !closed);
    try { localStorage.setItem(key, closed ? '0' : '1'); } catch {}
  });
  return { el: root, body };
}

/** Segmented switch: one active option out of a few. */
export function segmented(options, value, onChange, { title } = {}) {
  const root = el('div', 'seg');
  if (title) root.title = title;
  const btns = options.map(([v, text]) => {
    const b = el('button', '', text);
    b.type = 'button';
    b.addEventListener('click', () => { set(v); onChange(v); });
    root.append(b);
    return [v, b];
  });
  const set = (v) => { for (const [bv, b] of btns) b.classList.toggle('on', bv === v); };
  set(value);
  return { el: root, set };
}

export function button(text, onClick, { primary = false, title } = {}) {
  const b = el('button', 'btn' + (primary ? ' primary' : ''), text);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

/** A row styled like a slider bar, with a colour swatch on the right. */
export function colorRow(label, value, onInput) {
  const root = el('label', 'sl sl-color');
  const inp = el('input');
  inp.type = 'color';
  inp.value = value;
  inp.addEventListener('input', () => onInput(inp.value));
  root.append(el('span', 'sl-label', label), inp);
  return { el: root, set: (v) => { inp.value = v; } };
}

export function row(...children) {
  const r = el('div', 'row');
  r.append(...children);
  return r;
}

export function note(text = '') {
  return el('div', 'note', text);
}
