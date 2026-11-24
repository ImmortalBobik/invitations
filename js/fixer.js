import { layoutFor, draw, fillGreeting, STATUS } from './render.js';
import { $, h } from './dom.js';

/** "Поправить" dialog for one finished invitation: text, size, position, lines. */
export function createFixer({ onDone }) {
  const dlg = $('#fix');
  const canvas = $('#fixCanvas');
  const ctx = canvas.getContext('2d');
  const size = $('#fixSize'), sx = $('#fixX'), sy = $('#fixY'), text = $('#fixText');
  let result, t, g, draft, lines = 1, token = 0;

  async function open(r, template, guest) {
    result = r;
    t = template;
    g = guest;
    draft = { text: r.override?.text || '', manual: r.override?.manual ? { ...r.override.manual } : null };
    $('#fixTitle').textContent = guest.name;
    $('#fixSub').textContent = template.title;
    text.value = draft.text || fillGreeting(t, g);
    dlg.showModal();
    await refresh(true);
  }

  async function refresh(syncControls) {
    const my = ++token;
    const { prep, layout } = await layoutFor(t, g, { text: draft.text || null, manual: draft.manual });
    if (my !== token) return;
    const k = Math.min(1, 1100 / prep.W);
    canvas.width = Math.round(prep.W * k);
    canvas.height = Math.round(prep.H * k);
    draw(ctx, t, prep, layout, k);
    if (syncControls) {
      size.value = Math.round(layout.scale * 100);
      sx.value = ((layout.dx / prep.W) * 100).toFixed(1);
      sy.value = ((layout.dy / prep.H) * 100).toFixed(1);
      lines = layout.lines.length;
    }
    $('#fixSizeOut').textContent = size.value + '%';
    document.querySelectorAll('[data-lines]').forEach((b) => b.classList.toggle('is-on', +b.dataset.lines === lines));
    const st = $('#fixStatus');
    st.textContent = '';
    st.append(
      h('span', { class: `badge badge--${layout.status}`, text: STATUS[layout.status] }),
      ' ',
      h('span', { text: layout.notes.join(', ') || 'имя стоит ровно в рамке' }),
    );
    $('#fixAuto').disabled = !draft.manual;
  }

  const takeManual = () => {
    draft.manual = { scale: +size.value / 100, dx: +sx.value / 100, dy: +sy.value / 100, lines };
    refresh(false);
  };
  size.addEventListener('input', takeManual);
  sx.addEventListener('input', takeManual);
  sy.addEventListener('input', takeManual);
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lines]');
    if (!b) return;
    lines = +b.dataset.lines;
    takeManual();
  });

  text.addEventListener('input', () => {
    const v = text.value.trim();
    draft.text = v && v !== fillGreeting(t, g) ? v : '';
    refresh(!draft.manual);
  });

  $('#fixAuto').addEventListener('click', () => {
    draft.manual = null;
    refresh(true);
  });

  $('#fixDone').addEventListener('click', () => {
    result.override = draft.text || draft.manual ? { text: draft.text || null, manual: draft.manual } : null;
    dlg.close();
    onDone(result);
  });
  $('#fixClose').addEventListener('click', () => dlg.close());

  return { open };
}
