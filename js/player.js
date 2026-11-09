// The phone: join with a name, answer each song, place the card on your own timeline.
const $app = document.getElementById("app");
const q = new URLSearchParams(location.search);
let code = (q.get("r") || "").toUpperCase();
const myId = localStorage.getItem("quizzuh-id") || (() => {
  const id = "p" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("quizzuh-id", id); return id;
})();
let name = localStorage.getItem("quizzuh-name") || "";
let joined = false, view = null, status = "", peer = null, conn = null;
let draft = { round: 0, artist: "", title: "", year: "", slot: null };
let localDeadline = 0;

// ---------- connection ----------
function connect() {
  if (!peer || peer.destroyed) {
    peer = new Peer(undefined, peerOptions());
    peer.on("open", openConn);
    peer.on("error", e => {
      status = e.type === "peer-unavailable" ? "Hittar inte spelet. Stämmer koden? Försöker igen…" : "Anslutningsproblem (" + e.type + "). Försöker igen…";
      render(); setTimeout(openConn, 3000);
    });
    peer.on("disconnected", () => setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 2000));
  } else openConn();
}
function openConn() {
  if (!peer || !peer.open) return;
  if (conn && conn.open) return;
  status = "Ansluter…"; render();
  conn = peer.connect(PEER_PREFIX + code.toLowerCase(), { reliable: true });
  conn.on("open", () => { status = ""; conn.send({ t: "join", id: myId, name }); });
  conn.on("data", m => { if (m && m.t === "state") onState(m.view); });
  conn.on("close", () => { status = "Tappade kontakten. Återansluter…"; render(); setTimeout(openConn, 2000); });
}

function onState(v) {
  joined = true;
  if (v.phase === "song" && draft.round !== v.round) draft = { round: v.round, artist: "", title: "", year: "", slot: null };
  if (v.phase === "song") localDeadline = Date.now() + v.remaining;
  // Someone else answered: nothing changed for me, so don't redraw (that would close the keyboard).
  const same = view && view.phase === "song" && v.phase === "song" && view.round === v.round && !view.answered && !v.answered;
  view = v;
  if (!same) render();
}

// ---------- drawing ----------
function secsLeft() { return Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000)); }

function timeline(cards, pickable) {
  if (!cards.length) return "";
  const slot = i => pickable
    ? `<button class="slot ${draft.slot === i ? "on" : ""}" data-slot="${i}">${draft.slot === i ? "♪ Nya låten hamnar här" : "+ Lägg här"}</button>`
    : "";
  let h = `<div class="timeline">` + slot(0);
  cards.forEach((c, i) => {
    h += `<div class="tcard"><span class="y">${c.year}</span><span class="t">${esc(c.title)}<small>${esc(c.artist)}</small></span></div>` + slot(i + 1);
  });
  return h + `</div>`;
}

function render() {
  const st = status ? `<div class="msg">${esc(status)}</div>` : "";
  if (!code) {
    $app.innerHTML = `<div class="phone"><h1 class="logo">Quizzuh</h1>
      <label>Spelkod <input id="code" maxlength="4" autocapitalize="characters" placeholder="ABCD"></label>
      <button class="big" data-act="code">Fortsätt</button></div>`;
    return;
  }
  if (!joined && !(name && conn)) {
    $app.innerHTML = `<div class="phone"><h1 class="logo">Quizzuh</h1>
      <label>Ditt namn <input id="name" maxlength="20" value="${esc(name)}" placeholder="Namn" autocomplete="nickname"></label>
      <button class="big" data-act="join">Gå med</button>${st}</div>`;
    return;
  }
  if (!view) { $app.innerHTML = `<div class="phone"><h1 class="logo">Quizzuh</h1><p>Ansluter…</p>${st}</div>`; return; }
  const v = view;
  const head = `<div class="phead"><span>${esc(v.name || name)}</span><span>${v.round > 0 && v.phase !== "lobby" ? "Låt " + v.round + "/" + v.total : ""}</span></div>`;

  if (v.phase === "closed") {
    $app.innerHTML = `<div class="phone"><h1 class="logo">Quizzuh</h1><p>Spelet har redan börjat. Vänta till nästa spel!</p></div>`;
  } else if (v.phase === "lobby") {
    $app.innerHTML = `<div class="phone">${head}<h2>Hej ${esc(v.name)}!</h2><p>Du är med. Väntar på att spelet startar…</p>${st}</div>`;
  } else if (v.phase === "song" && !v.answered) {
    const needSlot = !v.first;
    $app.innerHTML = `<div class="phone">${head}
      <div class="ptimer" id="ptimer">${secsLeft()} s</div>
      <label>Artist <input id="artist" value="${esc(draft.artist)}" autocomplete="off" autocorrect="off"></label>
      <label>Låt <input id="title" value="${esc(draft.title)}" autocomplete="off" autocorrect="off"></label>
      <label>År <span class="hint">(bonus om det stämmer exakt)</span><input id="year" inputmode="numeric" maxlength="4" value="${esc(draft.year)}"></label>
      ${needSlot ? `<h3>Var på din tidslinje hamnar låten?</h3>${timeline(v.cards, true)}` : `<p class="hint">Första låten hamnar mitt på din tidslinje. Du behöver inte placera den.</p>`}
      <button class="big" data-act="send" ${needSlot && draft.slot === null ? "disabled" : ""}>${needSlot && draft.slot === null ? "Välj plats på tidslinjen" : "Skicka svar"}</button>
      ${st}</div>`;
  } else if (v.phase === "song") {
    $app.innerHTML = `<div class="phone">${head}<h2>Svar skickat!</h2><p>Väntar på de andra…</p>${timeline(v.cards, false)}${st}</div>`;
  } else if (v.phase === "reveal") {
    const r = v.mine || {}, P = v.points;
    const line = (ok, txt, p) => `<li class="${ok ? "ok" : "no"}">${ok ? "✓" : "✗"} ${txt}${ok && p ? ` <b>+${p}</b>` : ""}</li>`;
    $app.innerHTML = `<div class="phone">${head}
      <div class="card-big small"><div class="year">${v.song.year}</div><div class="title">${esc(v.song.title)}</div><div class="artist">${esc(v.song.artist)}</div></div>
      ${v.song.star ? `<p class="hint">* Den här inspelningen kanske inte är originalet.</p>` : ""}
      ${r.answered === false ? `<p>Du hann inte svara.</p>` : ""}
      <ul class="results">
        ${line(r.artist, "Artist", P.artist)}${line(r.title, "Låt", P.title)}${line(r.year, "År", P.year)}
        ${r.first ? `<li class="ok">Första kortet: det ligger på din tidslinje</li>` : r.placed ? `<li class="ok">✓ Rätt plats: du behåller kortet</li>` : `<li class="no">✗ Fel plats: kortet åkte ut</li>`}
      </ul>
      <p>Den här låten: <b>+${r.points || 0}</b> · Dina kort: <b>${v.cards.length}</b></p>
      ${timeline(v.cards, false)}${st}</div>`;
  } else if (v.phase === "end") {
    const list = v.standings.map((s, i) => `<li class="${s.me ? "me" : ""}"><span class="place">${i + 1}</span> ${esc(s.name)} <b>${s.total}</b></li>`).join("");
    $app.innerHTML = `<div class="phone"><h1 class="logo">Resultat</h1><ol class="standings">${list}</ol>
      <p class="hint">Poäng + ${v.points.card} per kort på tidslinjen.</p>${timeline(v.cards, false)}</div>`;
  }
}

// ---------- input ----------
document.addEventListener("input", e => {
  const id = e.target.id;
  if (id === "artist" || id === "title" || id === "year") draft[id] = e.target.value;
});
document.addEventListener("click", e => {
  const s = e.target.closest("[data-slot]");
  if (s) { draft.slot = Number(s.dataset.slot); render(); return; }
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "code") {
    code = (document.getElementById("code").value || "").trim().toUpperCase();
    if (code.length === 4) { history.replaceState(null, "", "?r=" + code + peerParam()); render(); }
  } else if (a === "join") {
    name = (document.getElementById("name").value || "").trim().slice(0, 20);
    if (!name) return;
    localStorage.setItem("quizzuh-name", name);
    localStorage.setItem("quizzuh-last", code);
    connect(); render();
  } else if (a === "send") {
    if (!conn || !conn.open) { status = "Ingen kontakt med spelet just nu. Försök igen om en stund."; render(); return; }
    conn.send({ t: "answer", id: myId, artist: draft.artist, title: draft.title, year: draft.year, slot: draft.slot });
  }
});

// Countdown on the phone (the hub decides when time is really up).
setInterval(() => { const t = document.getElementById("ptimer"); if (t) t.textContent = secsLeft() + " s"; }, 250);

// Coming back to the page (e.g. after locking the phone): reconnect straight away if we were in the game.
if (code && name && localStorage.getItem("quizzuh-last") === code) connect();
render();
