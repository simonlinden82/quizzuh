# Writes data/songs.js (what the game loads) from data/songs.json.
import json, os
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, '..', 'data', 'songs.json')
rows = json.load(open(src, encoding='utf-8'))
keep = [{k: r[k] for k in ('n', 'artist', 'title', 'year', 'star', 'note', 'spotify_id', 'check')} for r in rows]
out = os.path.join(here, '..', 'data', 'songs.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('// Made by tools/make_songs_js.py from data/songs.json. Edit songs.json, then re-run.\n')
    f.write('window.SONGS = ' + json.dumps(keep, ensure_ascii=False, indent=0) + ';\n')
print('wrote', len(keep), 'songs')
