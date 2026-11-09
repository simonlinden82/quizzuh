// Shared by the hub and the phones.

// Connection options. ?peer=host:port in the URL points at a local test server instead of the public one.
function peerOptions() {
  const p = new URLSearchParams(location.search).get("peer");
  if (!p) return { debug: 1 };
  const [host, port] = p.split(":");
  return { host, port: Number(port || 9000), path: "/", secure: false, debug: 1 };
}
function peerParam() {
  const p = new URLSearchParams(location.search).get("peer");
  return p ? "&peer=" + encodeURIComponent(p) : "";
}
const PEER_PREFIX = "quizzuh-";

// ---------- answer matching ----------
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // å -> a, é -> e
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^\s*the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function close(guess, target, need) {
  const g = norm(guess), t = norm(target);
  if (!g || !t) return false;
  if (g === t || g.replace(/ /g, "") === t.replace(/ /g, "")) return true;
  const ratio = 1 - lev(g, t) / Math.max(g.length, t.length);
  return ratio >= need;
}

// Every way of writing a title that counts: the full title, and without the bits in brackets.
function titleForms(title) {
  const t = String(title).replace(/\s*\*$/, "");
  const forms = [t, t.replace(/\([^)]*\)|\[[^\]]*\]/g, " ")];
  return forms.filter(f => norm(f));
}

// Every artist in a credit counts: "Eminem ft. Dido" accepts Eminem, Dido, or both.
function artistForms(artist) {
  const parts = String(artist).split(/\s*(?:,|&|\bft\.|\bfeat\.?|\bfeaturing\b|\band\b)\s*/i);
  return [artist, ...parts].filter(f => norm(f));
}

function artistOk(guess, song, need) {
  return artistForms(song.artist).some(f => close(guess, f, need));
}
function titleOk(guess, song, need) {
  return titleForms(song.title).some(f => close(guess, f, need));
}

// slot = where the new card goes in the sorted timeline (0 = before the first card).
function placementOk(cards, slot, year) {
  const before = cards[slot - 1], after = cards[slot];
  return (!before || before.year < year) && (!after || after.year > year);
}

// ---------- small helpers ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function songLabel(song) {
  return song.title + (song.star ? " *" : "");
}
