import { kvGet, kvSet } from './store.js';
import { parseText, importFile, guessGender } from './guests.js';
import { render, layoutFor, STATUS, registerFont, forgetImage } from './render.js';
import { createEditor } from './editor.js';
import { createFixer } from './fixer.js';
import { $, $$, h, uid, toast, downloadBlob, safeName, canvasToBlob, loadJSZip, plural } from './dom.js';

const state = { guests: [], groups: [], templates: [], results: [], fonts: [] };
const ui = { view: 'create', selected: new Set(), template: null, search: '', filter: 'all', doneSearch: '', format: 'jpg', fresh: new Set() };
const GENDER = { m: 'он', f: 'она', pl: 'пара' };
const GENDER_HINT = { m: 'Обращение как к мужчине', f: 'Обращение как к женщине', pl: 'Обращение во множественном числе (пара, семья)' };
const NEXT_GENDER = { m: 'f', f: 'pl', pl: 'm' };

// ---------- Persistence ----------
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    kvSet('state', state).catch((err) => toast('Не удалось сохранить: ' + err.message));
  }, 200);
}
window.addEventListener('pagehide', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    kvSet('state', state);
  }
});

const guestById = (id) => state.guests.find((g) => g.id === id);
const tplById = (id) => state.templates.find((t) => t.id === id);

function groupOrder() {
  const used = new Set(state.guests.map((g) => g.group));
  const order = state.groups.filter((g) => used.has(g));
  for (const g of used) if (!order.includes(g)) order.push(g);
  return order;
}

// ---------- Tabs ----------
function setView(view) {
  ui.view = view;
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
  $('#view-create').hidden = view !== 'create';
  $('#view-done').hidden = view !== 'done';
  renderActionbar();
  if (view === 'done') renderResults();
  window.scrollTo({ top: 0 });
}
$$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

// ---------- Guests ----------
function renderGuests() {
  const list = $('#guestList');
  list.textContent = '';
  const q = ui.search.trim().toLowerCase();
  const doneByGuest = new Map();
  for (const r of state.results) {
    const t = tplById(r.templateId);
    if (t) doneByGuest.set(r.guestId, [...(doneByGuest.get(r.guestId) || []), t.title]);
  }

  for (const group of groupOrder()) {
    const members = state.guests.filter((g) => g.group === group && (!q || g.name.toLowerCase().includes(q) || g.note?.toLowerCase().includes(q)));
    if (!members.length) continue;
    const selectedCount = members.filter((g) => ui.selected.has(g.id)).length;
    const box = h('input', { type: 'checkbox', checked: selectedCount === members.length, 'aria-label': `Выбрать группу ${group}` });
    box.indeterminate = selectedCount > 0 && selectedCount < members.length;
    box.addEventListener('change', () => {
      for (const g of members) box.checked ? ui.selected.add(g.id) : ui.selected.delete(g.id);
      renderGuests();
      renderActionbar();
    });
    list.append(
      h('section', { class: 'group' },
        h('div', { class: 'group__head' },
          h('label', { class: 'check' }, box),
          h('span', { class: 'group__name', text: group }),
          h('span', { class: 'group__count', text: members.length }),
          h('button', { class: 'group__rename', title: 'Переименовать группу', text: '✎', onclick: () => renameGroup(group) }),
        ),
        h('ul', { class: 'guest-list' }, members.map((g) => guestRow(g, doneByGuest.get(g.id)))),
      ),
    );
  }

  const total = state.guests.length;
  $('#guestCount').textContent = total ? `· ${total}` : '';
  $('#guestEmpty').hidden = total > 0;
  $('#guestTools').hidden = total === 0;
  $('#selectAll').checked = total > 0 && ui.selected.size === total;
  $('#selectAll').indeterminate = ui.selected.size > 0 && ui.selected.size < total;
  $('#selCount').textContent = ui.selected.size ? `выбрано ${ui.selected.size}` : '';
  $('#bulk').hidden = ui.selected.size === 0;
  $('#pairBtn').hidden = ui.selected.size !== 2;
  const move = $('#moveSelect');
  move.textContent = '';
  move.append(h('option', { value: '', text: 'Перенести в группу…' }), groupOrder().map((g) => h('option', { value: g, text: g })), h('option', { value: '__new', text: 'Новая группа…' }));
}

function guestRow(g, done) {
  const selected = ui.selected.has(g.id);
  return h('li', { class: 'guest' + (selected ? ' is-selected' : ''), 'data-id': g.id },
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: selected, 'aria-label': `Выбрать ${g.name}` })),
    h('div', { class: 'guest__main' },
      h('button', { class: 'guest__name', title: 'Исправить имя', text: g.name }),
      g.note ? h('span', { class: 'guest__note', text: g.note }) : null,
      done ? h('span', { class: 'guest__done', text: '✓ ' + done.join(', ') }) : null,
    ),
    h('button', { class: 'gender', 'data-g': g.gender, title: GENDER_HINT[g.gender] + ' — нажмите, чтобы сменить', text: GENDER[g.gender] }),
    h('button', { class: 'guest__del', title: 'Удалить гостя', 'aria-label': `Удалить ${g.name}`, text: '×' }),
  );
}

$('#guestList').addEventListener('click', (e) => {
  const li = e.target.closest('.guest');
  if (!li || e.target.closest('.guest__edit')) return;
  const g = guestById(li.dataset.id);
  if (!g) return;
  if (e.target.closest('.guest__name')) return startEdit(li, g);
  if (e.target.closest('.gender')) {
    g.gender = NEXT_GENDER[g.gender];
    g.genderSet = true;
    save();
    renderGuests();
    return;
  }
  if (e.target.closest('.guest__del')) {
    if (!confirm(`Удалить «${g.name}» из списка?`)) return;
    removeGuests([g.id]);
    return;
  }
  if (e.target.tagName === 'INPUT') {
    e.target.checked ? ui.selected.add(g.id) : ui.selected.delete(g.id);
  } else if (!e.target.closest('label')) {
    ui.selected.has(g.id) ? ui.selected.delete(g.id) : ui.selected.add(g.id);
  } else return;
  renderGuests();
  renderActionbar();
});

function startEdit(li, g) {
  const btn = $('.guest__name', li);
  const input = h('input', { class: 'input input--sm guest__edit', value: g.name, 'aria-label': 'Имя на приглашении' });
  btn.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const v = input.value.replace(/\s+/g, ' ').trim();
    if (commit && v && v !== g.name) {
      g.name = v;
      if (!g.genderSet) g.gender = guessGender(v);
      save();
    }
    renderGuests();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function removeGuests(ids) {
  const set = new Set(ids);
  state.guests = state.guests.filter((g) => !set.has(g.id));
  state.results = state.results.filter((r) => !set.has(r.guestId));
  ids.forEach((id) => ui.selected.delete(id));
  save();
  renderGuests();
  renderActionbar();
  updateDoneCount();
}

function renameGroup(oldName) {
  const name = prompt('Название группы', oldName)?.trim();
  if (!name || name === oldName) return;
  for (const g of state.guests) if (g.group === oldName) g.group = name;
  state.groups = state.groups.map((x) => (x === oldName ? name : x)).filter((x, i, a) => a.indexOf(x) === i);
  save();
  renderGuests();
}

$('#guestSearch').addEventListener('input', (e) => {
  ui.search = e.target.value;
  renderGuests();
});
$('#selectAll').addEventListener('change', (e) => {
  ui.selected = e.target.checked ? new Set(state.guests.map((g) => g.id)) : new Set();
  renderGuests();
  renderActionbar();
});
$('#deleteBtn').addEventListener('click', () => {
  const n = ui.selected.size;
  if (confirm(`Удалить ${n} ${plural(n, 'гостя', 'гостей', 'гостей')} из списка?`)) removeGuests([...ui.selected]);
});
$('#pairBtn').addEventListener('click', () => {
  const [a, b] = [...ui.selected].map(guestById);
  const latin = /^[\p{Script=Latin}\s.'-]+$/u.test(a.name + b.name);
  const pair = {
    id: uid(),
    name: `${a.name} ${latin ? 'und' : 'и'} ${b.name}`,
    note: [a.note, b.note].filter(Boolean).join('; '),
    group: a.group,
    gender: 'pl',
  };
  state.guests.splice(state.guests.indexOf(a), 1, pair);
  state.guests = state.guests.filter((g) => g !== b);
  state.results = state.results.filter((r) => r.guestId !== a.id && r.guestId !== b.id);
  ui.selected = new Set([pair.id]);
  save();
  renderGuests();
  renderActionbar();
  updateDoneCount();
  toast(`Теперь это одно приглашение: «${pair.name}»`);
});
$('#moveSelect').addEventListener('change', (e) => {
  let group = e.target.value;
  if (!group) return;
  if (group === '__new') group = prompt('Название новой группы')?.trim();
  if (group) {
    if (!state.groups.includes(group)) state.groups.push(group);
    for (const id of ui.selected) {
      const g = guestById(id);
      if (g) g.group = group;
    }
    save();
  }
  renderGuests();
});

// ---------- Adding guests ----------
const addDlg = $('#addDialog');
function openAdd() {
  $('#addText').value = '';
  $('#groupList').textContent = '';
  $('#groupList').append(groupOrder().map((g) => h('option', { value: g })));
  addDlg.showModal();
  $('#addText').focus();
}
$('#addGuestsBtn').addEventListener('click', openAdd);
$('#emptyAddBtn').addEventListener('click', openAdd);
$('#addClose').addEventListener('click', () => addDlg.close());

function addGuests(entries) {
  // Skip people that are already in the same group (e.g. the same file imported twice),
  // but keep two different guests with the same name inside one new list.
  const existing = new Map();
  for (const g of state.guests) {
    const k = g.group + '\u0000' + g.name.toLowerCase();
    existing.set(k, (existing.get(k) || 0) + 1);
  }
  let added = 0, skipped = 0;
  for (const e of entries) {
    const k = e.group + '\u0000' + e.name.toLowerCase();
    if (existing.get(k) > 0) {
      existing.set(k, existing.get(k) - 1);
      skipped++;
      continue;
    }
    if (!state.groups.includes(e.group)) state.groups.push(e.group);
    state.guests.push({ id: uid(), name: e.name, note: e.note || '', group: e.group, gender: guessGender(e.name) });
    added++;
  }
  save();
  renderGuests();
  renderActionbar();
  const groups = new Set(entries.map((e) => e.group)).size;
  let msg = `Добавлено ${added} ${plural(added, 'имя', 'имени', 'имён')}`;
  if (groups > 1) msg += ` в ${groups} ${plural(groups, 'группу', 'группы', 'групп')}`;
  if (skipped) msg += `, ${skipped} уже были в списке`;
  toast(msg + '. Проверьте «он / она / пара» рядом с именами.', 5000);
}

$('#addConfirm').addEventListener('click', () => {
  const entries = parseText($('#addText').value, $('#addGroup').value.trim() || 'Гости', $('#addStrip').checked);
  if (!entries.length) return toast('Впишите хотя бы одно имя');
  addDlg.close();
  addGuests(entries);
});
$('#addFileBtn').addEventListener('click', () => $('#guestFile').click());
$('#guestFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const entries = await importFile(file, $('#addGroup').value.trim() || 'Гости', $('#addStrip').checked);
    if (!entries.length) return toast('В файле не нашлось имён');
    addDlg.close();
    addGuests(entries);
  } catch (err) {
    toast(err.message);
  }
});

// ---------- Templates ----------
const tplThumbs = new Map();
const SAMPLE_GUEST = { name: 'Мария', gender: 'f' };

function renderCatalog() {
  const grid = $('#catalog');
  grid.textContent = '';
  grid.append(
    h('button', { class: 'tcard tcard--add', onclick: () => $('#tplFile').click() },
      h('span', { class: 'tcard__img' }, h('span', { class: 'tcard__plus', text: '+' }), h('span', { text: 'Загрузить шаблон' }), h('small', { text: 'PNG или JPG' })),
    ),
  );
  for (const t of state.templates) {
    const img = h('img', { alt: '' });
    const card = h('div', { class: 'tcard' + (ui.template === t.id ? ' is-active' : ''), 'data-id': t.id, role: 'button', tabIndex: 0, 'aria-pressed': ui.template === t.id },
      h('span', { class: 'tcard__img' }, img, h('span', { class: 'tcard__tick', text: '✓' })),
      h('span', { class: 'tcard__cap' }, h('strong', { text: t.title }), t.audience ? h('span', { text: t.audience }) : null),
      h('button', { class: 'tcard__edit', text: 'Изменить', onclick: (e) => { e.stopPropagation(); editor.open(t); } }),
    );
    card.addEventListener('click', () => selectTemplate(t.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTemplate(t.id); }
    });
    card.addEventListener('dblclick', () => editor.open(t));
    grid.append(card);
    thumbFor(t).then((url) => { if (url) img.src = url; });
  }
}

async function thumbFor(t) {
  const sig = JSON.stringify(t);
  const hit = tplThumbs.get(t.id);
  if (hit?.sig === sig) return hit.url;
  try {
    const { canvas } = await render(t, SAMPLE_GUEST, null, 460);
    const url = URL.createObjectURL(await canvasToBlob(canvas, 'image/jpeg', 0.86));
    if (hit) URL.revokeObjectURL(hit.url);
    tplThumbs.set(t.id, { sig, url });
    return url;
  } catch {
    return null;
  }
}

function selectTemplate(id) {
  ui.template = ui.template === id ? null : id;
  state.lastTemplate = ui.template;
  save();
  $$('.tcard[data-id]').forEach((c) => {
    c.classList.toggle('is-active', c.dataset.id === ui.template);
    c.setAttribute('aria-pressed', c.dataset.id === ui.template);
  });
  renderActionbar();
}

$('#tplFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) editor.openNew(file);
});

const editor = createEditor({
  getFonts: () => state.fonts,
  addFont: (f) => { state.fonts.push(f); save(); },
  onSave: (t, isNew) => {
    if (isNew) state.templates.push(t);
    else state.templates = state.templates.map((x) => (x.id === t.id ? t : x));
    if (isNew) ui.template = state.lastTemplate = t.id;
    save();
    renderCatalog();
    renderGuests();
    renderActionbar();
    toast(isNew ? 'Шаблон сохранён и выбран' : 'Шаблон сохранён — готовые приглашения обновятся');
  },
  onDelete: (t) => {
    state.templates = state.templates.filter((x) => x.id !== t.id);
    state.results = state.results.filter((r) => r.templateId !== t.id);
    if (ui.template === t.id) ui.template = null;
    save();
    renderCatalog();
    renderGuests();
    renderActionbar();
    updateDoneCount();
  },
});

// ---------- Action bar ----------
function renderActionbar() {
  const bar = $('#actionbar');
  bar.hidden = ui.view !== 'create' || state.guests.length === 0;
  const n = ui.selected.size;
  const t = tplById(ui.template);
  const parts = [];
  parts.push(n ? `${n} ${plural(n, 'гость', 'гостя', 'гостей')}` : 'Отметьте гостей в списке');
  parts.push(t ? `шаблон «${t.title}»` : state.templates.length ? 'выберите шаблон' : 'загрузите шаблон');
  $('#actionText').textContent = parts.join(' · ');
  $('#generateBtn').disabled = !(n && t);
  $('#generateBtn').textContent = n && t ? `Создать ${n} ${plural(n, 'приглашение', 'приглашения', 'приглашений')}` : 'Создать приглашения';
}

$('#generateBtn').addEventListener('click', async () => {
  const t = tplById(ui.template);
  if (!t || !ui.selected.size) return;
  const btn = $('#generateBtn');
  btn.disabled = true;
  btn.textContent = 'Подбираю место для имён…';
  ui.fresh = new Set();
  let toCheck = 0;
  try {
    for (const id of ui.selected) {
      const g = guestById(id);
      if (!g) continue;
      let r = state.results.find((x) => x.guestId === id && x.templateId === t.id);
      if (!r) {
        r = { id: uid(), guestId: id, templateId: t.id, override: null, createdAt: Date.now() };
        state.results.push(r);
      }
      ui.fresh.add(r.id);
      const { layout } = await layoutFor(t, g, r.override);
      if (layout.status === 'check') toCheck++;
    }
  } catch (err) {
    toast('Не получилось: ' + err.message);
  }
  save();
  const made = ui.fresh.size;
  ui.selected.clear();
  ui.filter = 'all';
  renderGuests();
  updateDoneCount();
  setView('done');
  toast(`Готово: ${made} ${plural(made, 'приглашение', 'приглашения', 'приглашений')}` +
    (toCheck ? `. ${toCheck} стоит посмотреть — они отмечены «Проверьте».` : '. Все имена встали красиво.'), 5000);
});

// ---------- Finished invitations ----------
const resultThumbs = new Map(); // result id -> { sig, url, layout }
const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] }));

function updateDoneCount() {
  const n = state.results.filter((r) => guestById(r.guestId) && tplById(r.templateId)).length;
  $('#doneCount').textContent = n;
  $('#doneCount').hidden = !n;
}

function resultItems() {
  return state.results
    .map((r) => ({ r, g: guestById(r.guestId), t: tplById(r.templateId) }))
    .filter((x) => x.g && x.t);
}

const sigOf = ({ r, g, t }) => JSON.stringify([t, g.name, g.gender, r.override]);

async function statusOf(item) {
  const sig = sigOf(item);
  const hit = resultThumbs.get(item.r.id);
  if (hit?.sig === sig) return hit.layout;
  const { layout } = await layoutFor(item.t, item.g, item.r.override);
  resultThumbs.set(item.r.id, { sig, url: null, layout });
  return layout;
}

let resultsRun = 0;
async function renderResults() {
  const run = ++resultsRun;
  const all = resultItems();
  const counts = { all: all.length, check: 0, adjusted: 0, ok: 0, manual: 0 };
  for (const item of all) {
    try {
      item.layout = await statusOf(item);
    } catch (err) {
      item.layout = { status: 'check', notes: [err.message] };
    }
    counts[item.layout.status]++;
  }
  if (run !== resultsRun) return;

  for (const chip of $$('#filters .chip')) {
    chip.classList.toggle('is-active', chip.dataset.f === ui.filter);
    $('span', chip).textContent = counts[chip.dataset.f];
    chip.hidden = chip.dataset.f !== 'all' && !counts[chip.dataset.f] && ui.filter !== chip.dataset.f;
  }

  const q = ui.doneSearch.trim().toLowerCase();
  const items = all
    .filter((x) => ui.filter === 'all' || x.layout.status === ui.filter)
    .filter((x) => !q || x.g.name.toLowerCase().includes(q) || x.t.title.toLowerCase().includes(q));

  const grid = $('#results');
  grid.textContent = '';
  $('#resultsEmpty').hidden = all.length > 0;
  $('#doneToolbar').hidden = all.length === 0;
  $('#zipBtn').textContent = `Скачать ${items.length === all.length ? 'все' : items.length} · ZIP`;
  $('#zipBtn').disabled = !items.length;

  const cards = items.map((item) => {
    const { r, g, t, layout } = item;
    const img = h('img', { alt: `Приглашение для ${g.name}`, loading: 'lazy' });
    const card = h('article', { class: 'rcard' + (ui.fresh.has(r.id) ? ' is-fresh' : ''), 'data-id': r.id },
      h('button', { class: 'rcard__img', title: 'Открыть и поправить', 'data-act': 'fix' }, img),
      h('div', { class: 'rcard__cap' },
        h('strong', { text: g.name }),
        h('span', { text: t.title }),
      ),
      h('div', { class: 'rcard__status' },
        h('span', { class: `badge badge--${layout.status}`, text: STATUS[layout.status] }),
        layout.notes?.length ? h('small', { text: layout.notes.join(', ') }) : null,
      ),
      h('div', { class: 'rcard__acts' },
        h('button', { class: 'link', 'data-act': 'dl', text: 'Скачать' }),
        canShareFiles ? h('button', { class: 'link', 'data-act': 'share', text: 'Отправить' }) : null,
        h('button', { class: 'link', 'data-act': 'fix', text: 'Поправить' }),
        h('button', { class: 'link link--danger', 'data-act': 'del', text: 'Убрать' }),
      ),
    );
    grid.append(card);
    return { item, img };
  });

  for (const { item, img } of cards) {
    if (run !== resultsRun) return;
    const url = await thumbUrl(item);
    if (url) img.src = url;
  }
}

async function thumbUrl(item) {
  const sig = sigOf(item);
  const hit = resultThumbs.get(item.r.id);
  if (hit?.sig === sig && hit.url) return hit.url;
  try {
    const { canvas, layout } = await render(item.t, item.g, item.r.override, 560);
    const url = URL.createObjectURL(await canvasToBlob(canvas, 'image/jpeg', 0.86));
    if (hit?.url) URL.revokeObjectURL(hit.url);
    resultThumbs.set(item.r.id, { sig, url, layout });
    return url;
  } catch {
    return null;
  }
}

async function fullFile(item) {
  const png = ui.format === 'png';
  const { canvas } = await render(item.t, item.g, item.r.override, 0, { background: png ? null : '#ffffff' });
  const blob = await canvasToBlob(canvas, png ? 'image/png' : 'image/jpeg', 0.93);
  return { blob, name: `${safeName('Приглашение — ' + item.g.name)}.${png ? 'png' : 'jpg'}` };
}

$('#results').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.rcard').dataset.id;
  const item = resultItems().find((x) => x.r.id === id);
  if (!item) return;
  const act = btn.dataset.act;
  if (act === 'fix') return fixer.open(item.r, item.t, item.g);
  if (act === 'del') {
    state.results = state.results.filter((r) => r.id !== id);
    save();
    updateDoneCount();
    renderGuests();
    renderResults();
    return;
  }
  try {
    const { blob, name } = await fullFile(item);
    if (act === 'dl') downloadBlob(blob, name);
    if (act === 'share') await navigator.share({ files: [new File([blob], name, { type: blob.type })], title: name });
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message);
  }
});

const fixer = createFixer({
  onDone: () => {
    save();
    renderResults();
  },
});

$('#filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  ui.filter = chip.dataset.f;
  renderResults();
});
$('#doneSearch').addEventListener('input', (e) => {
  ui.doneSearch = e.target.value;
  renderResults();
});
$('#formatSelect').addEventListener('change', (e) => {
  ui.format = e.target.value;
});

$('#zipBtn').addEventListener('click', async () => {
  const btn = $('#zipBtn');
  const q = ui.doneSearch.trim().toLowerCase();
  const items = [];
  for (const x of resultItems()) {
    if (q && !x.g.name.toLowerCase().includes(q) && !x.t.title.toLowerCase().includes(q)) continue;
    if (ui.filter !== 'all' && (await statusOf(x)).status !== ui.filter) continue;
    items.push(x);
  }
  if (!items.length) return;
  const label = btn.textContent;
  btn.disabled = true;
  try {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const used = new Map(); // file name -> guest id
    for (let i = 0; i < items.length; i++) {
      btn.textContent = `Готовлю ${i + 1} из ${items.length}…`;
      const { r, g, t } = items[i];
      const { blob } = await fullFile(items[i]);
      const ext = ui.format === 'png' ? 'png' : 'jpg';
      const base = safeName(`Приглашение — ${g.name}`);
      let name = base;
      // Same guest with a second template: name the template. Two guests with one name: number them.
      if (used.has(name) && used.get(name) === r.guestId) name = safeName(`${base} (${t.title})`);
      for (let n = 2; used.has(name); n++) name = safeName(`${base} ${n}`);
      used.set(name, r.guestId);
      zip.file(`${name}.${ext}`, blob);
    }
    btn.textContent = 'Упаковываю…';
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'Приглашения.zip');
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

$('#clearResults').addEventListener('click', () => {
  if (!confirm('Убрать все готовые приглашения? Гости и шаблоны останутся.')) return;
  state.results = [];
  save();
  updateDoneCount();
  renderGuests();
  renderResults();
});

$('#doneEmptyBtn').addEventListener('click', () => setView('create'));

// ---------- Start ----------
async function init() {
  try {
    const saved = await kvGet('state');
    if (saved) Object.assign(state, saved);
  } catch (err) {
    toast('Сохранённые данные не открылись: ' + err.message);
  }
  navigator.storage?.persist?.().catch(() => {});
  await Promise.all(state.fonts.map((f) => registerFont(f).catch(() => {})));
  state.results = state.results.filter((r) => guestById(r.guestId) && tplById(r.templateId));
  ui.template = tplById(state.lastTemplate) ? state.lastTemplate : state.templates.length === 1 ? state.templates[0].id : null;
  renderGuests();
  renderCatalog();
  renderActionbar();
  updateDoneCount();
  document.body.classList.add('is-ready');
}

init();

// Handy in the browser console when something looks off
window.__invites = { state, ui, forgetImage };
