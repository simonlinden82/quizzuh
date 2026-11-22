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
- `node tools/make_cards.js [previewDir] [pages…]` -> `cards/quizzuh-cards.pdf` (65 mm cards, 12 per A4 (3 x 4; designed at 80 mm and scaled), fronts and mirrored backs
  interleaved for long-edge duplex, crop marks, rules card last). Needs Playwright: `NODE_PATH=$(npm root -g)`. Fonts in `tools/cards/fonts`.
  Re-run after any song change, and re-check that long titles fit (it prints TEXT TOO LONG).
- Logo (2026-11-22): `assets/logo-light.svg` (light backgrounds), `assets/logo-dark.svg` (white ring, dark backgrounds),
  `assets/logo-icon.svg` (tab icon). The Q is a record with a straight tonearm (pivot, arm, head with the needle on the grooves); letters are Archivo Black
  converted to outlines (no font needed). Web pages use `.logo-img`.
