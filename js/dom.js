export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'type', 'placeholder', 'title', 'href', 'src', 'alt', 'tabIndex']);

/** Tiny element builder: h('li', { class: 'x', onclick }, child, 'text') */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
}

let toastTimer;
export function toast(message, ms = 3600) {
  const el = $('#toast');
  // An open <dialog> sits in the top layer, so the toast has to live inside it to be seen
  (document.querySelector('dialog[open]') || document.body).append(el);
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

export function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export const safeName = (s) =>
  s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Приглашение';

export const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось сохранить картинку'))), type, quality));

let jszip;
export function loadJSZip() {
  return (jszip ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = () => {
      jszip = null;
      reject(new Error('Не удалось загрузить архиватор — проверьте интернет'));
    };
    document.head.append(s);
  }));
}

export const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
