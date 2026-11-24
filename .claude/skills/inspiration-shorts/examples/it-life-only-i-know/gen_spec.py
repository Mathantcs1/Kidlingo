import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL,RED="#F2A33A","#1F9CA8","#e0543a"
def back(act,id,sc=1.2,**o): return dict(act=act,type="prop",id=id,x=540,y=1430,scale=sc,enter="none",at=0,opts=o,qa=False)
def dev(act,x,sc=1.5,at=0,enter="none",y=1440,qa=True,**o):
    d=dict(act=act,type="prop",id="itdev",x=x,y=y,scale=sc,enter=enter,at=at,opts=o,bob=.6)
    if not qa: d["qa"]=False
    return d
def pal(act,x,kind,sc=1.5,at=0,enter="none",y=1440,mood="curious",**k):
    return dict(act=act,type="prop",id="itpal",x=x,y=y,scale=sc,enter=enter,at=at,opts=dict(kind=kind,mood=mood),bob=.7,**k)
def card(act,y,text,at,size=52,bg="#fff",color=INK,h=130,x=40,w=1000,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
def q(act,x,y,at,until=None,s=150): 
    k=dict(until=until) if until else {}
    return rect(act,x,y,s,s-20,at,"#fff","?",96,radius=65,**k)
acts=[A("hook",None,"night"),A("a1","new#1-0.1","cream","wipe-left"),A("a2","remember-0.1","sunset","iris"),A("a3","fixed-0.2","mint","push"),
 A("a4","understood-0.9","violet","zoom"),A("a5","So-0.1","sunset","iris")]
it=[]
# hook: night office, one lamp, a screen full of rules
it+=[back("hook","itnight",sc=1.08),
 card("hook",130,"9:40 PM","Late",size=76,bg="#ffd21f"),
 dev("hook",350,1.5,mood="worry",sweat=True),
 prop("hook","itrules",540,2.0,"rule",opts=dict(order="wrong"),enter="pop",y=700)]
it+=[card("hook",300,"WRONG ORDER. NOBODY KNOWS WHY.","wrong",size=50,bg="#ffb0a0",h=130)]
# a1: everyone checks, nobody knows
it+=[back("a1","itplain",wall="#dfe8f7",floor="#9fb0c4"),
 card("a1",130,"WHO KNOWS THIS?","new",size=64,until="Then"),
 card("a1",130,"THEY ALL LOOK AT ME.","Then",size=56,bg="#ffd21f"),
 prop("a1","itrules",540,1.8,"new",opts=dict(order="wrong"),enter="none",y=470),
 pal("a1",150,"fresher",enter="pop",at="new"), pal("a1",360,"senior",enter="pop",at="senior"),
 dev("a1",820,1.5,mood="worry",sweat=True),
 prop("a1","itdoc",150,.95,"document",enter="pop",y=840,until="Then"),
 prop("a1","itdoc",150,.95,"nothing",opts=dict(x=True),enter="none",y=840,until="Then"),
 prop("a1","itwiki",360,1.0,"old",enter="pop",y=840,until="Then"),
 rect("a1",280,640,110,100,"wiki#2","#e0543a","✗",70,radius=50,color="#fff",until="Then"),
 q("a1",70,700,"Then"),q("a1",290,700,"Then+0.15"),q("a1",760,640,"Then+0.3",s=130)]
# a2: flashback, amber, the whiteboard
it+=[back("a2","itplain",wall="#f6dfb0",floor="#c7803c"),
 card("a2",130,"A DECISION FROM THREE YEARS AGO.","remember",size=42,bg=AMB,until="chose"),
 card("a2",130,"ONE BANK PROCESS NEEDED IT FIRST.","chose",size=42,bg="#fff",until="never"),
 card("a2",130,"NEVER WRITTEN DOWN.","never",size=60,bg="#ffd21f"),
 prop("a2","itboard",540,1.7,"whiteboard",enter="pop",y=700),
 dev("a2",250,1.4,mood="smile"),pal("a2",540,"senior",1.4,mood="flat"),pal("a2",830,"fresher",1.4,mood="curious"),
 rect("a2",70,740,940,150,"chose","#fff","“LET’S KEEP THIS FIRST, OTHERWISE THE FLOW BREAKS.”",40,radius=40,bw=5,until="never")]
# a3: the fix
it+=[back("a3","itplain",wall="#d9f0e3",floor="#8fd18a"),
 card("a3",130,"FIXED IN 2 MINUTES.","fixed",size=62,bg="#62f0c8",until="honest"),
 card("a3",130,"“I JUST REMEMBER.”","honest",size=60,bg="#ffd21f"),
 prop("a3","itrules",540,1.8,"fixed",opts=dict(order="wrong"),enter="none",y=520,until="minutes"),
 prop("a3","itrules",540,1.8,"minutes",opts=dict(order="right"),enter="pop",y=520),
 prop("a3","itcheck",300,1.4,"minutes+0.3",y=760),
 dev("a3",280,1.5,mood="smile"),pal("a3",610,"senior",1.5,mood="smile"),pal("a3",910,"fresher",1.5,mood="smile"),
 prop("a3","itcoffee",765,1.5,"Everyone",enter="pop",y=1330),
 rect("a3",470,690,570,120,"Everyone","#fff","WOW, HOW DID YOU KNOW?",42,radius=55,until="answer")]
# a4: the real system lives in people
it+=[back("a4","itplain",wall="#e8e4f5",floor="#c9c2e6"),
 card("a4",130,"THE DOCUMENT IS ONLY A GUESS.","document#3",size=42,until="real"),
 card("a4",130,"THE REAL SYSTEM LIVES IN PEOPLE.","real",size=44,bg="#ffd21f",until="leave"),
 card("a4",130,"WHEN THEY LEAVE, IT LEAVES.","leave",size=52,bg="#ffb0a0"),
 dev("a4",300,1.5,mood="smile"),
 prop("a4","itdoc",800,.8,"document#3",enter="pop",y=1000,zoom=dict(from_=2.2,dur=1.4,at="guess")),
 prop("a4","itbrain",300,2.1,"real",enter="pop",y=840,zoom=dict(from_=.35,dur=1.6,at="real"),float=6)]
# a5: writes it down
it+=[back("a5","itplain",wall="#ffe9d2",floor="#f3c9a0"),
 card("a5",130,"THE THING ONLY YOU KNOW?","Tell",size=54,bg="#ffd21f"),
 prop("a5","itlaptop",760,1.5,"wrote",opts=dict(glow="#ffd98a"),enter="pop",y=1380),
 dev("a5",350,1.5,mood="smile",raise_=False),
 dict(act="a5",type="typing",x=90,y=640,w=900,h=120,text="WHY WE DID IT THIS WAY",at="wrote",dur=1.8,size=52)]
for i in it:
    z=i.get("zoom")
    if z and "from_" in z: z["from"]=z.pop("from_")
    if i.get("opts") and "raise_" in i["opts"]: i["opts"].pop("raise_")
it=[i for i in it if not (i.get("type")=="rect" and i.get("y")==130)]+[i for i in it if i.get("type")=="rect" and i.get("y")==130]
spec=dict(kitFile="../../kits/it-life.json",tail=3.2,kit=dict(caption=dict(y=1475,size=66)),acts=acts,items=it)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
