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
- `star: true` = not yet confirmed as the original recording: the game shows " *" after the title.
- `check` values: sure, fixed, likely, fixed + listen, decide/check (Simon's call), unknown (no year: leave out of games).
- Updating: read the playlist from the embed page (`tools/spotify_tracks.py`), check only new songs
  (`tools/musicbrainz_years.py`, then by hand with Wikipedia), keep Simon's earlier decisions,
  rebuild the sheet with `tools/make_sheet.py`. Needs network access to open.spotify.com, musicbrainz.org, en.wikipedia.org.
