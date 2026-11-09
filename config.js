// Quizzuh settings. Change the numbers here to tweak the game.
window.QUIZ = {
  // Fill in after creating the Spotify app at developer.spotify.com (see README).
  // Empty = test mode without music.
  spotifyClientId: "96f2aabb23fd4cbdb0370ead6a1058ae",

  songsPerGame: 20,     // default on the start screen
  secondsPerSong: 45,   // default on the start screen

  points: {
    artist: 2,   // right artist
    title: 1,    // right song name
    year: 1,     // exact year (bonus)
    card: 1,     // each card left on your timeline at the end
  },

  // How close a typed answer has to be (1 = exact, 0.8 = small spelling mistakes are fine).
  match: 0.8,
};
