import json,re,time,urllib.request,html,sys
t=json.load(open(sys.argv[1]))
out=[]
for x in t:
    tid=x['uri'].split(':')[-1]
    req=urllib.request.Request('https://open.spotify.com/track/'+tid,headers={'User-Agent':'Mozilla/5.0'})
    h=urllib.request.urlopen(req).read().decode()
    rd=re.search(r'music:release_date" content="([^"]+)',h)
    de=re.search(r'og:description" content="([^"]+)',h)
    desc=html.unescape(de.group(1)) if de else ''
    parts=desc.split(' · ')
    out.append(dict(id=tid,artist=x['subtitle'],title=x['title'],album=parts[1] if len(parts)>3 else '',spotify_date=rd.group(1) if rd else ''))
    time.sleep(0.3)
json.dump(out,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
