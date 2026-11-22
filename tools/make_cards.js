// Makes the printable card deck: cards/quizzuh-cards.pdf
// 65 x 65 mm cards (designed at 80 mm and scaled), 12 per A4 page (3 x 4), double-sided (flip on the long edge): page 1 = fronts, page 2 = backs, ...
// Front: QR code (opens k.html?c=<n>) + card number. Back: year, song, artist, coloured by decade.
// Run: node tools/make_cards.js   (needs Playwright + Chromium; reads data/songs.js and vendor/qrcode.js)
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const BASE_URL = "https://simonlinden82.github.io/quizzuh/";
const CARD = 65, COLS = 3, ROWS = 4, PAGE_W = 210, PAGE_H = 297, DESIGN = 80;
const X0 = (PAGE_W - COLS * CARD) / 2, Y0 = (PAGE_H - ROWS * CARD) / 2;

global.window = {};
eval(fs.readFileSync(path.join(ROOT, "data/songs.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "vendor/qrcode.js"), "utf8") + ";global.qrcode = qrcode;");
const songs = window.SONGS.filter(s => s.year).sort((a, b) => a.n - b.n);

const DECADES = {   // decade -> [panel colour, year colour]
  1940: ["#1F6F7A", "#fff4ec"], 1950: ["#1F6F7A", "#fff4ec"], 1960: ["#2E8B57", "#fff4ec"], 1970: ["#E07A1F", "#fff4ec"],
  1980: ["#E8304A", "#fff4ec"], 1990: ["#7B3FE4", "#fff4ec"], 2000: ["#2563EB", "#fff4ec"], 2010: ["#C2337A", "#fff4ec"],
  2020: ["#1a0f1f", "#FFB84A"],
};
const deco = y => DECADES[Math.floor(y / 10) * 10] || DECADES[2020];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function qrSvg(text) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${d}" fill="#1a0f1f"/></svg>`;
}

const front = s => `<div class="card front">
  <div class="frame">
    <img class="brand" src="../../assets/logo-light.svg" alt="Quizzuh">
    <div class="qr">${qrSvg(BASE_URL + "k.html?c=" + s.n)}</div>
    <div class="num">Kort <b>${s.n}</b></div>
    <div class="tagline">Skanna · lyssna · gissa</div>
  </div></div>`;

const back = s => { const [bg, yc] = deco(s.year); return `<div class="card back">
  <div class="panel" style="background:${bg}">
    <div class="artist fit">${esc(s.artist)}</div>
    <div class="year" style="color:${yc}">${s.year}</div>
    <div class="title fit">${esc(s.title)}</div>
    <div class="small">${s.n}</div>
  </div></div>`; };

const RULES_TABLE = `<h3>Bara korten</h3><ol>
  <li>En telefon är DJ. Skanna första kortet och logga in på Spotify (en gång).</li>
  <li>Varje spelare får ett kort med årtalet uppåt: början på tidslinjen.</li>
  <li>Turvis: dra ett kort och skanna det. Låten spelas, svaret syns inte.</li>
  <li>Säg artist (2 p), låt (1 p) och gärna exakt år (1 p). Lägg kortet där du tror att det hör hemma.</li>
  <li>Vänd kortet. Rätt plats: behåll det. Fel: kortet åker ut.</li>
  <li>Vid slutet ger varje kort på tidslinjen 1 p. Flest poäng vinner.</li></ol>`;
const RULES_WEB = `<h3>Med webbsidan</h3><ol>
  <li>Öppna <b>simonlinden82.github.io/quizzuh</b> på dator eller iPad.</li>
  <li>Välj <b>Tryckta kort</b> och <b>Skapa spel</b>. Alla skannar QR-koden på skärmen med mobilen.</li>
  <li>Dra ett kort och skriv in numret på skärmen (eller skanna kortet med iPaden).</li>
  <li>Alla svarar och lägger kortet på sin egen tidslinje i mobilen.</li>
  <li>Skärmen visar svaret och räknar poängen.</li></ol>`;
const rulesFront = `<div class="card rules"><div class="frame"><img class="brand" src="../../assets/logo-light.svg" alt="Quizzuh">${RULES_TABLE}</div></div>`;
const rulesBack = `<div class="card rules"><div class="frame"><img class="brand" src="../../assets/logo-light.svg" alt="Quizzuh">${RULES_WEB}</div></div>`;

// Each slot: [frontHtml, backHtml]
const slots = songs.map(s => [front(s), back(s)]);
slots.push([rulesFront, rulesBack]);
const per = COLS * ROWS;
let pages = "";
for (let p = 0; p < slots.length; p += per) {
  const chunk = slots.slice(p, p + per);
  const place = (html, i, mirror) => {
    const c = i % COLS, r = Math.floor(i / COLS), cc = mirror ? COLS - 1 - c : c;
    return `<div class="slot" style="left:${X0 + cc * CARD}mm;top:${Y0 + r * CARD}mm"><div class="scale">${html}</div></div>`;
  };
  let marks = "";
  for (let c = 0; c <= COLS; c++) { const x = X0 + c * CARD;
    marks += `<div class="mark v" style="left:${x}mm;top:${Y0 - 8}mm"></div><div class="mark v" style="left:${x}mm;top:${Y0 + ROWS * CARD + 2}mm"></div>`; }
  for (let r = 0; r <= ROWS; r++) { const y = Y0 + r * CARD;
    marks += `<div class="mark h" style="top:${y}mm;left:${X0 - 4.5}mm"></div><div class="mark h" style="top:${y}mm;left:${X0 + COLS * CARD + 1}mm"></div>`; }
  const pageNo = p / per + 1;
  pages += `<section class="page">${marks}${chunk.map((s, i) => place(s[0], i, false)).join("")}
    <div class="foot">Quizzuh · ark ${pageNo} framsida · skriv ut dubbelsidigt, vänd på långsidan, 100 % (verklig storlek)</div></section>`;
  pages += `<section class="page">${chunk.map((s, i) => place(s[1], i, true)).join("")}</section>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; font-weight: 400; src: url(fonts/inter-latin-400-normal.woff2); }
@font-face { font-family: Inter; font-weight: 700; src: url(fonts/inter-latin-700-normal.woff2); }
@font-face { font-family: Inter; font-weight: 900; src: url(fonts/inter-latin-900-normal.woff2); }
@font-face { font-family: Archivo; font-weight: 400; src: url(fonts/archivo-black-latin-400-normal.woff2); }
@page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Inter, sans-serif; color: #1a0f1f; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { position: relative; width: ${PAGE_W}mm; height: ${PAGE_H}mm; page-break-after: always; overflow: hidden; }
.slot { position: absolute; width: ${CARD}mm; height: ${CARD}mm; overflow: hidden; }
.scale { width: ${DESIGN}mm; height: ${DESIGN}mm; transform: scale(${CARD / DESIGN}); transform-origin: 0 0; }
.mark { position: absolute; background: #000; }
.mark.v { width: .2mm; height: 6mm; margin-left: -.1mm; }
.mark.h { height: .2mm; width: 3.5mm; margin-top: -.1mm; }
.foot { position: absolute; bottom: 8mm; width: 100%; text-align: center; font-size: 2.6mm; color: #888; }
.card { width: 100%; height: 100%; padding: 3.5mm; }
.frame { width: 100%; height: 100%; border: .5mm solid #e7d6dd; border-radius: 5mm; display: flex; flex-direction: column; align-items: center; padding: 3.5mm; }
.brand { height: 7.5mm; width: auto; display: block; }
.qr { width: 34mm; height: 34mm; margin: auto 0 3mm; }
.qr svg { width: 100%; height: 100%; display: block; }
.num { font-size: 4.6mm; font-weight: 700; color: #1a0f1f; }
.num b { font-weight: 900; color: #E8304A; }
.tagline { margin-top: auto; font-size: 2.6mm; color: #9a8592; letter-spacing: .3mm; text-transform: uppercase; }
.panel { width: 100%; height: 100%; border-radius: 5mm; color: #fff4ec; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 5mm 4.5mm; position: relative; }
.artist { font-weight: 700; font-size: 4.6mm; line-height: 1.15; max-height: 15mm; overflow: hidden; }
.year { font-family: Archivo; font-size: 21mm; line-height: 1; margin: 2.5mm 0; letter-spacing: -.5mm; }
.title { font-weight: 900; font-size: 5.2mm; line-height: 1.12; max-height: 17mm; overflow: hidden; font-style: italic; padding: 0 1.2mm; }
.small { position: absolute; bottom: 2.6mm; right: 3.5mm; font-size: 2.2mm; opacity: .7; }
.rules .frame { align-items: stretch; padding: 3.5mm 4mm; }
.rules .brand { height: 5.5mm; margin: 0 auto; }
.rules h3 { font-size: 3.8mm; font-weight: 900; color: #E8304A; margin: 1.5mm 0 1mm; text-align: center; }
.rules ol { font-size: 2.95mm; line-height: 1.2; padding-left: 4mm; }
.rules li { margin-bottom: .6mm; }
</style></head><body>${pages}
<script>
// Shrink any text that doesn't fit its box.
document.fonts.ready.then(() => {
  document.querySelectorAll(".fit").forEach(el => {
    let fs = parseFloat(getComputedStyle(el).fontSize);
    while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && fs > 6) { fs -= 0.5; el.style.fontSize = fs + "px"; }
  });
  Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => i.onload = i.onerror = r))).then(() => document.body.dataset.ready = "1");
});
</script></body></html>`;

(async () => {
  const tmp = path.join(__dirname, "cards", "_deck.html");
  fs.writeFileSync(tmp, html);
  const br = await chromium.launch();
  const pg = await br.newPage();
  await pg.goto("file://" + tmp);
  await pg.waitForSelector("body[data-ready='1']");
  fs.mkdirSync(path.join(ROOT, "cards"), { recursive: true });
  const out = path.join(ROOT, "cards", "quizzuh-cards.pdf");
  await pg.pdf({ path: out, width: PAGE_W + "mm", height: PAGE_H + "mm", printBackground: true, preferCSSPageSize: true });
  // Warn about text that still doesn't fit after shrinking.
  const tight = await pg.$$eval(".fit", els => els.filter(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
  if (tight.length) console.log("TEXT TOO LONG:", tight);
  if (process.argv[2]) {   // optional: PNG previews; pages listed after the folder (1-based), default 1 2
    await pg.setViewportSize({ width: 794, height: 1123 });
    const secs = await pg.$$("section.page");
    const want = process.argv.slice(3).map(Number);
    for (const i of want.length ? want : [1, 2]) await secs[i - 1].screenshot({ path: path.join(process.argv[2], `cards-page${i}.png`) });
  }
  await br.close();
  fs.unlinkSync(tmp);
  console.log("wrote", out, songs.length, "song cards +1 rules card,", Math.ceil(slots.length / per) * 2, "pages");
})();
