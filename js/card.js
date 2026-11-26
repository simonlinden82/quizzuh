// The card page (k.html). A printed card's QR opens k.html?c=<card number>; k.html with no number is the start
// screen (what the home-screen icon opens).
// - If this device is running a Quizzuh game that is waiting for a card, the card goes to that game.
// - Otherwise it plays the song on Spotify with the answer hidden (playing with only the cards on the table).
// The next card is scanned with the camera inside the page ("Skanna QR") or typed ("Skriv nummer"), so the page
// stays open between cards and Spotify stays connected.
const $app = document.getElementById("app");
let num = Number(new URLSearchParams(location.search).get("c")) || 0;
let song = num ? cardSong(num) : null;
let st = { msg: "", playing: false, show: false, devices: [], device: Spotify.savedDevice(), busy: false,
           pad: null, asleep: false, sent: false };

function hubWaiting() {
  const g = JSON.parse(localStorage.getItem("quizzuh-game") || "null");
  return g && g.mode === "cards" && g.phase === "draw" && Date.now() - (g.startedAt || 0) < 12 * 3600e3;
}

// Switch to another card without leaving the page.
function loadCard(n) {
  const s = cardSong(n);
  if (!s) { st.msg = "Kort " + n + " finns inte."; st.pad = null; render(); return; }
  num = n; song = s;
  history.replaceState(null, "", location.pathname + "?c=" + n);
  st.pad = null; st.show = false; st.playing = false; st.paused = false; st.msg = ""; st.asleep = false;
  if (hubWaiting()) { handToHub(); return; }
  render();
  if (Spotify.loggedIn()) play();
}

function handToHub() {
  localStorage.setItem("quizzuh-scan", JSON.stringify({ n: num, at: Date.now() }));
  st.sent = true; render();
}

async function play() {
  if (!song) return;
  st.busy = true; st.msg = ""; st.detail = ""; st.asleep = false; st.paused = false; render();
  try {
    st.device = await Spotify.play(song.spotify_id, st.device || undefined);
    st.playing = true;
  } catch (e) { st.msg = e.message; st.asleep = !!e.noDevice; st.detail = e.detail || (e.status ? "svar:" + e.status : ""); }
  st.busy = false; render();
}

// "Pausa" never really pauses (the phone's Spotify would fall asleep): it skips to the silence queued after the song.
// Then it checks that Spotify is still playing, starts the silence again if not, and says what it found.
const wait = ms => new Promise(r => setTimeout(r, ms));
async function pause() {
  st.playing = false; st.paused = true; st.pauseNote = "Pausar…"; render();
  const dev = st.device || undefined;
  const check = async () => { await wait(1500); const p = await Spotify.state(); return p && p.is_playing ? p : null; };
  try {
    await Spotify.hush(dev);
    let p = await check();
    if (!p) { await Spotify.startSilence(dev); p = await check(); }
    st.pauseNote = p ? "Spotify spelar tystnad och håller sig vaken."
                     : "Spotify stannade ändå. Tryck Spela när nästa kort är draget.";
  } catch (e) { st.pauseNote = "Pausa gick inte: " + e.message + " " + (e.detail || e.status || ""); }
  render();
}

async function loadDevices() {
  try { const p = await Spotify.pickDevice(); st.devices = p.list; if (!st.device) st.device = p.id; st.msg = ""; } catch (e) { st.msg = e.message; }
  render();
}

// The two ways to get to the next card.
const nextButtons = () => `
  <div class="next">
    <button class="big" data-act="scan">Skanna QR</button>
    <button class="ghost wide" data-act="pad">Skriv kortets nummer</button>
  </div>`;

function render() {
  const head = `<h1 class="logo-img"><img src="assets/logo-dark.svg" alt="Quizzuh"></h1>`;
  const msg = st.msg ? `<div class="msg">${esc(st.msg)}${st.asleep
    ? `<a class="button wide" href="spotify://" data-act="wake">Öppna Spotify</a>
       <span class="hint">Kom sedan tillbaka hit, så startar låten av sig själv.</span>` : ""}${st.detail
    ? `<span class="hint tech">${esc(st.detail)}</span>` : ""}</div>` : "";

  if (st.pad !== null) {
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-act="key" data-k="${k}">${k}</button>`).join("");
    $app.innerHTML = `<div class="phone">${head}
      <p class="big-text center">Skriv kortets nummer</p>
      <div class="padnum center">${esc(st.pad) || "&nbsp;"}</div>
      <div class="pad">${keys}<button data-act="key" data-k="del">⌫</button><button data-act="key" data-k="0">0</button><button class="go" data-act="key" data-k="ok">✓</button></div>
      <button class="ghost wide" data-act="padcancel">Avbryt</button></div>`;
    return;
  }
  if (st.sent) {
    $app.innerHTML = `<div class="phone">${head}<p class="cardnum">Kort ${esc(num)}</p><h2>Kortet är skickat till spelet!</h2>
      <p>Gå tillbaka till fliken där spelet är öppet. Låten startar där.</p></div>`;
    return;
  }
  if (!Spotify.configured()) { $app.innerHTML = `<div class="phone">${head}<p>Spotify är inte inställt.</p></div>`; return; }
  if (!Spotify.loggedIn()) {
    $app.innerHTML = `<div class="phone">${head}${num ? `<p class="cardnum">Kort ${esc(num)}</p>` : ""}
      <p>Logga in på Spotify en gång på den här telefonen, så spelar korten sina låtar direkt när du skannar dem.</p>
      <button class="big" data-act="login">Logga in på Spotify</button>
      <p class="hint">Kräver Spotify Premium. Ha Spotify-appen öppen på telefonen (eller välj en högtalare).</p></div>`;
    return;
  }
  if (!song) {
    $app.innerHTML = `<div class="phone">${head}
      <p class="big-text center">Dra ett kort</p>
      <p class="center hint">Skanna QR-koden eller skriv numret som står på kortet. Låten startar direkt, svaret är dolt.</p>
      ${msg}${nextButtons()}
      <p class="hint center">Tips: öppna Spotify-appen en gång innan ni börjar.</p></div>`;
    return;
  }
  const opts = st.devices.map(d => `<option value="${esc(d.id)}" ${d.id === st.device ? "selected" : ""}>${esc(d.name)}</option>`).join("");
  const answer = st.show
    ? `<div class="card-big small"><div class="year">${song.year}</div><div class="title">${esc(songLabel(song))}</div><div class="artist">${esc(song.artist)}</div></div>`
    : `<button class="ghost wide" data-act="show">Visa svaret</button>`;
  $app.innerHTML = `<div class="phone">${head}<p class="cardnum">Kort ${esc(num)}</p>
    <div class="eq ${st.playing ? "" : "still"}"><i></i><i></i><i></i><i></i><i></i></div>
    <p class="big-text center">${st.busy ? "Startar…" : st.playing ? "Låten spelas" : st.paused ? "Pausad" : "Redo"}</p>
    <div class="row center"><button class="ghost" data-act="play">${st.playing ? "Spela igen" : "Spela"}</button>
      <button class="ghost" data-act="pause">Pausa</button></div>
    ${st.paused && st.pauseNote ? `<p class="hint center">${esc(st.pauseNote)}</p>` : ""}
    ${msg}
    ${answer}
    ${nextButtons()}
    <p class="hint center">Spela på: <select data-act="device">${opts || `<option>${st.device ? "Senaste enheten" : "–"}</option>`}</select>
      <button class="ghost small" data-act="devices">Uppdatera</button></p></div>`;
}

function padKey(k) {
  if (k === "del") st.pad = st.pad.slice(0, -1);
  else if (k === "ok") { if (st.pad) loadCard(Number(st.pad)); return; }
  else if (st.pad.length < 3) st.pad += k;
  render();
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "login") Spotify.login();
  else if (a === "play") play();
  // "Pausa" plays silence instead of stopping, so the phone's Spotify stays awake for the next card.
  else if (a === "pause") pause();
  else if (a === "show") { st.show = true; render(); }
  else if (a === "devices") loadDevices();
  else if (a === "scan") Scanner.open(loadCard);
  else if (a === "pad") { st.pad = ""; render(); }
  else if (a === "padcancel") { st.pad = null; render(); }
  else if (a === "key") padKey(b.dataset.k);
  // "wake" is a plain link to the Spotify app; play() runs again when the page comes back (below).
});
document.addEventListener("change", e => {
  if (e.target.dataset.act === "device") { st.device = e.target.value; Spotify.saveDevice(st.device); play(); }
});
document.addEventListener("keydown", e => {
  if (st.pad === null) return;
  if (/^[0-9]$/.test(e.key)) padKey(e.key);
  else if (e.key === "Backspace") padKey("del");
  else if (e.key === "Enter") padKey("ok");
});
// Back from the Spotify app after "Öppna Spotify": try the song again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && st.asleep && song && !st.busy) setTimeout(play, 600);
});

(async () => {
  if (await Spotify.init()) return;
  if (num && !song) st.msg = "Kort " + num + " finns inte i listan.";
  if (song && hubWaiting()) { handToHub(); return; }
  render();
  if (song && Spotify.loggedIn()) play();
})();
