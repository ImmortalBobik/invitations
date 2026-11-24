import { loadJSZip } from './dom.js';

// ---------- Guessing he / she / couple from a name ----------
// Only a starting point: every guest has a toggle in the list to correct it.
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

const MALE_ENDING_A = new Set(norm(
  'никита илья миша саша даня ваня дима коля женя паша сеня витя вова слава леша гоша боря толя юра ' +
  'петя федя гриша кузьма фома лука костя степа сема тема рома яша гена митя жора лева вася савва сава ' +
  'алеша андрюша сережа кеша тимоша мишка вовка'
).split(' '));
const FEMALE_OTHER = new Set(norm(
  'жасмин рахель любовь нинель эсфирь руфь юдифь ассоль адель изабель мишель габриэль ' +
  'gillian ruth esther rachel ingrid sigrid gudrun karin doris iris miriam carmen ellen helen kristin kirsten ' +
  'jasmin ann lisbeth elisabeth margit britt birgit'
).split(' '));
const MALE_WORDS = new Set(norm(
  'дядя дедушка деда дед муж брат папа отец сын племянник крестный жених друг ' +
  'herr onkel opa bruder vater mann ehemann freund kollege sohn neffe'
).split(' '));
const FEMALE_WORDS = new Set(norm(
  'тетя бабушка бабуля жена сестра мама мать дочь племянница подруга подружка крестная невеста ' +
  'frau freundin tante oma schwester mutter kollegin tochter nichte'
).split(' '));

export function guessGender(name) {
  const s = ' ' + norm(name).replace(/[()[\],.;:!?"«»]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  if (/\s(и|und|&|\+)\s/.test(s) || /^\s(семья|семейство|супруги|familie|fam|eheleute)\s/.test(s)) return 'pl';
  const words = s.trim().split(' ');
  for (const w of words) {
    if (FEMALE_WORDS.has(w)) return 'f';
    if (MALE_WORDS.has(w)) return 'm';
  }
  const first = words.find((w) => /\p{L}/u.test(w)) || '';
  if (FEMALE_OTHER.has(first)) return 'f';
  if (MALE_ENDING_A.has(first)) return 'm';
  if (/[а-я]/.test(first)) return /[аяи]$/.test(first) ? 'f' : 'm';
  return /(a|ie|e|y|elle|ine)$/.test(first) ? 'f' : 'm';
}

// ---------- Cleaning list entries ----------
/** "(папа Пети) Олег" -> { name: "Олег", note: "папа Пети" }; "Юля – именинница" -> note after the dash */
export function cleanEntry(raw, strip = true) {
  let s = raw.replace(/ /g, ' ').trim().replace(/^(\d+[.)]\s*|[-–—•*·]\s+)/, '').trim();
  if (!strip) return { name: s.replace(/\s+/g, ' '), note: '' };
  const notes = [];
  s = s.replace(/\(([^)]*)\)?/g, (_, n) => {
    if (n.trim()) notes.push(n.trim());
    return ' ';
  });
  const dash = s.match(/^(.*?\S)\s+[–—-]\s*(.*)$/);
  if (dash) {
    s = dash[1];
    if (dash[2].trim()) notes.push(dash[2].trim());
  }
  s = s.replace(/\s+/g, ' ').replace(/\s*\?+$/, '').trim();
  return { name: s, note: notes.join('; ') };
}

const cleanHeader = (s) =>
  s.replace(/:\s*$/, '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim();

/** One guest per line. A line ending with ":" starts a new group. */
export function parseText(text, defaultGroup, strip) {
  let lines = text.split(/\r?\n/);
  if (lines.filter((l) => l.trim()).length === 1 && lines.join('').includes(',')) lines = lines.join('').split(',');
  const out = [];
  let group = defaultGroup;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/:$/.test(line)) {
      group = cleanHeader(line) || defaultGroup;
      continue;
    }
    const e = cleanEntry(line, strip);
    if (e.name) out.push({ ...e, group });
  }
  return out;
}

export async function importFile(file, defaultGroup, strip) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.docx')) return parseDocx(await file.arrayBuffer(), defaultGroup, strip);
  if (/\.(txt|csv|md)$/.test(lower) || file.type.startsWith('text/')) return parseText(await file.text(), defaultGroup, strip);
  throw new Error('Подходят файлы .docx или .txt');
}

/** Word list: numbered paragraphs are guests, the plain paragraphs between them are group titles. */
async function parseDocx(buffer, defaultGroup, strip) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Это не похоже на документ Word');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paras = [...doc.getElementsByTagNameNS(W, 'p')]
    .map((p) => ({
      text: [...p.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join('').trim(),
      numbered: p.getElementsByTagNameNS(W, 'numPr').length > 0,
    }))
    .filter((p) => p.text);
  if (!paras.some((p) => p.numbered)) return parseText(paras.map((p) => p.text).join('\n'), defaultGroup, strip);
  const out = [];
  let group = defaultGroup;
  for (const p of paras) {
    if (p.numbered) {
      const e = cleanEntry(p.text, strip);
      if (e.name) out.push({ ...e, group });
    } else if (!/^(итог|всего|summe|gesamt)/i.test(p.text)) {
      group = cleanHeader(p.text) || defaultGroup;
    }
  }
  return out;
}
