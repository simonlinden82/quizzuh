import json,collections,sys
from openpyxl import Workbook
from openpyxl.styles import Font,PatternFill,Alignment
rows=json.load(open(sys.argv[1]))
LBL={'unknown':('1 Needs a year','F4A6A6'),'decide':('2 Your call','F9D58B'),'check':('2 Your call','F9D58B'),'fixed + listen':('3 Fixed – listen once (*)','FBE7A9'),
     'likely':('4 Probably right','E8E8E8'),'fixed':('5 Fixed (Spotify was wrong)','CDE8C4'),'sure':('6 OK','FFFFFF')}
rows.sort(key=lambda r:(LBL[r['check']][0],r['n']))
wb=Workbook(); ws=wb.active; ws.title='Songs'
ws.append(['* = this copy may not be the original recording (not checked by ear yet). The game shows the asterisk.'])
ws['A1'].font=Font(italic=True)
ws.append(['#','Artist','Song (as shown in the game)','Year for the game','Year Spotify shows','Status','Note','Spotify album','Spotify link'])
for c in ws[2]: c.font=Font(bold=True,color='FFFFFF'); c.fill=PatternFill('solid',fgColor='333333')
for r in rows:
    lab,col=LBL[r['check']]
    ws.append([r['n'],r['artist'],r['shown'],r['year'] or '?',r['spotify_year'],lab[2:],r['note'],r['album'],'https://open.spotify.com/track/'+r['spotify_id']])
    for c in ws[ws.max_row]:
        c.fill=PatternFill('solid',fgColor=col); c.alignment=Alignment(vertical='top',wrap_text=c.column in (2,3,7,8))
    if r['year'] and r['year']!=r['spotify_year']: ws.cell(ws.max_row,4).font=Font(bold=True)
for col,w in zip('ABCDEFGHI',[5,30,34,10,10,26,70,32,22]): ws.column_dimensions[col].width=w
ws.freeze_panes='A3'
ws2=wb.create_sheet('Years'); ws2.append(['Year','Songs']); ws2['A1'].font=ws2['B1'].font=Font(bold=True)
by=collections.defaultdict(list)
for r in rows:
    if r['year']: by[r['year']].append(f"{r['artist']} – {r['shown']}")
for y in sorted(by): ws2.append([y,len(by[y])]+by[y])
for col in 'CDEF': ws2.column_dimensions[col].width=45
wb.save(sys.argv[2]); print('saved',len(rows))
