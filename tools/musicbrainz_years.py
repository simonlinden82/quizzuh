import json,re,time,urllib.request,urllib.parse,sys,unicodedata
def norm(s):
    s=unicodedata.normalize('NFKD',s.lower())
    s=re.sub(r'[^a-z0-9]+',' ',s); return s.strip()
def clean(t):
    t=re.sub(r'\s+-\s+(.*(remaster|version|edit|live|mix).*)$','',t,flags=re.I)
    return t.strip()
songs=json.load(open(sys.argv[1]))
for s in songs:
    title=clean(s['title']); main=s['artist'].split(',')[0].strip()
    s['clean_title']=title; s['main_artist']=main
    q='recording:"%s" AND artist:"%s"'%(title.replace('"',''),main)
    url='https://musicbrainz.org/ws/2/recording?fmt=json&limit=100&query='+urllib.parse.quote(q)
    for attempt in range(3):
        try:
            r=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HitsterQuizPrep/0.1 (private playtest)'}),timeout=30)); break
        except Exception as e: time.sleep(3); r={'recordings':[]}
    best=[]
    for rec in r.get('recordings',[]):
        if norm(rec['title'])!=norm(title): continue
        arts=norm(' '.join(c.get('name','')+' '+c.get('artist',{}).get('name','') for c in rec.get('artist-credit',[])))
        if norm(main) not in arts: continue
        d=rec.get('first-release-date')
        if d: best.append((d,rec.get('disambiguation','')))
    best.sort()
    s['mb_first']=best[0][0] if best else ''
    s['mb_note']=best[0][1] if best else ''
    s['mb_n']=len(best)
    print(s['spotify_date'][:4], s['mb_first'][:10], s['mb_n'], main[:20],'|',title[:40],'|',s['mb_note'][:30],flush=True)
    time.sleep(1.1)
json.dump(songs,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
