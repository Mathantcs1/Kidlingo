import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL="#F2A33A","#1F9CA8"
# six colleagues; index 0 is Dev (same blue-grey hoodie as every episode)
TILES=[dict(bg="#dff0d8",deco="plant",hair="beanie",hc="#26334a",shirt="#4a6a9a",skin="#fff3dc",mood="flat"),
 dict(bg="#ffe3c8",deco="shelf",hair="bun",hc="#2a2233",shirt="#e0543a",skin="#e8b88a",mood="flat"),
 dict(bg="#d9e8ff",deco="window",hair="cap",hc="#1F9CA8",shirt="#2f6fd6",skin="#fff3dc",mood="flat"),
 dict(bg="#f1dcff",deco="poster",hair="long",hc="#5a3a22",shirt="#1F9CA8",skin="#f0c9a0",mood="flat"),
 dict(bg="#fff2b8",deco="curtain",hair="curly",hc="#3b2a20",shirt="#a06bff",skin="#c68642",mood="flat"),
 dict(bg="#d8f0ea",deco="lamp",hair="bald",hc="#000",shirt="#7c8f5a",skin="#e8c8a0",mood="flat",glasses=True)]
CX=[190,540,890]; BOT=[700,1050]; POS=[(CX[i%3],BOT[i//3]) for i in range(6)]
def tile(act,i,at,sc=1.0,x=None,y=None,**o):
    d=dict(TILES[i]); d.update(o); px,py=POS[i]
    return dict(act=act,type="prop",id="ittile",x=x if x is not None else px,y=y if y is not None else py,scale=sc,enter="pop",at=at,opts=d,bob=.3,qa=False)
def app(act,title=None): return dict(act=act,type="prop",id="itapp",x=540,y=1430,scale=1.08,enter="none",at=0,opts=dict(title=title) if title else {},qa=False)
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=130,x=60,w=960,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
acts=[A("hook",None,"navy"),A("a1","yesterday-0.1","navy","wipe-left"),A("a2","but-0.1","slate","zoom"),
 A("a3","the#?","navy","iris"),A("a4","next#3-0.1","navy","wipe-up")]
acts[3]=A("a3","real-0.3","navy","iris")
it=[]
# hook: six tiles join, "no blockers"
it+=[app("hook"),card("hook",120,"STANDUP 9:15 AM","daily",size=60,h=120,x=140,w=800)]
for i,w in enumerate(["daily","standup","six","people","everybody","says"]): it.append(tile("hook",i,w))
it+=[card("hook",1110,"\"NO BLOCKERS.\"","no",size=64,h=130,bg="#ffd21f")]
# a1: ritual - each tile lights up in turn
it+=[app("a1"),card("a1",120,"\"NO BLOCKERS.\"  ×  6","yesterday",size=54,h=120,x=100,w=880)]
for i in range(6): it.append(tile("a1",i,0,enter="none") if False else dict(tile("a1",i,0),enter="none"))
L=["no#2","next-0.3","says#2","next#2","sixth-0.4","person#2"]
for i in range(6):
    x,y=POS[i]; t0=L[i]; t1=L[i+1] if i<5 else "prayer+0.6"
    it.append(rect("a1",x-166,y-342,332,342,t0,"rgba(0,0,0,0)","",10,bc="#ffd21f",bw=10,flat=True,until=t1,radius=26))
    it.append(rect("a1",x-150,y-110,300,84,t0,"#ffd21f","NO BLOCKERS.",38,until=t1,radius=40))
it+=[card("a1",1110,"BY THE SIXTH: A PRAYER","prayer",size=48,h=120,bg="#fff")]
# a2: what they didn't say + private chats
it+=[app("a2"),card("a2",120,"WHAT THEY DIDN'T SAY","after",size=54,h=120,x=100,w=880)]
for i in range(6): it.append(dict(tile("a2",i,0),enter="none",opts=dict(TILES[i],mood="worry")))
TB=["ACCESS<br>PENDING","NO TEST<br>DATA","VPN<br>DOWN","WAITING<br>ON CLIENT","UNCLEAR<br>REQUIREMENT","MY LAPTOP<br>IS DYING"]
TT=["access","test","vpn","all","blockers#3","blockers#3+0.5"]
for i in range(6):
    x,y=POS[i]; it.append(rect("a2",x-155,y-338,310,112,TT[i],"#fff",TB[i],38,radius=50,color="#e0543a"))
it+=[rect("a2",60,1090,960,84,"hey","#cfe8ff","ARE YOU ALSO WAITING FOR ACCESS?",38,radius=42),
 rect("a2",60,1190,960,84,"test","#cfe8ff","DO YOU HAVE TEST DATA?",38,radius=42),
 rect("a2",60,1290,960,84,"vpn","#cfe8ff","IS THE VPN DOWN FOR YOU TOO?",38,radius=42)]
# a3: the web of private chats
it+=[app("a3"),card("a3",120,"THE REAL STANDUP HAPPENS AFTER","real",size=44,h=120,x=40,w=1000)]
for i in range(6): it.append(dict(tile("a3",i,0),enter="none"))
def hseg(a,b,t,c="#ffd21f"):
    (xa,ya),(xb,yb)=POS[a],POS[b]; return dict(x1=xa+105,y1=ya-45,x2=xb-105,y2=yb-45,at=t)
def vseg(col,t):
    x=POS[col][0]+112; return dict(x1=x,y1=POS[col][1]-45,x2=x,y2=POS[col+3][1]-45,at=t)
segs=[hseg(0,1,"private"),hseg(1,2,"chats"),hseg(3,4,"in#2"),hseg(4,5,"corridor"),vseg(0,"corridor+0.4"),vseg(2,"one#2"),vseg(1,"person#?")]
segs[-1]=vseg(1,"trust")
it+=[dict(act="a3",type="lines",segs=segs[:-1],c="#ffd21f",w=14,dur=.5),dict(act="a3",type="lines",segs=[segs[-1]],c="#ff7ab8",w=18,dur=.6)]
it+=[card("a3",1110,"\"I AM BLOCKED\"","blocked",size=56,h=120,bg="#fff",x=80,w=900),
 card("a3",1250,"≠ \"I AM SLOW\"","slow",size=60,h=130,bg="#ffd21f",x=140,w=800)]
# a4: say it out loud
it+=[app("a4","DAILY STANDUP · 9:16 AM"),card("a4",120,"SAY IT ONCE. SEE WHAT HAPPENS.","try",size=40,h=120,x=40,w=1000)]
it+=[dict(tile("a4",0,0,1.3,x=540,y=1010),enter="none",opts=dict(TILES[0],mood="worry"))]
for k,i in enumerate([1,2,3,4,5]):
    it.append(tile("a4",i,"only",0.4,x=130+k*205,y=545,mood="grin"))
it+=[dict(act="a4",type="typing",x=160,y=1100,w=760,h=110,text="I'M BLOCKED.",at="saying#3",dur=1.3,size=52),
 dict(act="a4",type="confetti",at="only",n=60,x0=40,x1=1040,y0=240,y1=1400,dur=2.6),
 card("a4",1240,"LAST REAL BLOCKER?","what",size=56,h=130,bg="#ffd21f")]
spec=dict(kitFile="../../kits/it-life.json",tail=3.2,kit=dict(caption=dict(y=1475)),acts=acts,items=it)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
