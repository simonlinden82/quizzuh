# Quizzuh: notes for Claude

Music timeline quiz by Simon Lindén. Simon is a graphic designer, not a programmer: explain in plain words,
do the git steps for him, never ask him to use the terminal.

## The game (Simon's design)
- Hub screen (computer/iPad) with a QR code; players join from their phones in the browser (no install).
- Every player plays every song (not only the active player).
- First song: just type artist + song (+ year for bonus); the card lands in the middle of your timeline.
- Later songs: type artist + song (+ year), then place the card on your timeline.
- Scoring (to be tweaked; keep all numbers in one place): artist 2, song 1, exact year 1,
  correct placement = you keep the card; each kept card = 1 point at the end.
- Each game uses a random selection of songs, never two from the same year.
- Do NOT use the name "Hitster" (an existing commercial game) anywhere in the game.

## Song list
- Source: Spotify playlist "Quizzzuhhh" https://open.spotify.com/playlist/25Hp33nvEq0tSuzkl8j7At
- `data/songs.json` = the checked list (field `year` = year for the game, `spotify_year`, `check`, `note`, `star`).
- Year rule: the year the version you hear first came out. Remasters / best-ofs keep the original year;
  remixes and live versions get their own year.
- `star: true` = not yet confirmed as the original recording: the game shows " *" after the title (none left since 2026-11-22).
- Simon wants ORIGINALS: where the playlist has a remix/live/odd copy, `spotify_id` points at the original recording and
  `orig_playlist_id` keeps the playlist's copy (so a playlist re-check doesn't treat it as new).
- `check` values: sure, fixed, likely, fixed + listen, decide/check (Simon's call), unknown (no year: leave out of games).
- Updating: read the playlist from the embed page (`tools/spotify_tracks.py`), check only new songs
  (`tools/musicbrainz_years.py`, then by hand with Wikipedia), keep Simon's earlier decisions,
  rebuild the sheet with `tools/make_sheet.py`. Needs network access to open.spotify.com, musicbrainz.org, en.wikipedia.org.

## Code (plain HTML + JavaScript, no build step)
- `index.html` = the hub (QR code, songs, scores), `play.html` = the phone page. Swedish texts.
- `config.js` = the numbers to tweak (points, songs per game, seconds, match strictness) and the Spotify Client ID.
- `js/common.js` = answer matching (`artistOk` / `titleOk`, spelling-tolerant), `placementOk`.
- `js/hub.js` holds the whole game (`G`, saved in localStorage so a reload can continue); phones send `join` / `answer`,
  the hub sends each phone its own `state` view. Connections: PeerJS (WebRTC, `vendor/peerjs.min.js`), public PeerJS
  server by default; `?peer=127.0.0.1:9000` uses a local test server.
- `js/spotify.js` = Spotify login (PKCE, no secret) + play on a chosen device (needs Premium).
- `data/songs.js` is made from `data/songs.json` by `tools/make_songs_js.py`: re-run it after changing the list.
- Testing: silent (headless, `--mute-audio`). Local PeerJS server: `require("peer").PeerServer({port: 9000, path: "/", host: "127.0.0.1"})`.

## Printed cards (2026-11-22, for 1 December)
- Card number = song `n` (stable; never renumber, new songs get new numbers). Songs without a year get no card.
- `k.html?c=<n>` = what a card's QR opens (`js/card.js`): if this device has a hub game in card mode waiting for a card
  (`G.mode === "cards"`, phase "draw"), it hands the card over via localStorage `quizzuh-scan`; otherwise it plays the
  song on Spotify with the answer hidden ("Visa svaret" reveals it).
- Hub modes: "Slumpade låtar" (random, no repeated years) and "Tryckta kort" (`G.mode = "cards"`, phase "draw" = number pad,
  `useCard(n)`, `G.rounds`, no repeats). Same-year cards count as right on either side (`placementOk`).
- Spotify login always redirects to the folder URL (registered) and jumps back to the page that asked (`quizzuh-spotify-return`).
- `node tools/make_cards.js [previewDir] [pages…]` -> `cards/quizzuh-cards.pdf` (mini European cards 44 x 68 mm, 16 per A4 (4 x 4), fronts and mirrored backs
  interleaved for long-edge duplex, crop marks, rules cards last: 3 steps per side). Needs Playwright: `NODE_PATH=$(npm root -g)`. Fonts in `tools/cards/fonts`.
  Re-run after any song change, and re-check that long titles fit (it prints TEXT TOO LONG).
- Logo (2026-11-22): `assets/logo-light.svg` (light backgrounds), `assets/logo-dark.svg` (white ring, dark backgrounds),
  `assets/logo-icon.svg` (tab icon). The Q is a record with a straight tonearm (pivot, arm, head with the needle on the grooves); letters are Archivo Black
  converted to outlines (no font needed). Web pages use `.logo-img`.

## Phone card page as an app (2026-11-26)
- `k.html` with no `?c=` = start screen ("Dra ett kort"). Next card without leaving the page: "Skanna QR" (in-page camera,
  `js/scanner.js` + `vendor/jsQR.js`, loaded on first use) or "Skriv kortets nummer" (number pad). `loadCard(n)` swaps the
  card in place (URL updated with replaceState). The hub's draw screen has the same "Skanna QR" button.
- Why: scanning with the iPhone camera app opened a new Safari page each time, and by then the Spotify app had often
  dropped off Spotify's device list ("Ingen Spotify-enhet hittades").
- `Spotify.play` (= `playAnywhere`) tries: chosen device, fresh device list, last device that worked (even if unlisted),
  no device id, then again after 1.5 s. If nothing answers it throws `noDevice`: the card page shows "Öppna Spotify"
  (link `spotify://`) and plays automatically when the page becomes visible again.
- Home screen: `manifest.webmanifest` (start_url k.html, only linked from k.html so the hub isn't affected),
  `assets/icon-180.png` (apple-touch-icon), 192/512 PNGs. Icon = logo-icon.svg on cream #fff4ec (dark/orange backgrounds hid parts).
  A home-screen app on iOS has its own storage: log in to Spotify once more inside it.
- Keep-awake (2026-11-26, after "Spotify-appen har somnat" kept showing on Simon's iPhone): iOS Spotify drops off the
  device list ~5 s after it stops playing in the background. So `Spotify.play` queues an hour of silent tracks after the
  song (`SILENCE` in spotify.js, measured silent, playable in SE) and the card page's "Pausa" calls `Spotify.hush()`
  (plays silence) instead of pausing. Errors show a small tech line (`err.detail`: device-id prefix:status, lista:<count>).
- Pausa v2 (2026-11-26, Simon: pausing still let Spotify sleep after ~10 s): `hush()` = POST /me/player/next (skip to the
  queued silence, like a song ending), else start silence. card.js `pause()` then checks GET /me/player after 1.5 s,
  restarts silence once if not playing, and shows the result under the buttons ("Spotify spelar tystnad…" / "stannade ändå").

## Rules cards (2026-11-26, Simon's text, written in the Claude Doc "Quizzuh – spelregler på korten")
- Three rules cards: "Kortspelet" (Kort + en mobil), "Skärmspelet" (Dator/iPad + en mobil var), "Tips". `RULES` in
  make_cards.js = [name, subtitle, first step, steps, hint]; font 2.45 mm. The builder prints "RULES TOO LONG" /
  "rules ok … px free" per side; trims needed to fit were laid back into the doc as suggestions.
- Kortspelet scoring (Simon's choice): no points; place right = keep the card; 2+ right guesses (artist/song/year) = bonus card
  placed year up; first to 10 cards on the timeline wins.
- On this Mac: Node is at ~/.local/node/bin (not on PATH), Playwright installed globally; Playwright's own browser build
  may be missing, so make_cards.js falls back to the installed Google Chrome. `SCALE=3` env = sharp PNG previews.
