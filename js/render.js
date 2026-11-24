import { blobGet } from './store.js';

// Fonts loaded from Google Fonts in index.html; all of them have Cyrillic letters.
export const FONTS = [
  { family: 'Cormorant Garamond', weights: [300, 400, 500, 600, 700] },
  { family: 'Tenor Sans', weights: [400] },
  { family: 'Forum', weights: [400] },
  { family: 'Prata', weights: [400] },
  { family: 'Playfair Display', weights: [400, 500, 600, 700] },
  { family: 'Lora', weights: [400, 500, 600, 700] },
  { family: 'Alice', weights: [400] },
  { family: 'Montserrat', weights: [300, 400, 500, 600] },
  { family: 'Roboto', weights: [300, 400, 500, 700] },
  { family: 'Great Vibes', weights: [400] },
  { family: 'Marck Script', weights: [400] },
  { family: 'Bad Script', weights: [400] },
];

export const STATUS = { ok: 'Отлично', adjusted: 'Подогнано', check: 'Проверьте', manual: 'Вручную' };
export const PLACEHOLDER = /\{(имя|name)\}/i;

const LINE_HEIGHT = 1.22;
const INK_LIMIT = 0.004; // share of "drawn" pixels under the name that still counts as a clean spot

// ---------- Images and fonts ----------
const images = new Map();
/** Keys are IndexedDB blob ids, or "url:<path>" for pictures that ship with the app. */
export function getImage(key) {
  if (!images.has(key)) {
    const load = key.startsWith('url:')
      ? fetch(new URL(key.slice(4), document.baseURI)).then((r) => {
          if (!r.ok) throw new Error('Картинка шаблона не загрузилась');
          return r.blob();
        })
      : blobGet(key);
    const p = load
      .then((blob) => {
        if (!blob) throw new Error('Картинка шаблона не найдена');
        return createImageBitmap(blob);
      })
      .catch((err) => {
        images.delete(key);
        throw err;
      });
    images.set(key, p);
  }
  return images.get(key);
}

export function forgetImage(key) {
  images.delete(key);
  for (const [sig, p] of preps) if (p.imageKey === key) preps.delete(sig);
}

export async function registerFont(font) {
  const blob = await blobGet(font.blobKey);
  if (!blob) return;
  const face = new FontFace(font.family, await blob.arrayBuffer());
  await face.load();
  document.fonts.add(face);
}

export function fontCss(t, px) {
  const f = t.font;
  return `${f.italic ? 'italic ' : ''}${f.weight || 400} ${px.toFixed(2)}px "${f.family}"`;
}

export async function ensureFont(t, text) {
  try {
    await document.fonts.load(fontCss(t, 48), text || 'АаBb');
  } catch { /* falls back to a system font */ }
}

// ---------- Text ----------
export function fillGreeting(t, guest) {
  const pattern = t.greet?.[guest.gender] ?? t.greet?.f ?? '{имя}';
  return pattern.replace(PLACEHOLDER, guest.name.trim()).replace(/\s+/g, ' ').trim();
}

export function textFor(t, guest, override) {
  const s = override?.text?.trim() ? override.text.replace(/\s+/g, ' ').trim() : fillGreeting(t, guest);
  return t.font.upper ? s.toLocaleUpperCase() : s;
}

function prefixWords(t, guest, override) {
  if (override?.text?.trim()) return 0;
  const pattern = t.greet?.[guest.gender] ?? '';
  const i = pattern.search(PLACEHOLDER);
  const before = i > 0 ? pattern.slice(0, i).trim() : '';
  return before ? before.split(/\s+/).length : 0;
}

// ---------- Reading the picture: where is it empty? ----------
const preps = new Map(); // signature -> Promise<prep>
const boxPx = (b, W, H) => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Builds the background (with the old name painted over, if asked) and a map of
 * "drawn" pixels: anything that differs clearly from the paper colour around the
 * name box — flowers, other text, frames. The name is placed where that map is empty.
 */
export function prepare(t) {
  const sig = JSON.stringify([t.imageKey, t.box, !!t.erase?.on, t.erase?.color || null, t.fit?.sens ?? 5, t.layers || null]);
  if (preps.has(sig)) {
    const hit = preps.get(sig);
    preps.delete(sig);
    preps.set(sig, hit);
    return hit;
  }
  const p = buildPrep(t, sig);
  p.imageKey = t.imageKey;
  preps.set(sig, p);
  p.catch(() => preps.delete(sig));
  while (preps.size > 10) preps.delete(preps.keys().next().value);
  return p;
}

async function buildPrep(t, sig) {
  const img = await getImage(t.imageKey);
  const W = img.width, H = img.height;
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const bctx = base.getContext('2d', { willReadFrequently: true });
  bctx.drawImage(img, 0, 0);

  const box = boxPx(t.box, W, H);
  const ringColor = sampleRing(bctx, box, W, H);
  let eraseColor = null;
  if (t.erase?.on) {
    eraseColor = t.erase.color || ringColor;
    const blur = Math.max(1, Math.round(Math.min(W, H) * 0.003));
    bctx.save();
    bctx.fillStyle = eraseColor;
    bctx.filter = `blur(${blur}px)`;
    bctx.fillRect(box.x - blur * 2, box.y - blur * 2, box.w + blur * 4, box.h + blur * 4);
    bctx.filter = 'none';
    bctx.fillRect(box.x, box.y, box.w, box.h);
    bctx.restore();
  }
  // The template's own text (heading, date, signature) is part of the background,
  // so the name fitting below treats it like any other drawing to keep clear of.
  await drawLayers(bctx, t.layers, W, H);

  const ms = Math.min(1, 560 / Math.max(W, H));
  const mw = Math.max(1, Math.round(W * ms)), mh = Math.max(1, Math.round(H * ms));
  const mc = document.createElement('canvas');
  mc.width = mw;
  mc.height = mh;
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  mctx.drawImage(base, 0, 0, mw, mh);
  const data = mctx.getImageData(0, 0, mw, mh).data;

  const bg = dominantColor(data, mw, mh, {
    x: (box.x - box.w * 0.3) * ms, y: (box.y - box.h * 1.5) * ms, w: box.w * 1.6 * ms, h: box.h * 4 * ms,
  });
  const thr = 64 - (t.fit?.sens ?? 5) * 6;
  const thr2 = thr * thr;
  const mask = new Uint8Array(mw * mh);
  const sat = new Uint32Array((mw + 1) * (mh + 1));
  const W1 = mw + 1;
  for (let y = 0; y < mh; y++) {
    let row = 0;
    for (let x = 0; x < mw; x++) {
      const i = (y * mw + x) * 4;
      let ink = 0;
      if (data[i + 3] > 24) {
        const dr = data[i] - bg.r, dg = data[i + 1] - bg.g, db = data[i + 2] - bg.b;
        ink = dr * dr + dg * dg + db * db > thr2 ? 1 : 0;
      }
      mask[y * mw + x] = ink;
      row += ink;
      sat[(y + 1) * W1 + x + 1] = sat[y * W1 + x + 1] + row;
    }
  }
  const prep = { sig, imageKey: t.imageKey, W, H, base, mask, sat, mw, mh, ms, bg: hex(bg.r, bg.g, bg.b), ringColor, eraseColor };
  prep.boxInk = inkIn(prep, box).frac;
  return prep;
}

function sampleRing(ctx, box, W, H) {
  const pad = 3;
  const x0 = clamp(Math.floor(box.x - pad), 0, W - 1), y0 = clamp(Math.floor(box.y - pad), 0, H - 1);
  const x1 = clamp(Math.ceil(box.x + box.w + pad), x0 + 1, W), y1 = clamp(Math.ceil(box.y + box.h + pad), y0 + 1, H);
  const w = x1 - x0, h = y1 - y0;
  const d = ctx.getImageData(x0, y0, w, h).data;
  const rs = [], gs = [], bs = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!(x < pad || y < pad || x >= w - pad || y >= h - pad)) continue;
      const i = (y * w + x) * 4;
      if (d[i + 3] < 24) continue;
      rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
    }
  }
  const med = (a) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 255);
  return hex(med(rs), med(gs), med(bs));
}

function dominantColor(data, mw, mh, r) {
  const x0 = clamp(Math.floor(r.x), 0, mw), x1 = clamp(Math.ceil(r.x + r.w), 0, mw);
  const y0 = clamp(Math.floor(r.y), 0, mh), y1 = clamp(Math.ceil(r.y + r.h), 0, mh);
  const hist = new Uint32Array(32768);
  let best = 0, bin = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * mw + x) * 4;
      if (data[i + 3] < 24) continue;
      const q = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      if (++hist[q] > best) { best = hist[q]; bin = q; }
    }
  }
  if (bin < 0) return { r: 255, g: 255, b: 255 };
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * mw + x) * 4;
      if (data[i + 3] < 24) continue;
      if ((((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)) !== bin) continue;
      sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
    }
  }
  return { r: sr / n, g: sg / n, b: sb / n };
}

function inkIn(p, r) {
  const { ms, mw, mh, sat } = p;
  const x0 = clamp(Math.floor(r.x * ms), 0, mw), x1 = clamp(Math.ceil((r.x + r.w) * ms), 0, mw);
  const y0 = clamp(Math.floor(r.y * ms), 0, mh), y1 = clamp(Math.ceil((r.y + r.h) * ms), 0, mh);
  const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (!area) return { ink: 0, area: 0, frac: 0 };
  const W1 = mw + 1;
  const ink = sat[y1 * W1 + x1] - sat[y0 * W1 + x1] - sat[y1 * W1 + x0] + sat[y0 * W1 + x0];
  return { ink, area, frac: ink / area };
}

export function maskCanvas(prep) {
  if (prep.maskC) return prep.maskC;
  const c = document.createElement('canvas');
  c.width = prep.mw;
  c.height = prep.mh;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(prep.mw, prep.mh);
  for (let i = 0; i < prep.mask.length; i++) {
    if (!prep.mask[i]) continue;
    id.data[i * 4] = 214; id.data[i * 4 + 1] = 64; id.data[i * 4 + 2] = 40; id.data[i * 4 + 3] = 170;
  }
  ctx.putImageData(id, 0, 0);
  return (prep.maskC = c);
}

// ---------- Fitting the name ----------
const measureCtx = document.createElement('canvas').getContext('2d');

function metricsFor(t, S, text) {
  measureCtx.font = fontCss(t, S);
  const sp = (t.font.spacing || 0) * S;
  const m = measureCtx.measureText(text);
  let asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  if (!(asc > 0)) { asc = S * 0.72; desc = S * 0.2; }
  return {
    S, asc, desc: Math.max(0, desc || 0),
    width: (s) => {
      measureCtx.font = fontCss(t, S);
      return measureCtx.measureText(s).width + sp * Math.max(0, Array.from(s).length - 1);
    },
  };
}

/** Best place to break a long greeting into two lines: never right after "и"/"und", prefer right after "Дорогая". */
function twoLines(text, width, prefix) {
  const words = text.split(' ');
  if (words.length < 2) return null;
  const conj = /^(и|а|und|&|\+|или|oder)$/i;
  let best = null;
  for (let i = 1; i < words.length; i++) {
    if (conj.test(words[i - 1])) continue;
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    let cost = Math.max(width(a), width(b));
    if (conj.test(words[i])) cost *= 0.94;
    if (i === prefix) cost *= 0.9;
    if (!best || cost < best.cost) best = { cost, lines: [a, b] };
  }
  return best?.lines ?? null;
}

function place(t, prep, M, lines, widths, scale, dx, dy) {
  const { W, H } = prep;
  const box = boxPx(t.box, W, H);
  const px = M.S * scale, asc = M.asc * scale, desc = M.desc * scale, lh = px * LINE_HEIGHT, n = lines.length;
  const cx = box.x + box.w / 2 + dx, cy = box.y + box.h / 2 + dy;
  const padX = px * 0.18, padY = px * 0.12;
  let ink = 0, area = 0, out = false, maxW = 0;
  const placed = lines.map((text, i) => {
    const w = widths[i] * scale;
    maxW = Math.max(maxW, w);
    const mid = cy + (i - (n - 1) / 2) * lh;
    const baseline = mid + (asc - desc) / 2;
    const x = t.align === 'left' ? box.x + dx : t.align === 'right' ? box.x + box.w + dx - w : cx - w / 2;
    const r = { x: x - padX, y: baseline - asc - padY, w: w + padX * 2, h: asc + desc + padY * 2 };
    if (x < W * 0.01 || x + w > W * 0.99 || baseline - asc < 0 || baseline + desc > H) out = true;
    const s = inkIn(prep, r);
    ink += s.ink;
    area += s.area;
    return { text, x, baseline, w };
  });
  return { lines: placed, px, scale, dx, dy, inkFrac: area ? ink / area : 0, out, overflow: Math.max(0, maxW - box.w) / box.w };
}

function verdict(p, W) {
  const notes = [];
  if (p.scale < 0.995) notes.push(`шрифт −${Math.round((1 - p.scale) * 100)}%`);
  if (p.scale > 1.005) notes.push(`шрифт +${Math.round((p.scale - 1) * 100)}%`);
  if (Math.abs(p.dx) > W * 0.002) notes.push(p.dx > 0 ? 'сдвинуто вправо' : 'сдвинуто влево');
  if (p.lines.length > 1) notes.push('в две строки');
  if (p.overflow > 0.02) notes.push('чуть шире рамки');
  let status = 'ok';
  if (p.out || p.inkFrac > INK_LIMIT) {
    status = 'check';
    notes.unshift(p.out ? 'не помещается на картинке' : 'задевает рисунок или текст');
  } else if (notes.length) status = 'adjusted';
  return { ...p, status, notes };
}

/**
 * Tries every combination of: font size (100% down to the template's minimum),
 * one or two lines, and a sideways shift — and keeps the one that touches
 * nothing on the picture while changing the design the least.
 */
export function autoLayout(t, prep, text, prefix = 0) {
  const { W } = prep;
  const M = metricsFor(t, t.font.size * W, text);
  const options = [[text]];
  const split = twoLines(text, M.width, prefix);
  if (split) options.push(split);
  const widths = options.map((ls) => ls.map(M.width));

  const step = Math.max(1, W * 0.005);
  const maxShift = (t.fit?.maxShift ?? 0.06) * W;
  const shifts = [0];
  for (let s = step; s <= maxShift + 1e-6; s += step) shifts.push(s, -s);
  const minScale = t.fit?.minScale ?? 0.7;

  let best = null;
  for (let scale = 1; scale >= minScale - 1e-6; scale = Math.round((scale - 0.025) * 1000) / 1000) {
    options.forEach((lines, oi) => {
      for (const dx of shifts) {
        const p = place(t, prep, M, lines, widths[oi], scale, dx, 0);
        if (p.out) continue;
        const cost = p.inkFrac * 400 + (1 - scale) * 12 + (Math.abs(dx) / W) * 60 + (lines.length - 1) * 2.5 + p.overflow * 20;
        if (!best || cost < best.cost) best = { ...p, cost };
      }
    });
    if (best && best.cost < 1e-9) break;
  }
  if (!best) best = place(t, prep, M, options.at(-1), widths.at(-1), minScale, 0, 0);
  return verdict(best, W);
}

export function manualLayout(t, prep, text, manual, prefix = 0) {
  const { W, H } = prep;
  const M = metricsFor(t, t.font.size * W, text);
  const lines = (manual.lines === 2 && twoLines(text, M.width, prefix)) || [text];
  const p = verdict(place(t, prep, M, lines, lines.map(M.width), manual.scale, manual.dx * W, manual.dy * H), W);
  return { ...p, status: 'manual', notes: p.status === 'check' ? [p.notes[0], 'поправлено вручную'] : ['поправлено вручную'] };
}

export async function layoutFor(t, guest, override) {
  const text = textFor(t, guest, override);
  await ensureFont(t, text);
  const prep = await prepare(t);
  const prefix = prefixWords(t, guest, override);
  const layout = override?.manual ? manualLayout(t, prep, text, override.manual, prefix) : autoLayout(t, prep, text, prefix);
  return { text, prep, layout };
}

// ---------- Drawing ----------
/** One line of text with extra letter spacing, measuring the whole prefix each time so kerning is kept. */
function drawLine(ctx, text, x, y, sp) {
  if (!sp) {
    ctx.fillText(text, x, y);
    return;
  }
  let prefix = '';
  Array.from(text).forEach((c, i) => {
    ctx.fillText(c, x + ctx.measureText(prefix).width + i * sp, y);
    prefix += c;
  });
}

const layerCss = (l, px) => `${l.italic ? 'italic ' : ''}${l.weight || 400} ${px.toFixed(2)}px "${l.family}"`;

/**
 * Static text and shapes of a template. Positions are fractions of the picture;
 * a text layer's y is the baseline of its first line, x is its left/right/centre edge.
 */
export async function drawLayers(ctx, layers, W, H) {
  if (!layers?.length) return;
  await Promise.all(
    layers
      .filter((l) => l.type === 'text' && l.text)
      .map((l) => document.fonts.load(layerCss(l, 48), l.text).catch(() => {})),
  );
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const l of layers) {
    ctx.fillStyle = l.color || '#333';
    if (l.type === 'rect') {
      ctx.fillRect(l.x * W, l.y * H, l.w * W, l.h * H);
      continue;
    }
    if (l.type !== 'text' || !l.text?.trim()) continue;
    const lines = (l.upper ? l.text.toLocaleUpperCase() : l.text).split('\n');
    let px = l.size * W;
    const widthAt = (s, size) => {
      ctx.font = layerCss(l, size);
      return ctx.measureText(s).width + (l.spacing || 0) * size * Math.max(0, Array.from(s).length - 1);
    };
    if (l.maxWidth) {
      const widest = Math.max(...lines.map((s) => widthAt(s, px)));
      if (widest > l.maxWidth * W) px *= (l.maxWidth * W) / widest;
    }
    const lh = (l.lineHeight || 1.25) * px;
    lines.forEach((line, i) => {
      const w = widthAt(line, px);
      let x = l.x * W;
      if (l.align === 'right') x -= w;
      else if (l.align === 'center') x -= w / 2;
      drawLine(ctx, line, x, l.y * H + i * lh, (l.spacing || 0) * px);
    });
  }
  ctx.restore();
}

export function draw(ctx, t, prep, layout, k = 1, { background } = {}) {
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, prep.W * k, prep.H * k);
  }
  ctx.drawImage(prep.base, 0, 0, prep.W * k, prep.H * k);
  ctx.fillStyle = t.font.color || '#333';
  ctx.font = fontCss(t, layout.px * k);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const sp = (t.font.spacing || 0) * layout.px * k;
  for (const l of layout.lines) drawLine(ctx, l.text, l.x * k, l.baseline * k, sp);
  ctx.restore();
}

/** Renders one finished invitation. maxW limits the width for previews. */
export async function render(t, guest, override, maxW, opts) {
  const { prep, layout } = await layoutFor(t, guest, override);
  const k = maxW ? Math.min(1, maxW / prep.W) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(prep.W * k));
  canvas.height = Math.max(1, Math.round(prep.H * k));
  draw(canvas.getContext('2d'), t, prep, layout, k, opts);
  return { canvas, layout, prep };
}
