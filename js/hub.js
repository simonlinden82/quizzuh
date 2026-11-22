// The hub: makes the game, shows the QR code, plays the songs, scores the answers.
// The hub holds the whole game; phones only send answers and draw what the hub tells them.
const SAVE = "quizzuh-game";
const $app = document.getElementById("app");
let G = null;          // the game
let peer = null;
const conns = {};      // player id -> connection
let tick = null;
let ui = { songs: QUIZ.songsPerGame, secs: QUIZ.secondsPerSong, device: localStorage.getItem("quizzuh-device") || "", devices: [], msg: "",
           mode: localStorage.getItem("quizzuh-mode") || "random", pad: "" };

const usable = () => SONGS.filter(s => s.year);
const yearsAvailable = () => new Set(usable().map(s => s.year)).size;

// ---------- game ----------
function pickSongs(n) {
  const byYear = {};
  usable().forEach(s => (byYear[s.year] = byYear[s.year] || []).push(s));
  return shuffle(Object.keys(byYear)).slice(0, n).map(y => {
    const list = byYear[y];
    return list[Math.floor(Math.random() * list.length)];
  });
}

function newCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join("");
}

function newGame() {
  const cards = ui.mode === "cards";
  const n = Math.max(2, Math.min(Number(ui.songs) || 20, cards ? usable().length : yearsAvailable()));
  G = { code: newCode(), mode: cards ? "cards" : "random", phase: "lobby", songs: cards ? [] : pickSongs(n), rounds: n,
        round: -1, secs: Number(ui.secs) || 45, players: {}, order: [], startedAt: Date.now() };
  save(); connect(); render();
}

function save() { if (G) localStorage.setItem(SAVE, JSON.stringify(G)); }
const song = () => G.songs[G.round];
const playerList = () => G.order.map(id => G.players[id]);
const total = p => p.pts + p.cards.length * QUIZ.points.card;

// Printed-card mode: wait for the next card (typed on the pad, or scanned on this device).
function nextCard() {
  if (G.round + 1 >= G.rounds) return endGame();
  G.phase = "draw"; ui.pad = ""; ui.msg = "";
  save(); broadcast(); render();
}

function useCard(n) {
  if (!G || G.phase !== "draw") return;
  const s = cardSong(n);
  if (!s) { ui.msg = "Kort " + n + " finns inte."; ui.pad = ""; render(); return; }
  if (G.songs.some(x => x.n === s.n)) { ui.msg = "Kort " + n + " har redan spelats. Dra ett nytt kort."; ui.pad = ""; render(); return; }
  G.songs.push(s);
  startRound();
}

function checkScan() {
  const sc = JSON.parse(localStorage.getItem("quizzuh-scan") || "null");
  if (!sc || Date.now() - sc.at > 10 * 60e3) return;
  localStorage.removeItem("quizzuh-scan");
  if (G && G.phase === "draw") useCard(sc.n);
}

function startRound() {
  if (G.mode === "cards" && G.songs.length < G.round + 2) return nextCard();
  G.round++;
  if (G.round >= G.songs.length) return endGame();
  G.phase = "song";
  G.deadline = Date.now() + G.secs * 1000;
  playerList().forEach(p => { p.answer = null; p.last = null; });
  save(); playSong(); broadcast(); render();
}

function answer(id, a) {
  const p = G.players[id];
  if (!p || G.phase !== "song" || p.answer) return;
  p.answer = { artist: String(a.artist || "").slice(0, 80), title: String(a.title || "").slice(0, 80),
               year: String(a.year || "").slice(0, 4), slot: Number.isInteger(a.slot) ? a.slot : null };
  save(); broadcast(); render();
  if (playerList().every(q => q.answer || !q.online)) reveal();
}

function reveal() {
  if (G.phase !== "song") return;
  const s = song(), P = QUIZ.points, need = QUIZ.match;
  playerList().forEach(p => {
    const a = p.answer || { artist: "", title: "", year: "", slot: null };
    const r = { artist: artistOk(a.artist, s, need), title: titleOk(a.title, s, need), year: Number(a.year) === s.year,
                answered: !!p.answer, guess: a };
    r.points = (r.artist ? P.artist : 0) + (r.title ? P.title : 0) + (r.year ? P.year : 0);
    const first = p.cards.length === 0;
    r.first = first;
    r.placed = first ? true : (a.slot !== null && placementOk(p.cards, a.slot, s.year));
    if (r.placed) p.cards = [...p.cards, { n: s.n, year: s.year, artist: s.artist, title: songLabel(s) }].sort((x, y) => x.year - y.year);
    p.pts += r.points;
    p.last = r;
  });
  G.phase = "reveal";
  save(); broadcast(); render();
}

function endGame() {
  G.phase = "end";
  Spotify.loggedIn() && Spotify.pause(ui.device);
  save(); broadcast(); render();
}

function standings() {
  return playerList().slice().sort((a, b) => total(b) - total(a) || b.cards.length - a.cards.length);
}

// ---------- connections ----------
function connect() {
  if (peer) { peer.destroy(); peer = null; }
  peer = new Peer(PEER_PREFIX + G.code.toLowerCase(), peerOptions());
  peer.on("open", () => { ui.msg = ""; render(); });
  peer.on("connection", c => {
    c.on("data", m => onMessage(c, m));
    c.on("close", () => {
      for (const id in conns) if (conns[id] === c) { delete conns[id]; if (G.players[id]) G.players[id].online = false; }
      render();
    });
  });
  peer.on("error", e => {
    if (e.type === "unavailable-id") { ui.msg = "Återansluter…"; render(); setTimeout(connect, 4000); return; }
    if (e.type === "peer-unavailable") return;
    ui.msg = "Anslutningsproblem: " + e.type; render();
  });
  peer.on("disconnected", () => setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 2000));
}

function onMessage(c, m) {
  if (!m || !m.id) return;
  if (m.t === "join") {
    let p = G.players[m.id];
    if (!p) {
      if (G.phase !== "lobby") { c.send({ t: "state", view: { phase: "closed" } }); return; }
      const name = String(m.name || "").trim().slice(0, 20) || "Spelare";
      p = G.players[m.id] = { id: m.id, name, pts: 0, cards: [], answer: null, last: null };
      G.order.push(m.id);
    }
    p.online = true;
    conns[m.id] = c;
    save(); send(m.id); render();
  } else if (m.t === "answer") {
    answer(m.id, m);
  }
}

function viewFor(id) {
  const p = G.players[id];
  const v = { phase: G.phase, round: G.round + 1, total: G.rounds || G.songs.length, name: p.name, cards: p.cards,
              answered: !!p.answer, first: p.cards.length === 0, pts: p.pts, points: QUIZ.points };
  if (G.phase === "song") v.remaining = Math.max(0, G.deadline - Date.now());
  if (G.phase === "reveal") { const s = song(); v.song = { artist: s.artist, title: songLabel(s), year: s.year, star: s.star }; v.mine = p.last; }
  if (G.phase === "end") v.standings = standings().map(q => ({ name: q.name, total: total(q), cards: q.cards.length, me: q.id === id }));
  return v;
}
function send(id) { const c = conns[id]; if (c && c.open) c.send({ t: "state", view: viewFor(id) }); }
function broadcast() { Object.keys(conns).forEach(send); }

// ---------- music ----------
async function playSong() {
  if (!Spotify.loggedIn()) return;
  try { await Spotify.play(song().spotify_id, ui.device || undefined); ui.msg = ""; }
  catch (e) { ui.msg = "Spotify: " + e.message + ". Öppna Spotify-appen och välj enhet."; }
  render();
}
async function loadDevices() {
  try { ui.devices = await Spotify.devices(); if (!ui.device && ui.devices[0]) ui.device = ui.devices[0].id; }
  catch (e) { ui.msg = "Spotify: " + e.message; }
  render();
}

// ---------- drawing ----------
function joinUrl() {
  const u = new URL("play.html", location.href);
  return u.href.split("?")[0] + "?r=" + G.code + peerParam();
}
function qrSvg(text) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}
function timeLeft() { return Math.max(0, Math.ceil((G.deadline - Date.now()) / 1000)); }

function musicBox() {
  if (!Spotify.configured()) return `<div class="note">Testläge: ingen musik (Spotify är inte inställt än).</div>`;
  if (!Spotify.loggedIn()) return `<button class="ghost" data-act="spotify">Logga in på Spotify</button>`;
  const opts = ui.devices.map(d => `<option value="${esc(d.id)}" ${d.id === ui.device ? "selected" : ""}>${esc(d.name)}</option>`).join("");
  return `<div class="row">Spela på: <select data-act="device">${opts || "<option>Ingen enhet hittad</option>"}</select>
          <button class="ghost small" data-act="devices">Uppdatera</button></div>
          <div class="hint">Öppna Spotify-appen på den enhet som ska spela musiken.</div>`;
}

function render() {
  const msg = ui.msg ? `<div class="msg">${esc(ui.msg)}</div>` : "";
  if (!G) {
    const saved = JSON.parse(localStorage.getItem(SAVE) || "null");
    const resume = saved && saved.phase !== "end" && Date.now() - saved.startedAt < 12 * 3600e3;
    $app.innerHTML = `
      <div class="hub-start">
        <h1 class="logo-img"><img src="assets/logo-dark.svg" alt="Quizzuh"></h1>
        <p class="tag">Gissa låten. Bygg din tidslinje.</p>
        <div class="panel">
          <div class="modes"><button class="${ui.mode === "random" ? "on" : ""}" data-act="mode" data-mode="random">Slumpade låtar</button>
            <button class="${ui.mode === "cards" ? "on" : ""}" data-act="mode" data-mode="cards">Tryckta kort</button></div>
          <div class="hint">${ui.mode === "cards" ? "Dra ett kort i taget ur leken och skriv in kortets nummer (eller skanna det med den här enheten)." : "Spelet slumpar låtar ur listan, aldrig två från samma år."}</div>
          <label>Antal ${ui.mode === "cards" ? "kort" : "låtar"} <input type="number" min="2" max="${ui.mode === "cards" ? usable().length : yearsAvailable()}" value="${esc(ui.songs)}" data-set="songs"></label>
          <label>Sekunder per låt <input type="number" min="10" max="180" value="${esc(ui.secs)}" data-set="secs"></label>
          <div class="hint">${usable().length} låtar från ${yearsAvailable()} olika år.</div>
          ${musicBox()}
          <button class="big" data-act="new">Skapa spel</button>
          ${resume ? `<button class="ghost" data-act="resume">Fortsätt spelet (${esc(saved.code)})</button>` : ""}
        </div>${msg}
      </div>`;
    return;
  }
  const players = playerList();
  const chips = players.map(p => `<span class="chip ${p.online ? "" : "off"} ${G.phase === "song" && p.answer ? "done" : ""}">${esc(p.name)}</span>`).join("") || `<span class="hint">Inga spelare än…</span>`;

  if (G.phase === "lobby") {
    $app.innerHTML = `
      <div class="hub-lobby">
        <div class="qr">${qrSvg(joinUrl())}</div>
        <div class="side">
          <h1 class="logo-img"><img src="assets/logo-dark.svg" alt="Quizzuh"></h1>
          <p class="big-text">Skanna koden med mobilen för att vara med!</p>
          <p class="code">Kod: <b>${esc(G.code)}</b></p>
          <div class="chips">${chips}</div>
          <p class="hint">${G.rounds} ${G.mode === "cards" ? "kort" : "låtar"} · ${G.secs} sekunder per låt</p>
          ${musicBox()}
          <button class="big" data-act="start" ${players.length ? "" : "disabled"}>Starta</button>
          <button class="ghost small" data-act="quit">Avbryt spelet</button>
        </div>
      </div>${msg}`;
  } else if (G.phase === "draw") {
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-act="key" data-k="${k}">${k}</button>`).join("");
    $app.innerHTML = `
      <div class="hub-song">
        <p class="round">Kort ${G.round + 2} av ${G.rounds}</p>
        <p class="big-text">Dra ett kort och skriv kortets nummer</p>
        <div class="padnum">${esc(ui.pad) || "&nbsp;"}</div>
        <div class="pad">${keys}<button data-act="key" data-k="del">⌫</button><button data-act="key" data-k="0">0</button><button class="go" data-act="key" data-k="ok">✓</button></div>
        <p class="hint">Eller skanna kortet med kameran på den här enheten. Kortet hamnar då här automatiskt.</p>
        <div class="chips">${chips}</div>
        <button class="ghost small" data-act="finish">Avsluta spelet och visa resultatet</button>
      </div>${msg}`;
  } else if (G.phase === "song") {
    const left = timeLeft();
    const done = players.filter(p => p.answer).length;
    $app.innerHTML = `
      <div class="hub-song">
        <p class="round">Låt ${G.round + 1} av ${G.rounds}</p>
        <div class="eq"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="timer"><div style="width:${(left / G.secs) * 100}%"></div></div>
        <p class="big-text">${left} s</p>
        <p class="hint">${done} av ${players.length} har svarat</p>
        <div class="chips">${chips}</div>
        <div class="row center"><button class="ghost" data-act="replay">Spela igen</button><button class="ghost" data-act="reveal">Visa svaret nu</button></div>
      </div>${msg}`;
  } else if (G.phase === "reveal") {
    const s = song(), P = QUIZ.points;
    const mark = ok => ok ? `<span class="ok">✓</span>` : `<span class="no">✗</span>`;
    const rows = players.map(p => {
      const r = p.last || {};
      return `<tr><td>${esc(p.name)}</td><td>${mark(r.artist)}</td><td>${mark(r.title)}</td><td>${mark(r.year)}</td>
        <td>${r.first ? "–" : mark(r.placed)}</td><td>+${r.points || 0}</td><td><b>${total(p)}</b></td></tr>`;
    }).join("");
    $app.innerHTML = `
      <div class="hub-reveal">
        <p class="round">Låt ${G.round + 1} av ${G.rounds}</p>
        <div class="card-big"><div class="year">${s.year}</div><div class="title">${esc(songLabel(s))}</div><div class="artist">${esc(s.artist)}</div></div>
        ${s.star ? `<p class="hint">* Den här inspelningen kanske inte är originalet.</p>` : ""}
        <table><tr><th></th><th>Artist (${P.artist})</th><th>Låt (${P.title})</th><th>År (${P.year})</th><th>Placering</th><th>Poäng</th><th>Totalt</th></tr>${rows}</table>
        <p class="hint">Totalt = poäng + ${P.card} per kort på tidslinjen.</p>
        <button class="big" data-act="next">${G.round + 1 < G.rounds ? (G.mode === "cards" ? "Nästa kort" : "Nästa låt") : "Se resultatet"}</button>
      </div>${msg}`;
  } else if (G.phase === "end") {
    const list = standings().map((p, i) => `<li><span class="place">${i + 1}</span> ${esc(p.name)} <b>${total(p)}</b>
      <span class="hint">${p.pts} poäng + ${p.cards.length} kort</span></li>`).join("");
    $app.innerHTML = `
      <div class="hub-end">
        <h1 class="logo">Resultat</h1>
        <ol class="standings">${list}</ol>
        <button class="big" data-act="again">Nytt spel</button>
      </div>`;
  }
}

// ---------- buttons ----------
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "new") newGame();
  else if (a === "resume") { G = JSON.parse(localStorage.getItem(SAVE)); G.rounds = G.rounds || G.songs.length; playerList().forEach(p => p.online = false); connect(); render(); }
  else if (a === "start") startRound();
  else if (a === "reveal") reveal();
  else if (a === "replay") playSong();
  else if (a === "next") startRound();
  else if (a === "again" || a === "quit") { if (a === "quit" && !confirm("Avbryta spelet?")) return; localStorage.removeItem(SAVE); if (peer) peer.destroy(); peer = null; G = null; render(); }
  else if (a === "spotify") Spotify.login();
  else if (a === "mode") { ui.mode = b.dataset.mode; localStorage.setItem("quizzuh-mode", ui.mode); render(); }
  else if (a === "key") padKey(b.dataset.k);
  else if (a === "finish") { if (confirm("Avsluta spelet och visa resultatet?")) endGame(); }
  else if (a === "devices") loadDevices();
});
function padKey(k) {
  if (k === "del") ui.pad = ui.pad.slice(0, -1);
  else if (k === "ok") { if (ui.pad) useCard(Number(ui.pad)); return; }
  else if (ui.pad.length < 3) ui.pad += k;
  render();
}
document.addEventListener("keydown", e => {
  if (!G || G.phase !== "draw" || e.target.tagName === "INPUT") return;
  if (/^[0-9]$/.test(e.key)) padKey(e.key);
  else if (e.key === "Backspace") padKey("del");
  else if (e.key === "Enter") padKey("ok");
});
// A card scanned with this device's camera (k.html in another tab) lands here.
window.addEventListener("storage", e => { if (e.key === "quizzuh-scan" && e.newValue) checkScan(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkScan(); });
window.addEventListener("focus", checkScan);

document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.set) ui[t.dataset.set] = t.value;
  if (t.dataset.act === "device") { ui.device = t.value; localStorage.setItem("quizzuh-device", t.value); }
});

// The clock: ends the round when time is up, and keeps the timer bar moving.
setInterval(() => {
  if (G && G.phase === "song") {
    if (Date.now() >= G.deadline) reveal();
    else {
      const bar = document.querySelector(".timer div"), txt = document.querySelector(".hub-song .big-text");
      if (bar) bar.style.width = (timeLeft() / G.secs) * 100 + "%";
      if (txt) txt.textContent = timeLeft() + " s";
    }
  }
}, 250);

(async () => {
  if (await Spotify.init()) return;
  render();
  if (Spotify.loggedIn()) loadDevices();
})();
