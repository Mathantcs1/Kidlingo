import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL,RED="#F2A33A","#1F9CA8","#e0543a"
JK="#8a5a3a"
def back(act,id,**o): return dict(act=act,type="prop",id=id,x=540,y=1430,scale=1.08,enter="none",at=0,opts=o,qa=False)
def dev(act,x,sc=1.3,at=0,enter="none",y=1400,fl=0,**o):
    d=dict(act=act,type="prop",id="itdev",x=x,y=y,scale=sc,enter=enter,at=at,opts=o,bob=.6)
    if fl: d["float"]=fl
    return d
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=120,x=40,w=1000,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
TILES=[dict(bg="#dff0d8",deco="plant",hair="beanie",hc="#26334a",shirt="#4a6a9a",skin="#fff3dc"),
 dict(bg="#ffe3c8",deco="shelf",hair="bun",hc="#2a2233",shirt="#e0543a",skin="#e8b88a"),
 dict(bg="#d9e8ff",deco="window",hair="cap",hc="#1F9CA8",shirt="#2f6fd6",skin="#fff3dc"),
 dict(bg="#f1dcff",deco="poster",hair="long",hc="#5a3a22",shirt="#1F9CA8",skin="#f0c9a0"),
 dict(bg="#fff2b8",deco="curtain",hair="curly",hc="#3b2a20",shirt="#a06bff",skin="#c68642"),
 dict(bg="#d8f0ea",deco="lamp",hair="bald",hc="#000",shirt="#7c8f5a",skin="#e8c8a0",glasses=True)]
acts=[A("hook",None,"sunset"),A("a1","a-0.1","navy","wipe-left"),A("a2","after-0.1","night","iris"),A("a3","nobody#2-0.2","slate","shutters"),
 A("a4","in#3-0.1","cream","wipe-left"),A("a5","best-0.4","sunset","zoom")]
it=[]
# hook: one step out of the door
it+=[back("hook","ithall"),card("hook",130,"7:10 PM","dinner" if False else "step",size=64,h=130,x=240,w=600),
 dict(dev("hook",230,1.3,jacket=JK,keys=True,mood="smile",fl=6),move=dict(x=470,dur=3.4)),
 card("hook",290,"TABLE FOR TWO · 7:30","dinner",size=44,h=110,x=140,w=800,bg="#ffe27a",until="phone"),
 dict(act="hook",type="steam",x=180,y=1015,at=0,n=2,h=40,c="rgba(255,226,140,.9)"),dict(act="hook",type="steam",x=275,y=1015,at=0,n=2,h=40,c="rgba(255,226,140,.9)"),
 dict(prop("hook","itphone",640,1.3,"phone",opts=dict(),enter="pop",y=1200),jitter=4),
 stamp("hook","BZZZ","buzz",y=560,color=RED,size=80,hit=True)]
# a1: bridge call with 11 people
it+=[back("a1","itlounge"),
 card("a1",130,"PRODUCTION ISSUE","production",size=56,h=120,until="eleven"),
 card("a1",130,"PRODUCTION BRIDGE · 11 PEOPLE","eleven",size=44,h=120,until="nobody"),
 card("a1",130,"NOBODY SURE WHO OWNS IT","nobody",size=48,h=120,bg="#ffd21f",until="sat")]
for i in range(11):
    c=i%4 if i<8 else i-8; r=i//4 if i<8 else 2
    x=540+(c-1.5)*215 if i<8 else 325+(i-8)*215
    y=560+r*200
    d=dict(TILES[i%6],mood="worry" if i%2 else "flat")
    it.append(dict(act="a1",type="prop",id="ittile",x=round(x),y=y,scale=.55,enter="pop",at="eleven+%.2f"%(0.17*i),opts=d,bob=.3,qa=False))
it+=[dev("a1",250,1.2,y=1484,sit=True,jacket=JK,mood="worry",sweat=True),
 prop("a1","itlaptop",560,0.6,"laptop",opts=dict(),enter="pop",y=1440),
 card("a1",1020,"RESERVATION → MY DESK","reservation",size=40,h=110,x=400,w=640,bg="#ffe27a")]
# a2: the fix, log view
LOG=["10:42:01 INFO  bridge opened","10:42:07 WARN  queue depth 4812","10:42:09 INFO  worker restarted","10:43:13 ERROR timeout after 30s","10:43:15 INFO  retry 1","10:43:58 INFO  health check ok","10:44:20 WARN  queue depth 5230","10:44:31 INFO  config loaded","10:45:02 INFO  retry 2","10:45:44 ERROR upstream 503","10:46:10 INFO  scaling out","10:46:55 WARN  queue depth 5890","10:47:20 INFO  cache cleared","10:48:05 ERROR timeout after 30s","10:48:40 INFO  retry 3","10:49:12 WARN  queue depth 6001","10:49:50 INFO  worker restarted","10:50:31 ERROR upstream 503","10:51:02 INFO  reading app.config","10:51:03 INFO  loading values",
     "  retry_limit = -1   # wrong","10:51:04 INFO  loaded","10:51:09 WARN  retry storm","10:51:40 ERROR queue full","10:52:11 INFO  retry 9000","10:52:48 INFO  bridge: any ideas?","10:53:15 WARN  queue depth 9100","10:53:50 INFO  worker restarted"]
it+=[back("a2","itlounge",dark=True,wall="#1a2238"),
 card("a2",130,"TWO HOURS LATER","after",size=56,h=120,until="one#2"),
 card("a2",130,"ONE LINE. ONE WRONG VALUE.","one#2",size=48,h=120,bg="#ffd21f",until="changed"),
 card("a2",130,"FIXED. TESTED. QUIET.","changed",size=52,h=120,bg="#62f0c8",until="thanks"),
 card("a2",130,"\"THANKS, EVERYONE.\"","thanks",size=52,h=120,until="dropped"),
 card("a2",130,"11 PEOPLE DROP OFF","dropped",size=52,h=120),
 dict(act="a2",type="logview",x=50,y=340,w=980,h=640,lines=LOG,hi=20,at="after",hiAt="one#2",fixAt="changed",fixText="  retry_limit = 3    # fixed",size=40,lh=64,zoom=.2),
 dev("a2",250,1.0,y=1484,sit=True,jacket=JK,mood="flat")]
for i in range(11):
    it.append(rect("a2",60+i*86,270,60,60,"after","#9fb0c4","",10,radius=30,until="dropped+%.2f"%(0.1*i),bw=4))
# a3: silence, the message from home
it+=[back("a3","itlounge",dark=True,wall="#141a2a"),
 card("a3",130,"NOBODY SENT A MESSAGE.","nobody#2",size=48,h=120,until="nobody#3"),
 card("a3",130,"NOBODY REMEMBERED THE LINE.","nobody#3",size=44,h=120,until="only"),
 card("a3",130,"THE ONLY MESSAGE: FROM HOME","only",size=44,h=120,bg="#ffd21f"),
 dev("a3",300,1.2,y=1484,sit=True,jacket=JK,mood="sad"),
 prop("a3","itphone",760,1.2,"only",opts=dict(),enter="pop",y=1380,bob=.5),
 rect("a3",60,430,860,100,"only","#cfe8ff","WHERE ARE YOU?",44,radius=46),
 rect("a3",120,560,900,100,"ordered","#cfe8ff","WE ORDERED FOR YOU.",44,radius=46),
 dict(act="a3",type="typing",x=160,y=700,w=800,h=100,text="ALMOST THERE.",at="ordered+0.5",dur=.8,size=44)]
# a4: then vs now
it+=[card("a4",130,"THEN VS NOW","in#3",size=60,h=120,x=240,w=600,bg="#ffd21f",until="feeling"),
 rect("a4",30,290,500,190,"in#3",AMB,"2015",120,color="#fff"),rect("a4",30,500,500,330,"in#3","#fff","CALL THE BRIDGE. FIX IT. TELL NOBODY.",44),
 dev("a4",270,1.0,at="in#3",enter="pop",y=1400,jacket=JK,mood="flat"),
 rect("a4",550,290,500,190,"twentysix",TEAL,"2026",120,color="#fff"),
 rect("a4",550,500,500,80,"thread","#fff","CHAT THREAD",40),rect("a4",550,596,500,80,"ticket","#fff","TICKET",40),rect("a4",550,692,500,80,"postmortem","#fff","POSTMORTEM",40),rect("a4",550,788,500,80,"summary","#62f0c8","AI SUMMARY",40),
 dev("a4",810,1.0,at="twentysix",enter="pop",y=1400,mood="flat"),
 dict(act="a4",type="clockspin",x=540,y=700,size=380,at="twentysix-0.5",dur=1.0),
 card("a4",130,"THE FEELING HAS NOT CHANGED","feeling",size=44,h=120,bg="#ffd21f")]
# a5: someone kept the food warm
it+=[back("a5","itdinner"),
 prop("a5","itfoil",380,1.3,0,opts=dict(),enter="none",y=1090),
 dict(act="a5",type="steam",x=250,y=985,at=0,n=3,h=50,c="rgba(255,226,140,.9)"),dict(act="a5",type="steam",x=610,y=985,at=0,n=3,h=50,c="rgba(255,226,140,.9)"),
 dict(dev("a5",1250,1.3,jacket=JK,keys=True,mood="smile"),move=dict(x=720,dur=2.6,at="best")),
 card("a5",130,"SOMEONE KEPT THE FOOD WARM","someone",size=44,h=120,until="tell"),
 card("a5",130,"YOUR LONGEST NIGHT CALL?","tell",size=52,h=120,bg="#ffd21f")]
spec=dict(kitFile="../../kits/it-life.json",tail=3.2,kit=dict(caption=dict(y=1475,size=66)),acts=acts,items=it)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
