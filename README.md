# Приглашения: personalised invitations

Pick guests, pick a template, get one finished invitation picture per guest, with the name
already placed nicely. The look is borrowed from the couple's wedding site.

Live: https://immortalbobik.github.io/invitations/

## Run it

```bash
npm start
```

Then open http://localhost:5173. No `npm install` is needed: the app has no dependencies.
Opening `index.html` by double-click does not work, because browsers block ES modules on `file://`.

It is a plain static site, so it can also be hosted anywhere (GitHub Pages, Vercel, Netlify).

## How it works

1. **Гости → + Добавить**: paste names (one per line), or load the Word list. In a `.docx` file,
   numbered paragraphs become guests and the plain lines between them become groups. Notes in
   brackets or after a dash ("(папа Пети) Олег", "Юля – именинница") are moved to a note and
   stay off the invitation.
2. Check **он / она / пара** next to each name. It picks "Дорогой / Дорогая / Дорогие". The app
   guesses it, and one click changes it. Select two guests and press **Объединить в пару** to
   make one invitation for a couple.
3. **Загрузить шаблон**: upload the invitation picture (PNG/JPG, Canva export).
   - Drag the dashed **имя** frame to where the name goes.
   - If the picture already has a sample name in it, tick **Закрасить** to paint over it.
   - Set the greeting for him / her / a couple, the font (or upload your own), size, colour
     (with an eyedropper), letter spacing and alignment.
   - Try short and long sample names at the bottom and watch the result live.
4. Tick guests, select a template, press **Создать**.
5. **Готовые**: download one, share one (on a phone), or download everything as a ZIP. Click a
   picture to fix one invitation by hand (text, size, position, one or two lines).

## Fitting names

For every guest the app tries font sizes from 100% down to the template's minimum, one or two
lines, and small sideways shifts. It keeps the option that touches nothing on the picture
(flowers, other text) and changes the design least. "Drawn" pixels are anything that clearly
differs from the paper colour around the name frame. Turn on **Показать, что программа считает
рисунком** in the template editor to see that map.

Each result gets a status:

| Status | Meaning |
| --- | --- |
| Отлично | Name sits in the frame exactly as designed |
| Подогнано | Made smaller, shifted or split into two lines, but clear of the picture |
| Проверьте | No clean spot found within the limits: look at it and fix it by hand |
| Вручную | Adjusted by hand |

## Where the data lives

Guests, templates, uploaded fonts and results are stored in **this browser's** IndexedDB.
Nothing is uploaded anywhere. A different browser or device starts empty, and clearing the
site data erases everything.

| Path | What |
| --- | --- |
| `index.html`, `styles.css` | Page, dialogs, styles |
| `js/app.js` | Guest list, catalogue, results, ZIP export |
| `js/editor.js` | Template editor (name frame, fonts, colours, fitting limits) |
| `js/fixer.js` | "Поправить" dialog for a single invitation |
| `js/render.js` | Background analysis, name fitting, drawing |
| `js/guests.js` | List parsing, Word import, он/она/пара guessing |
| `js/store.js` | IndexedDB storage |
| `serve.js` | Tiny local static server |
