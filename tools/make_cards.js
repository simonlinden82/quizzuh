// Makes the printable card deck: cards/quizzuh-cards.pdf
// Mini European cards, 44 x 68 mm, 16 per A4 page (4 x 4), double-sided (flip on the long edge): page 1 = fronts, page 2 = backs, ...
// Front: QR code (opens k.html?c=<n>) + card number. Back: year, song, artist, coloured by decade. Two rules cards at the end.
// Run: node tools/make_cards.js [previewDir] [pages...]   (needs Playwright + Chromium; reads data/songs.js and vendor/qrcode.js)
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const BASE_URL = "https://simonlinden82.github.io/quizzuh/";
const CW = 44, CH = 68, COLS = 4, ROWS = 4, PAGE_W = 210, PAGE_H = 297;
const X0 = (PAGE_W - COLS * CW) / 2, Y0 = (PAGE_H - ROWS * CH) / 2;

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
const LOGO = `<img class="brand" src="../../assets/logo-light.svg" alt="Quizzuh">`;

function qrSvg(text) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${d}" fill="#1a0f1f"/></svg>`;
}

const front = s => `<div class="card front"><div class="frame">
    ${LOGO}
    <div class="qr">${qrSvg(BASE_URL + "k.html?c=" + s.n)}</div>
    <div class="num">Kort <b>${s.n}</b></div>
    <div class="tagline">Skanna · lyssna · gissa</div>
  </div></div>`;

const back = s => { const [bg, yc] = deco(s.year); return `<div class="card back">
  <div class="panel" style="background:${bg}">
    <div class="artist fit">${esc(s.artist)}</div>
    <div class="year fit" style="color:${yc}">${s.year}</div>
    <div class="title fit">${esc(s.title)}</div>
    <div class="small">${s.n}</div>
  </div></div>`; };

// Rules: two cards, each side has three steps.
const RULES = [
  ["Bara korten", 1, ["En telefon är DJ. Skanna ett kort och logga in på Spotify första gången.",
    "Alla får ett kort med årtalet uppåt: början på tidslinjen.",
    "Turvis: dra ett kort och skanna det. Låten spelas, svaret syns inte."], "Vänd kortet"],
  ["Bara korten", 4, ["Säg artist (2 p), låt (1 p) och gärna exakt år (1 p).",
    "Lägg kortet på din tidslinje och vänd det. Rätt plats: behåll det. Fel: kortet åker ut.",
    "Vid slutet ger varje kort på tidslinjen 1 p. Flest poäng vinner."], ""],
  ["Med webbsidan", 1, ["Öppna <b>simonlinden82.<wbr>github.io/<wbr>quizzuh</b> på dator eller iPad.",
    "Välj <b>Tryckta kort</b> och <b>Skapa spel</b>.",
    "Alla skannar QR-koden på skärmen med mobilen."], "Vänd kortet"],
  ["Med webbsidan", 4, ["Dra ett kort och skriv in numret på skärmen (eller skanna kortet med iPaden).",
    "Alla svarar och lägger kortet på sin tidslinje i mobilen.",
    "Skärmen visar svaret och räknar poängen."], ""],
];
const rules = ([h, start, items, more]) => `<div class="card rules"><div class="frame">${LOGO}<h3>${h}</h3>
  <ol start="${start}">${items.map(i => `<li>${i}</li>`).join("")}</ol>${more ? `<div class="more">${more} ›</div>` : ""}</div></div>`;

// Each slot: [frontHtml, backHtml]
const slots = songs.map(s => [front(s), back(s)]);
slots.push([rules(RULES[0]), rules(RULES[1])], [rules(RULES[2]), rules(RULES[3])]);
const per = COLS * ROWS;
let pages = "";
for (let p = 0; p < slots.length; p += per) {
  const chunk = slots.slice(p, p + per);
  const place = (html, i, mirror) => {
    const c = i % COLS, r = Math.floor(i / COLS), cc = mirror ? COLS - 1 - c : c;
    return `<div class="slot" style="left:${X0 + cc * CW}mm;top:${Y0 + r * CH}mm">${html}</div>`;
  };
  let marks = "";
  for (let c = 0; c <= COLS; c++) { const x = X0 + c * CW;
    marks += `<div class="mark v" style="left:${x}mm;top:${Y0 - 7}mm"></div><div class="mark v" style="left:${x}mm;top:${Y0 + ROWS * CH + 2}mm"></div>`; }
  for (let r = 0; r <= ROWS; r++) { const y = Y0 + r * CH;
    marks += `<div class="mark h" style="top:${y}mm;left:${X0 - 8}mm"></div><div class="mark h" style="top:${y}mm;left:${X0 + COLS * CW + 2}mm"></div>`; }
  const pageNo = p / per + 1;
  pages += `<section class="page">${marks}${chunk.map((s, i) => place(s[0], i, false)).join("")}
</section>`;
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
.slot { position: absolute; width: ${CW}mm; height: ${CH}mm; overflow: hidden; }
.mark { position: absolute; background: #000; }
.mark.v { width: .2mm; height: 5mm; margin-left: -.1mm; }
.mark.h { height: .2mm; width: 6mm; margin-top: -.1mm; }
.foot { position: absolute; bottom: 5mm; width: 100%; text-align: center; font-size: 2.4mm; color: #888; }
.card { width: 100%; height: 100%; padding: 2.5mm; }
.frame { width: 100%; height: 100%; border: .4mm solid #e7d6dd; border-radius: 3.5mm; display: flex; flex-direction: column; align-items: center; padding: 3mm 2.5mm; }
.brand { height: 5.2mm; width: auto; display: block; }
.front .frame { padding-bottom: 2.2mm; }
.front .brand { margin-top: 2mm; }
.qr { width: 27mm; height: 27mm; margin: auto 0 2.2mm; }
.qr svg { width: 100%; height: 100%; display: block; }
.num { font-size: 3.9mm; font-weight: 700; color: #1a0f1f; }
.num b { font-weight: 900; color: #E8304A; }
.tagline { margin-top: auto; font-size: 1.8mm; color: #9a8592; letter-spacing: .15mm; text-transform: uppercase; white-space: nowrap; }
.panel { width: 100%; height: 100%; border-radius: 3.5mm; color: #fff4ec; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4mm 2.8mm; position: relative; }
.artist { font-weight: 700; font-size: 3.5mm; line-height: 1.15; max-height: 13mm; overflow: hidden; width: 100%; }
.year { font-family: Archivo; font-size: 11.5mm; line-height: 1.05; margin: 3mm 0; letter-spacing: -.3mm; white-space: nowrap; width: 100%; overflow: hidden; }
.title { font-weight: 900; font-size: 4mm; line-height: 1.12; max-height: 18mm; overflow: hidden; font-style: italic; padding: 0 1mm; width: 100%; }
.small { position: absolute; bottom: 2mm; right: 2.6mm; font-size: 1.8mm; opacity: .7; }
.rules .frame { align-items: stretch; padding: 3mm 2.8mm; }
.rules .brand { height: 4.4mm; margin: 0 auto; }
.rules h3 { font-size: 3.2mm; font-weight: 900; color: #E8304A; margin: 2mm 0 1.5mm; text-align: center; }
.rules ol { font-size: 2.7mm; line-height: 1.22; padding-left: 3.8mm; }
.rules li { margin-bottom: 1.3mm; }
.rules .more { margin-top: auto; text-align: right; font-size: 2.2mm; font-weight: 700; color: #9a8592; }
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
  console.log("wrote", out, songs.length, "song cards + 2 rules cards,", Math.ceil(slots.length / per) * 2, "pages");
})();
