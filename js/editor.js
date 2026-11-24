import { blobSet, blobDel } from './store.js';
import { FONTS, STATUS, PLACEHOLDER, layoutFor, draw, maskCanvas, getImage, forgetImage, registerFont } from './render.js';
import { $, $$, h, uid, toast } from './dom.js';

export const PRESETS = {
  ru: { m: 'Дорогой {имя}', f: 'Дорогая {имя}', pl: 'Дорогие {имя}' },
  de: { m: 'Lieber {имя}', f: 'Liebe {имя}', pl: 'Liebe {имя}' },
  deSie: { m: 'Sehr geehrter {имя}', f: 'Sehr geehrte {имя}', pl: 'Sehr geehrte {имя}' },
};

const SAMPLES = [
  { name: 'Ева', gender: 'f' },
  { name: 'Мария', gender: 'f' },
  { name: 'Александр', gender: 'm' },
  { name: 'Анастасия и Константин Белоусовы', gender: 'pl' },
];

export function newTemplate(imageKey, title) {
  return {
    id: uid(),
    title,
    audience: '',
    imageKey,
    box: { x: 0.2, y: 0.3, w: 0.6, h: 0.06 },
    align: 'center',
    greet: { ...PRESETS.ru },
    font: { family: 'Cormorant Garamond', weight: 500, size: 0.045, color: '#6b6f5c', spacing: 0.12, upper: true, italic: false },
    erase: { on: false, color: null },
    fit: { minScale: 0.7, maxShift: 0.06, sens: 5 },
  };
}

const getPath = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
function setPath(o, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((v, k) => (v[k] ??= {}), o)[last] = value;
}

export function createEditor({ getFonts, addFont, onSave, onDelete }) {
  const dlg = $('#editor');
  const stage = $('#stage');
  const frame = $('#stageFrame');
  const canvas = $('#stageCanvas');
  const ctx = canvas.getContext('2d');
  const box = $('#nameBox');

  let draft, original, isNew, img, srcCtx;
  let newBlobs = [];
  let dirty = false;
  let picking = false;
  let sample = { ...SAMPLES[1] };
  let cssW = 0, cssH = 0;

  const fmt = {
    'font.size': (v) => `${Math.round(v * (img?.width || 1000))} px`,
    'font.spacing': (v) => `${(+v).toFixed(2)} em`,
    'fit.minScale': (v) => `до ${Math.round(v * 100)}%`,
    'fit.maxShift': (v) => (+v ? `±${Math.round(v * 100)}%` : 'нельзя'),
    'fit.sens': (v) => ['', 'слабая', 'слабая', 'ниже средней', 'средняя', 'средняя', 'средняя', 'выше средней', 'высокая', 'высокая', 'максимум'][v] || v,
  };

  // ---------- Fields ----------
  function fillFontSelect() {
    const sel = $('#fFamily');
    sel.textContent = '';
    const custom = getFonts();
    if (custom.length) sel.append(h('optgroup', { label: 'Ваши шрифты' }, custom.map((f) => h('option', { value: f.family, text: f.family }))));
    sel.append(h('optgroup', { label: 'Встроенные' }, FONTS.map((f) => h('option', { value: f.family, text: f.family }))));
    sel.value = draft.font.family;
    if (sel.value !== draft.font.family) sel.append(h('option', { value: draft.font.family, text: draft.font.family, selected: true }));
    fillWeights();
  }

  function fillWeights() {
    const known = FONTS.find((f) => f.family === draft.font.family);
    const weights = known ? known.weights : [400, 700];
    const sel = $('#fWeight');
    const names = { 300: 'Тонкий', 400: 'Обычный', 500: 'Средний', 600: 'Полужирный', 700: 'Жирный' };
    sel.textContent = '';
    for (const w of weights) sel.append(h('option', { value: w, text: names[w] || w }));
    if (!weights.includes(+draft.font.weight)) draft.font.weight = weights.includes(400) ? 400 : weights[0];
    sel.value = draft.font.weight;
  }

  function fillFields() {
    for (const el of $$('[data-bind]', dlg)) {
      const v = getPath(draft, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
    }
    fillFontSelect();
    $$('[data-align]', dlg).forEach((b) => b.classList.toggle('is-on', b.dataset.align === draft.align));
    $$('[data-sg]', dlg).forEach((b) => b.classList.toggle('is-on', b.dataset.sg === sample.gender));
    $('#sampleName').value = sample.name;
    $('#eraseColor').disabled = !draft.erase.on;
    $('#eraseAuto').hidden = !draft.erase.color;
    updateOutputs();
  }

  function updateOutputs() {
    for (const out of $$('[data-out]', dlg)) {
      const v = getPath(draft, out.dataset.out);
      out.textContent = fmt[out.dataset.out] ? fmt[out.dataset.out](v) : v;
    }
  }

  dlg.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset?.bind) return;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.dataset.num != null ? +el.value : el.value;
    setPath(draft, el.dataset.bind, v);
    if (el.dataset.bind === 'font.family') fillWeights();
    if (el.dataset.bind === 'erase.on') $('#eraseColor').disabled = !v;
    dirty = true;
    updateOutputs();
    schedule();
  });

  dlg.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.align) {
      draft.align = t.dataset.align;
      $$('[data-align]', dlg).forEach((b) => b.classList.toggle('is-on', b === t));
      dirty = true;
      schedule();
    } else if (t.dataset.sg) {
      sample.gender = t.dataset.sg;
      $$('[data-sg]', dlg).forEach((b) => b.classList.toggle('is-on', b === t));
      schedule();
    } else if (t.dataset.sample != null) {
      sample = { ...SAMPLES[+t.dataset.sample] };
      fillFields();
      schedule();
    } else if (t.dataset.preset) {
      draft.greet = { ...PRESETS[t.dataset.preset] };
      fillFields();
      dirty = true;
      schedule();
    }
  });

  $('#sampleName').addEventListener('input', (e) => {
    sample.name = e.target.value || ' ';
    schedule();
  });

  $('#eraseColor').addEventListener('input', (e) => {
    draft.erase.color = e.target.value;
    $('#eraseAuto').hidden = false;
    dirty = true;
    schedule();
  });
  $('#eraseAuto').addEventListener('click', () => {
    draft.erase.color = null;
    $('#eraseAuto').hidden = true;
    dirty = true;
    schedule();
  });

  $('#pickColor').addEventListener('click', () => setPicking(!picking));
  function setPicking(on) {
    picking = on;
    stage.classList.toggle('is-picking', on);
    $('#pickColor').classList.toggle('is-on', on);
    if (on) toast('Нажмите на картинке на букву, цвет которой нужен');
  }

  $('#showMask').addEventListener('change', schedule);

  // ---------- Custom font ----------
  $('#fontUpload').addEventListener('click', () => $('#fontFile').click());
  $('#fontFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const family = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
      const font = { id: uid(), family, blobKey: 'font-' + uid() };
      await blobSet(font.blobKey, file);
      await registerFont(font);
      addFont(font);
      draft.font.family = family;
      dirty = true;
      fillFontSelect();
      schedule();
      toast(`Шрифт «${family}» добавлен`);
    } catch (err) {
      toast('Этот файл шрифта не открылся: ' + err.message);
    }
  });

  // ---------- Stage: picture + draggable name box ----------
  function fit() {
    if (!img || !dlg.open) return;
    const r = stage.getBoundingClientRect();
    const s = Math.min((r.width - 40) / img.width, (r.height - 40) / img.height);
    cssW = Math.max(60, Math.floor(img.width * s));
    cssH = Math.max(60, Math.floor(img.height * s));
    frame.style.width = cssW + 'px';
    frame.style.height = cssH + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    positionBox();
    schedule();
  }
  new ResizeObserver(fit).observe(stage);

  function positionBox() {
    const b = draft.box;
    Object.assign(box.style, { left: b.x * cssW + 'px', top: b.y * cssH + 'px', width: b.w * cssW + 'px', height: b.h * cssH + 'px' });
  }

  let drag = null;
  frame.addEventListener('pointerdown', (e) => {
    if (!img) return;
    const rect = frame.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / cssW, fy = (e.clientY - rect.top) / cssH;
    if (picking) {
      const px = Math.floor(fx * img.width), py = Math.floor(fy * img.height);
      const [r, g, b] = srcCtx.getImageData(px, py, 1, 1).data;
      draft.font.color = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      $('#fColor').value = draft.font.color;
      dirty = true;
      setPicking(false);
      schedule();
      return;
    }
    const handle = e.target.dataset.h || (e.target.closest('#nameBox') ? 'move' : 'new');
    drag = { x: e.clientX, y: e.clientY, fx, fy, start: { ...draft.box }, handle, moved: false };
    frame.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  frame.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / cssW, dy = (e.clientY - drag.y) / cssH;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
    drag.moved = true;
    let { x, y, w, h: hh } = drag.start;
    const MIN_W = 0.03, MIN_H = 0.012;
    switch (drag.handle) {
      case 'move': x += dx; y += dy; break;
      case 'new': {
        const x2 = drag.fx + dx, y2 = drag.fy + dy;
        x = Math.min(drag.fx, x2); y = Math.min(drag.fy, y2); w = Math.abs(x2 - drag.fx); hh = Math.abs(y2 - drag.fy);
        break;
      }
      default: {
        const hd = drag.handle;
        if (hd.includes('e')) w += dx;
        if (hd.includes('w')) { x += dx; w -= dx; }
        if (hd.includes('s')) hh += dy;
        if (hd.includes('n')) { y += dy; hh -= dy; }
      }
    }
    w = Math.max(MIN_W, Math.min(1, w));
    hh = Math.max(MIN_H, Math.min(1, hh));
    x = Math.min(Math.max(0, x), 1 - w);
    y = Math.min(Math.max(0, y), 1 - hh);
    draft.box = { x, y, w, h: hh };
    dirty = true;
    positionBox();
    schedule();
  });
  const endDrag = () => { drag = null; };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);

  // ---------- Live preview ----------
  let raf = 0, token = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      redraw();
    });
  }

  async function redraw() {
    if (!draft || !img || !canvas.width) return;
    const my = ++token;
    try {
      const { prep, layout } = await layoutFor(draft, sample, null);
      if (my !== token) return;
      const k = canvas.width / prep.W;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      draw(ctx, draft, prep, layout, k);
      if ($('#showMask').checked) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(maskCanvas(prep), 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      if (!draft.erase.color) $('#eraseColor').value = prep.ringColor;
      const st = $('#tStatus');
      st.textContent = '';
      st.append(
        h('span', { class: `badge badge--${layout.status}`, text: STATUS[layout.status] }),
        ' ',
        h('span', { text: layout.notes.length ? layout.notes.join(', ') : 'имя стоит ровно в рамке' }),
      );
      const hint = $('#tHint');
      hint.hidden = !(prep.boxInk > 0.02 && !draft.erase.on);
    } catch (err) {
      $('#tStatus').textContent = err.message;
    }
  }

  // ---------- Open / save / close ----------
  async function show() {
    try {
      img = await getImage(draft.imageKey);
    } catch (err) {
      toast(err.message);
      return;
    }
    const src = document.createElement('canvas');
    src.width = img.width;
    src.height = img.height;
    srcCtx = src.getContext('2d', { willReadFrequently: true });
    srcCtx.drawImage(img, 0, 0);
    dirty = isNew;
    setPicking(false);
    $('#showMask').checked = false;
    $('#editorTitle').textContent = isNew ? 'Новый шаблон' : 'Шаблон';
    $('#tDelete').hidden = isNew;
    fillFields();
    if (!dlg.open) dlg.showModal();
    requestAnimationFrame(fit);
  }

  async function storeImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Нужна картинка: PNG или JPG');
    const key = 'img-' + uid();
    await blobSet(key, file);
    try {
      await getImage(key);
    } catch {
      await blobDel(key);
      throw new Error('Эту картинку браузер не смог открыть');
    }
    newBlobs.push(key);
    return key;
  }

  async function openNew(file) {
    newBlobs = [];
    try {
      const key = await storeImage(file);
      original = null;
      isNew = true;
      draft = newTemplate(key, file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 40) || 'Шаблон');
      await show();
    } catch (err) {
      toast(err.message);
    }
  }

  async function open(t) {
    newBlobs = [];
    original = t;
    isNew = false;
    draft = structuredClone(t);
    await show();
  }

  $('#tReplace').addEventListener('click', () => $('#tplReplaceFile').click());
  $('#tplReplaceFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      draft.imageKey = await storeImage(file);
      dirty = true;
      await show();
    } catch (err) {
      toast(err.message);
    }
  });

  function discardNewBlobs(keep) {
    for (const key of newBlobs) if (key !== keep) { blobDel(key); forgetImage(key); }
    newBlobs = [];
  }

  $('#tSave').addEventListener('click', () => {
    draft.title = draft.title.trim() || 'Шаблон';
    const missing = ['m', 'f', 'pl'].filter((g) => !PLACEHOLDER.test(draft.greet[g] || ''));
    if (missing.length && !confirm('В обращении нет {имя} — имя гостя туда не попадёт. Всё равно сохранить?')) return;
    if (original && original.imageKey !== draft.imageKey) { blobDel(original.imageKey); forgetImage(original.imageKey); }
    discardNewBlobs(draft.imageKey);
    onSave(structuredClone(draft), isNew);
    dirty = false;
    dlg.close();
  });

  $('#tDelete').addEventListener('click', () => {
    if (!confirm(`Удалить шаблон «${original.title}»? Готовые приглашения с ним тоже пропадут.`)) return;
    discardNewBlobs();
    blobDel(original.imageKey);
    forgetImage(original.imageKey);
    onDelete(original);
    dirty = false;
    dlg.close();
  });

  function tryClose() {
    if (dirty && !confirm('Закрыть без сохранения?')) return;
    discardNewBlobs();
    dirty = false;
    dlg.close();
  }
  $('#editorClose').addEventListener('click', tryClose);
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (picking) return setPicking(false);
    tryClose();
  });

  return { open, openNew };
}
