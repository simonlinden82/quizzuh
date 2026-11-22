// Spotify playback: log in once (PKCE, no secret needed), then tell a Spotify device what to play.
// Needs Spotify Premium. The music plays on whatever device runs the Spotify app (computer, iPad, phone, speaker).
// Login always returns to the game folder's main page (registered in the Spotify app), then jumps back
// to the page that asked (e.g. a card page).
const Spotify = (() => {
  const KEY = "quizzuh-spotify";
  const DEV = "quizzuh-device";
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
      if (/no active device/i.test(msg || "")) msg = "Ingen Spotify-enhet hittades. Öppna Spotify-appen, spela något i en sekund och försök igen.";
      throw new Error(msg || "Spotify-fel " + r.status);
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

  return {
    configured: () => !!clientId(),
    loggedIn: () => !!tok,
    login, init, devices, pickDevice,
    logout() { tok = null; localStorage.removeItem(KEY); },
    savedDevice: () => localStorage.getItem(DEV) || "",
    saveDevice: id => localStorage.setItem(DEV, id),
    play(trackId, deviceId) {
      return api("PUT", "/me/player/play" + (deviceId ? "?device_id=" + encodeURIComponent(deviceId) : ""), { uris: ["spotify:track:" + trackId] });
    },
    pause(deviceId) { return api("PUT", "/me/player/pause" + (deviceId ? "?device_id=" + encodeURIComponent(deviceId) : "")).catch(() => {}); },
  };
})();
