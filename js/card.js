// The page a printed card's QR code opens (k.html?c=<card number>).
// - If this device is running a Quizzuh game that is waiting for a card, the card goes to that game.
// - Otherwise it plays the song on Spotify with the answer hidden (playing with only the cards on the table).
const $app = document.getElementById("app");
const num = Number(new URLSearchParams(location.search).get("c"));
const song = cardSong(num);
let st = { msg: "", playing: false, show: false, devices: [], device: "", busy: false };

function hubWaiting() {
  const g = JSON.parse(localStorage.getItem("quizzuh-game") || "null");
  return g && g.mode === "cards" && g.phase === "draw" && Date.now() - (g.startedAt || 0) < 12 * 3600e3;
}

async function play() {
  st.busy = true; st.msg = ""; render();
  try {
    if (!st.device) { const p = await Spotify.pickDevice(); st.devices = p.list; st.device = p.id; }
    if (!st.device) throw new Error("Ingen Spotify-enhet hittades. Öppna Spotify-appen på telefonen, spela något i en sekund och tryck Spela igen.");
    await Spotify.play(song.spotify_id, st.device);
    Spotify.saveDevice(st.device);
    st.playing = true;
  } catch (e) { st.msg = e.message; }
  st.busy = false; render();
}

async function loadDevices() {
  try { const p = await Spotify.pickDevice(); st.devices = p.list; if (!st.device) st.device = p.id; } catch (e) { st.msg = e.message; }
  render();
}

function render() {
  const msg = st.msg ? `<div class="msg">${esc(st.msg)}</div>` : "";
  const head = `<h1 class="logo-img"><img src="assets/logo-dark.svg" alt="Quizzuh"></h1><p class="cardnum">Kort ${esc(num || "?")}</p>`;
  if (!song) { $app.innerHTML = `<div class="phone">${head}<p>Det här kortet finns inte i listan.</p></div>`; return; }
  if (st.sent) {
    $app.innerHTML = `<div class="phone">${head}<h2>Kortet är skickat till spelet!</h2>
      <p>Gå tillbaka till fliken där spelet är öppet. Låten startar där.</p></div>`;
    return;
  }
  if (!Spotify.configured()) { $app.innerHTML = `<div class="phone">${head}<p>Spotify är inte inställt.</p></div>`; return; }
  if (!Spotify.loggedIn()) {
    $app.innerHTML = `<div class="phone">${head}
      <p>Logga in på Spotify en gång på den här telefonen, så spelar korten sina låtar direkt när du skannar dem.</p>
      <button class="big" data-act="login">Logga in på Spotify</button>
      <p class="hint">Kräver Spotify Premium. Ha Spotify-appen öppen på telefonen (eller välj en högtalare).</p></div>`;
    return;
  }
  const opts = st.devices.map(d => `<option value="${esc(d.id)}" ${d.id === st.device ? "selected" : ""}>${esc(d.name)}</option>`).join("");
  const answer = st.show
    ? `<div class="card-big small"><div class="year">${song.year}</div><div class="title">${esc(songLabel(song))}</div><div class="artist">${esc(song.artist)}</div></div>`
    : `<button class="ghost wide" data-act="show">Visa svaret</button>`;
  $app.innerHTML = `<div class="phone">${head}
    <div class="eq ${st.playing ? "" : "still"}"><i></i><i></i><i></i><i></i><i></i></div>
    <p class="big-text center">${st.busy ? "Startar…" : st.playing ? "Låten spelas" : "Redo"}</p>
    <div class="row center"><button class="ghost" data-act="play">${st.playing ? "Spela igen" : "Spela"}</button>
      <button class="ghost" data-act="pause">Pausa</button></div>
    ${msg}
    ${answer}
    <p class="hint center">Spela på: <select data-act="device">${opts || "<option>–</option>"}</select>
      <button class="ghost small" data-act="devices">Uppdatera</button></p>
    <p class="hint center">Skanna nästa kort med kameran när det är dags.</p></div>`;
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "login") Spotify.login();
  else if (a === "play") play();
  else if (a === "pause") { Spotify.pause(st.device); st.playing = false; render(); }
  else if (a === "show") { st.show = true; render(); }
  else if (a === "devices") loadDevices();
});
document.addEventListener("change", e => {
  if (e.target.dataset.act === "device") { st.device = e.target.value; Spotify.saveDevice(st.device); play(); }
});

(async () => {
  if (await Spotify.init()) return;
  if (song && hubWaiting()) {
    localStorage.setItem("quizzuh-scan", JSON.stringify({ n: num, at: Date.now() }));
    st.sent = true; render(); return;
  }
  render();
  if (song && Spotify.loggedIn()) play();
})();
