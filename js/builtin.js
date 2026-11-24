// Ready-made templates rebuilt from the couple's invitation design: the floral
// background is the original picture with all text removed; the text is drawn
// by the app so it stays crisp and can be edited in the template editor.
export const BUILTIN_VERSION = 1;

const BG = 'url:templates/floral.jpg';
const OLIVE = '#7d8150';
const MAUVE = '#b08a78';
const INK = '#4a4a47';
const BAR = '#b3b394';

const GREET_RU = { m: 'Дорогой {имя}', f: 'Дорогая {имя}', pl: 'Дорогие {имя}' };
const GREET_DE = { m: 'Lieber {имя}', f: 'Liebe {имя}', pl: 'Liebe {имя}' };

const ADDRESS = 'Havelländer Ring 40, 12629 Berlin\n– Bezirk Marzahn-Hellersdorf';

function layers({ head, small, big, details, sign }) {
  return [
    { id: 'head', type: 'text', label: 'Заголовок', text: head, family: 'Cormorant Garamond', weight: 500, size: 0.081, spacing: 0.12, color: OLIVE, x: 0.155, y: 0.4585, align: 'left', maxWidth: 0.68 },
    { id: 'small', type: 'text', label: 'Вторая строка, курсив слева', text: small, family: 'Marck Script', weight: 400, size: 0.05, color: MAUVE, x: 0.155, y: 0.510, align: 'left' },
    { id: 'big', type: 'text', label: 'Вторая строка, крупно справа', text: big, family: 'Cormorant Garamond', weight: 500, size: 0.081, spacing: 0.15, color: OLIVE, x: 0.806, y: 0.524, align: 'right', maxWidth: 0.5 },
    { id: 'bar', type: 'rect', x: 0.179, y: 0.611, w: 0.005, h: 0.171, color: BAR },
    { id: 'details', type: 'text', label: 'Дата и адрес', text: details, family: 'Montserrat', weight: 400, size: 0.030, color: INK, x: 0.243, y: 0.6265, align: 'left', lineHeight: 1.2, maxWidth: 0.62 },
    { id: 'sign', type: 'text', label: 'Подпись', text: sign, family: 'Marck Script', weight: 400, size: 0.0375, color: MAUVE, x: 0.226, y: 0.761, align: 'left', lineHeight: 1.15, maxWidth: 0.5 },
  ];
}

function template(id, title, audience, greet, sample, text) {
  return {
    id,
    builtin: true,
    title,
    audience,
    imageKey: BG,
    box: { x: 0.224, y: 0.338, w: 0.59, h: 0.054 },
    align: 'left',
    greet: { ...greet },
    font: { family: 'Roboto', weight: 500, size: 0.0355, color: '#454542', spacing: 0.07, upper: true, italic: false },
    erase: { on: false, color: null },
    fit: { minScale: 0.6, maxShift: 0.06, sens: 5 },
    sample,
    layers: layers(text),
  };
}

const RU = { head: 'ПРИГЛАШАЕМ', small: 'на нашу', big: 'СВАДЬБУ', sign: 'В ожидании предстоящей\nрадостной встречи\nДенис и Александра' };
const DE = { head: 'EINLADUNG', small: 'zur', big: 'HOCHZEIT', sign: 'In Vorfreude auf das\nbaldige Wiedersehen\nDennis und Aleksandra' };

export const BUILTIN = [
  template('ru-vy', 'Русский · Вы', 'один гость, на «Вы»', GREET_RU, { name: 'Мария', gender: 'f' },
    { ...RU, details: `Ждем Вас 1.05.2027\nв 12:00 по адресу:\n${ADDRESS}` }),
  template('ru-vas', 'Русский · вас', 'пары и семьи', GREET_RU, { name: 'Анна и Сергей', gender: 'pl' },
    { ...RU, details: `Ждем вас 1.05.2027\nв 12:00 по адресу:\n${ADDRESS}` }),
  template('de-sie', 'Deutsch · Sie', 'на «Sie», один гость или пара', GREET_DE, { name: 'Sabine', gender: 'f' },
    { ...DE, details: `Wir erwarten Sie am 1. Mai 2027\num 12:00 Uhr an folgender Adresse:\n${ADDRESS}` }),
  template('de-du', 'Deutsch · du', 'на «du», один гость', GREET_DE, { name: 'Thomas', gender: 'm' },
    { ...DE, details: `Wir erwarten dich am 1. Mai 2027\num 12:00 Uhr an folgender Adresse:\n${ADDRESS}` }),
  template('de-ihr', 'Deutsch · ihr', 'на «ihr», пары и семьи', GREET_DE, { name: 'Thomas und Petra', gender: 'pl' },
    { ...DE, details: `Wir erwarten euch am 1. Mai 2027\num 12:00 Uhr an folgender Adresse:\n${ADDRESS}` }),
];
