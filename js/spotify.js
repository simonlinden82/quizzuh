// Spotify playback for the hub: log in once (PKCE, no secret needed), then tell a Spotify device what to play.
// Needs Spotify Premium. The music plays on whatever device runs the Spotify app (computer, iPad, speaker).
const Spotify = (() => {
  const KEY = "quizzuh-spotify";
  const redirect = () => location.origin + location.pathname;
  const clientId = () => (window.QUIZ && QUIZ.spotifyClientId) || "";
  let tok = JSON.parse(localStorage.getItem(KEY) || "null");

  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  async function login() {
    const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
    sessionStorage.setItem(KEY + "-verifier", verifier);
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
    if (!r.ok) throw new Error("Spotify-inloggningen misslyckades (" + r.status + ")");
    const j = await r.json();
    tok = { access: j.access_token, refresh: j.refresh_token || (tok && tok.refresh), until: Date.now() + (j.expires_in - 60) * 1000 };
    localStorage.setItem(KEY, JSON.stringify(tok));
  }

  // Call on page load: finishes a login that just came back from Spotify.
  async function init() {
    const q = new URLSearchParams(location.search);
    const code = q.get("code");
    if (code || q.get("error")) {
      const verifier = sessionStorage.getItem(KEY + "-verifier");
      q.delete("code"); q.delete("state"); q.delete("error");
      history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
      if (code && verifier) await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirect(), code_verifier: verifier }).catch(() => {});
    }
  }

  async function access() {
    if (!tok) return null;
    if (Date.now() > tok.until && tok.refresh) await tokenCall({ grant_type: "refresh_token", refresh_token: tok.refresh });
    return tok.access;
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
    if (!r.ok) {
      let msg = txt; try { msg = JSON.parse(txt).error.message; } catch (e) {}
      throw new Error(msg || "Spotify-fel " + r.status);
    }
    return txt ? JSON.parse(txt) : null;
  }

  return {
    configured: () => !!clientId(),
    loggedIn: () => !!tok,
    login, init,
    logout() { tok = null; localStorage.removeItem(KEY); },
    async devices() { return ((await api("GET", "/me/player/devices")) || {}).devices || []; },
    play(trackId, deviceId) {
      return api("PUT", "/me/player/play" + (deviceId ? "?device_id=" + encodeURIComponent(deviceId) : ""), { uris: ["spotify:track:" + trackId] });
    },
    pause(deviceId) { return api("PUT", "/me/player/pause" + (deviceId ? "?device_id=" + encodeURIComponent(deviceId) : "")).catch(() => {}); },
  };
})();
