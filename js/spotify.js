// Spotify playback: log in once (PKCE, no secret needed), then tell a Spotify device what to play.
// Needs Spotify Premium. The music plays on whatever device runs the Spotify app (computer, iPad, phone, speaker).
// Login always returns to the game folder's main page (registered in the Spotify app), then jumps back
// to the page that asked (e.g. a card page).
const Spotify = (() => {
  const KEY = "quizzuh-spotify";
  const DEV = "quizzuh-device";
  const ASLEEP = "Spotify-appen har somnat. Öppna Spotify en kort stund och kom tillbaka hit.";
  const redirect = () => new URL("./", location.href).href;
  const clientId = () => (window.QUIZ && QUIZ.spotifyClientId) || "";
  let tok = JSON.parse(localStorage.getItem(KEY) || "null");

  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  async function login() {
    const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
    localStorage.setItem(KEY + "-verifier", verifier);
    localStorage.setItem(KEY + "-return", location.href);
    const challenge = b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const q = new URLSearchParams({
      client_id: clientId(), response_type: "code", redirect_uri: redirect(),
      code_challenge_method: "S256", code_challenge: challenge,
      scope: "user-modify-playback-state user-read-playback-state",
    });
    location.href = "https://accounts.spotify.com/authorize?" + q;
  }

  async function tokenCall(params) {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId(), ...params }),
    });
    if (!r.ok) {
      if (params.grant_type === "refresh_token") { tok = null; localStorage.removeItem(KEY); }
      throw new Error("Spotify-inloggningen misslyckades (" + r.status + "). Logga in igen.");
    }
    const j = await r.json();
    tok = { access: j.access_token, refresh: j.refresh_token || (tok && tok.refresh), until: Date.now() + (j.expires_in - 60) * 1000 };
    localStorage.setItem(KEY, JSON.stringify(tok));
  }

  // Call on page load: finishes a login that just came back from Spotify.
  // Returns true if it is sending the browser back to another page.
  async function init() {
    const q = new URLSearchParams(location.search);
    const code = q.get("code");
    if (!code && !q.get("error")) return false;
    const verifier = localStorage.getItem(KEY + "-verifier");
    const back = localStorage.getItem(KEY + "-return");
    localStorage.removeItem(KEY + "-verifier"); localStorage.removeItem(KEY + "-return");
    q.delete("code"); q.delete("state"); q.delete("error");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
    if (code && verifier) await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirect(), code_verifier: verifier }).catch(() => {});
    if (back && back.split("?")[0].split("#")[0] !== location.href.split("?")[0].split("#")[0]) { location.replace(back); return true; }
    return false;
  }

  async function access() {
    if (!tok) return null;
    if (Date.now() > tok.until && tok.refresh) await tokenCall({ grant_type: "refresh_token", refresh_token: tok.refresh });
    return tok && tok.access;
  }

  async function api(method, path, body) {
    const a = await access();
    if (!a) throw new Error("Inte inloggad på Spotify");
    const r = await fetch("https://api.spotify.com/v1" + path, {
      method, headers: { Authorization: "Bearer " + a, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 204) return null;
    const txt = await r.text();
    if (r.status === 401) { tok = null; localStorage.removeItem(KEY); }
    if (!r.ok) {
      let msg = txt; try { msg = JSON.parse(txt).error.message; } catch (e) {}
      const noDevice = r.status === 404 || /device/i.test(msg || "");
      if (noDevice) msg = ASLEEP;
      const err = new Error(msg || "Spotify-fel " + r.status);
      err.status = r.status; err.noDevice = noDevice;
      throw err;
    }
    return txt ? JSON.parse(txt) : null;
  }

  async function devices() { return ((await api("GET", "/me/player/devices")) || {}).devices || []; }

  // The saved device if Spotify still knows it, else the active one, else this kind of device, else any.
  async function pickDevice() {
    const list = await devices();
    const saved = localStorage.getItem(DEV);
    const phone = /iPhone|Android/i.test(navigator.userAgent);
    const d = list.find(x => x.id === saved) || list.find(x => x.is_active)
      || list.find(x => phone ? x.type === "Smartphone" : x.type !== "Smartphone") || list[0];
    return { list, id: d ? d.id : "" };
  }

  // Play a track, trying hard to find somewhere to play it. An iPhone's Spotify app that sits in the background
  // often drops off Spotify's device list even though it can still play, so after the chosen device we try:
  // a fresh device list, the last device that worked (even if unlisted), "wherever Spotify last played", and
  // once more after a short wait. Returns the device id that worked ("" = Spotify's own choice).
  // Throws an error with .noDevice = true when nothing answers (the app needs waking up).
  //
  // Keeping the phone awake: on an iPhone, Spotify drops off the device list a few seconds after it STOPS playing
  // while it is in the background, and a web page cannot wake it. So it never stops: after the song comes an hour of
  // silent tracks, and hush() (the page's "Pausa") switches to silence instead of pausing.
  // Both tracks measured as silent (digital zero / below -80 dB) on 2026-11-26, playable in Sweden.
  const SILENCE = ["spotify:track:6gWSdJ0JS8hPUrKDUrgEwj", "spotify:track:3mkOlbSv5RYadx0JsjTrKq"];  // 10 min each
  const silentHour = () => Array.from({ length: 6 }, (_, i) => SILENCE[i % 2]);

  async function playAnywhere(trackId, wanted) {
    return playUris(["spotify:track:" + trackId, ...silentHour()], wanted, ["spotify:track:" + trackId]);
  }

  async function playUris(uris, wanted, plain) {
    let body = { uris };
    const tried = new Set();
    const log = [];
    let last = null;
    const attempt = async id => {
      if (tried.has(id)) return false;
      tried.add(id);
      const path = "/me/player/play" + (id ? "?device_id=" + encodeURIComponent(id) : "");
      try { await api("PUT", path, body); log.push((id ? id.slice(0, 4) : "auto") + ":ok"); return true; }
      catch (e) {
        log.push((id ? id.slice(0, 4) : "auto") + ":" + (e.status || "?"));
        // A silent track that has vanished from Spotify must not stop the song: try the song on its own.
        if (e.status === 400 && plain && body.uris !== plain) { body = { uris: plain }; tried.delete(id); return attempt(id); }
        if (!e.noDevice && !(e.status >= 500)) throw e;   // a real problem (login, Premium): stop here
        last = e; return false;
      }
    };
    const fromList = async () => { const p = await pickDevice(); log.push("lista:" + p.list.length); return p.id; };
    const done = id => { if (id) localStorage.setItem(DEV, id); return id; };

    if (wanted && await attempt(wanted)) return done(wanted);
    let id = await fromList();
    if (id && await attempt(id)) return done(id);
    const saved = localStorage.getItem(DEV);
    if (saved && await attempt(saved)) return done(saved);
    if (await attempt("")) return "";
    await new Promise(r => setTimeout(r, 1500));
    tried.clear();
    id = await fromList();
    if (id && await attempt(id)) return done(id);
    const err = last || new Error(ASLEEP);
    err.noDevice = true; err.message = ASLEEP; err.detail = log.join(" ");
    throw err;
  }

  return {
    configured: () => !!clientId(),
    loggedIn: () => !!tok,
    login, init, devices, pickDevice,
    logout() { tok = null; localStorage.removeItem(KEY); },
    savedDevice: () => localStorage.getItem(DEV) || "",
    saveDevice: id => localStorage.setItem(DEV, id),
    play: playAnywhere,
    // "Pause" that keeps the phone's Spotify awake: skip ahead to the silence queued after the song (the same thing
    // that happens when a song ends), or start silence if that fails. Never a real pause.
    async hush(wanted) {
      const q = wanted ? "?device_id=" + encodeURIComponent(wanted) : "";
      try { await api("POST", "/me/player/next" + q); }
      catch (e) { await playUris(silentHour(), wanted); }
    },
    startSilence: wanted => playUris(silentHour(), wanted),
    state: () => api("GET", "/me/player"),   // { is_playing, item: { name }, device: { name } } or null
    pause(deviceId) { return api("PUT", "/me/player/pause" + (deviceId ? "?device_id=" + encodeURIComponent(deviceId) : "")).catch(() => {}); },
  };
})();
