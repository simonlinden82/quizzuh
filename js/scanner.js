// In-page QR scanner: opens the camera inside the page, reads a card's QR code and hands back the card number.
// Scanner.open(n => ...) shows a full-screen camera view; the callback gets the card number (or is never called if
// the player cancels). Uses vendor/jsQR.js (loaded the first time it is needed). Needs https (or localhost).
const Scanner = (() => {
  let stream = null, box = null, timer = null, done = null;

  function loadLib() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "vendor/jsQR.js"; s.onload = ok; s.onerror = () => fail(new Error("Kunde inte ladda QR-läsaren."));
      document.head.appendChild(s);
    });
  }

  // A card QR holds ".../k.html?c=<n>"; a plain number also counts.
  function cardNumber(text) {
    const m = String(text).match(/[?&]c=(\d+)/) || String(text).trim().match(/^(\d{1,3})$/);
    return m ? Number(m[1]) : null;
  }

  function close() {
    clearTimeout(timer); timer = null;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (box) box.remove();
    box = null;
  }

  function say(text) { const p = box && box.querySelector(".scan-msg"); if (p) p.textContent = text; }

  async function open(onNumber) {
    close();
    done = onNumber;
    box = document.createElement("div");
    box.className = "scanner";
    box.innerHTML = `<video playsinline muted autoplay></video><div class="scan-frame"></div>
      <p class="scan-msg">Startar kameran…</p><button class="ghost scan-cancel">Avbryt</button>`;
    document.body.appendChild(box);
    box.querySelector(".scan-cancel").onclick = close;
    const video = box.querySelector("video");
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Den här webbläsaren kan inte använda kameran.");
      await loadLib();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!box) { close(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      say("Rikta kameran mot QR-koden på kortet");
      look(video);
    } catch (e) {
      const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      say(denied ? "Kameran är blockerad. Tillåt kameran för den här sidan (aA-menyn i Safari → Webbplatsinställningar → Kamera) och försök igen."
                 : (e.message || "Kameran gick inte att starta."));
    }
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function look(video) {
    if (!box) return;
    if (video.readyState >= 2 && video.videoWidth) {
      // Read a centred square, scaled down: faster, and the card is in the middle anyway.
      const side = Math.min(video.videoWidth, video.videoHeight), size = Math.min(side, 640);
      canvas.width = canvas.height = size;
      ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
      const hit = jsQR(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: "dontInvert" });
      if (hit && hit.data) {
        const n = cardNumber(hit.data);
        if (n) { const cb = done; close(); if (navigator.vibrate) navigator.vibrate(60); cb(n); return; }
        say("Det där är inte ett Quizzuh-kort.");
      }
    }
    timer = setTimeout(() => look(video), 120);
  }

  return { open, close, cardNumber, supported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) };
})();
