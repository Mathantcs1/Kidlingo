import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL,RED="#F2A33A","#1F9CA8","#e0543a"
BS=1.45
def back(act,id,**o): return dict(act=act,type="prop",id=id,x=540,y=1430,scale=BS,enter="none",at=0,opts=o,qa=False)
def dev(act,x,sc=1.6,at=0,enter="none",y=1420,fl=0,**o):
    d=dict(act=act,type="prop",id="itdev",x=x,y=y,scale=sc,enter=enter,at=at,opts=o,bob=.5)
    if fl: d["float"]=fl
    return d
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=120,x=40,w=1000,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
def chair(act,x,sc=1.8,y=1440,**k): return prop(act,"itchair",x,sc,0,opts=dict(color="#9fb0c4"),enter="none",y=y,bob=0)
def shade(act,a=.38,until=None):
    d=rect(act,-20,0,1120,1430,0,"rgba(8,18,30,%s)"%a,"",10,radius=0,bw=0,flat=True)
    if until: d["until"]=until
    return d
def clock(act,pulse=False,size=240,x=462,y=600,at=0,**k): return dict(act=act,type="clockface",x=x,y=y,size=size,at=at,pulse=pulse,**k)
acts=[A("hook",None,"cream"),A("a1","bench-0.3","cream","wipe-left"),A("a2","now-0.1","navy","iris"),A("a3","but#2-0.1","slate","shutters"),
 A("a4","do-0.3","night","push"),A("a5","bench#4-0.3","sunset","zoom")]
it=[]
# hook: walks into the waiting room, calm
it+=[back("hook","itwait",era="2015"),clock("hook"),chair("hook",240),chair("hook",880),
 card("hook",130,"2015 — THE BENCH","step" if False else "two",size=60,h=130,x=140,w=800),
 dict(dev("hook",760,1.6,mood="smile",fl=4),move=dict(x=330,dur=3.8)),
 card("hook",300,"RESOURCE MANAGEMENT","resource",size=44,h=110,x=140,w=800,bg="#ffe27a",until="felt")]
# a1: the old feeling, learning on the bench
it+=[back("a1","itwait",era="2015"),clock("a1"),chair("a1",240),chair("a1",880),
 card("a1",130,"A WAITING ROOM.","bench",size=60,h=130,until="maybe"),
 card("a1",130,"MAYBE NEXT WEEK. MAYBE NEXT MONTH.","maybe",size=44,h=130,until="so"),
 card("a1",130,"SO I LEARNED SOMETHING NEW","so",size=48,h=130,until="honestly"),
 card("a1",130,"MY BEST SKILLS CAME FROM THE BENCH","honestly",size=40,h=130,bg="#62f0c8"),
 card("a1",262,"A TOOL","tool",size=46,h=80,x=520,w=520,bg="#fff"),card("a1",352,"A CERTIFICATION","certification",size=42,h=80,x=520,w=520,bg="#ffe27a"),card("a1",442,"A PLATFORM FEATURE","platform",size=40,h=80,x=520,w=520,bg="#fff"),
 dev("a1",250,1.4,y=1450,sit="chair",mood="smile",fl=2),
 prop("a1","itbook",560,1.3,"bench",opts=dict(),enter="pop",y=1440),
 prop("a1","itlaptop",720,0.8,"learned",opts=dict(screen="#cfe8ff"),enter="pop",y=1440),
 prop("a1","itcoffee",900,1.4,"bench",opts=dict(),enter="pop",y=1440),dict(act="a1",type="steam",x=900,y=1320,at="bench",n=4,h=80)]
# a2: the same room, 2026
it+=[back("a2","itwait",era="2026"),shade("a2",.3),clock("a2"),chair("a2",240),chair("a2",570),chair("a2",880),
 dict(act="a2",type="clockspin",x=540,y=800,size=460,at="now",dur=1.3),
 card("a2",130,"2026 — THE SAME ROOM","thousand#2",size=52,h=130,until="but#2"),
 dev("a2",250,1.4,y=1450,sit="chair",mood="flat")]
# a3: the countdown
it+=[back("a3","itwait",era="2026"),shade("a3",.4),clock("a3",pulse=True,size=290,x=462,y=600,tickFrom="but#2",tickTo="do"),chair("a3",240),
 card("a3",130,"THE COUNTDOWN.","countdown",size=60,h=130,bg="#ffd21f",until="everyone"),
 card("a3",130,"EVERYONE IS QUIET.","everyone",size=52,h=130,until="everyone#2"),
 card("a3",130,"EVERYONE IS CHECKING THEIR PHONE.","everyone#2",size=40,h=130,until="nobody"),
 card("a3",130,"NOBODY SAYS IT OUT LOUD.","nobody",size=48,h=130,until="waiting#2"),
 card("a3",130,"STILL A WAITING ROOM?","waiting#2",size=52,h=130,until="notice"),
 card("a3",130,"OR NOTICE PERIOD?","notice",size=56,h=130,bg=RED,color="#fff"),
 dev("a3",250,1.4,y=1450,sit="chair",mood="worry",sweat=True),
 prop("a3","itsil",570,1.4,"everyone",opts=dict(c="#5a6a86",v=1),enter="pop",y=1450),prop("a3","itsil",880,1.4,"quiet",opts=dict(c="#7a6a8a",v=2),enter="pop",y=1450)]
# a4: what I can control
it+=[back("a4","itwait",era="2026"),shade("a4",.42,until="use#2"),clock("a4"),chair("a4",240),
 dict(act="a4",type="clockface",x=475,y=814,size=210,at=0,pulse=False) if False else clock("a4"),
 rect("a4",60,980,700,700,"use#2","rgba(255,226,140,.35)","",10,radius=350,bw=0,flat=True),
 card("a4",130,"WHAT I CAN CONTROL","do",size=52,h=130,bg="#ffd21f",until="use#2"),
 card("a4",130,"USE THE TIME.","use#2",size=60,h=130,until="learn"),
 card("a4",130,"LEARN ONE THING EVERY WEEK","learn",size=44,h=130,until="skills#2"),
 card("a4",130,"SKILLS MOVE WITH YOU","skills#2",size=52,h=130,bg="#62f0c8"),
 card("a4",262,"LEARN","learn",size=50,h=80,x=520,w=520,bg="#62f0c8"),card("a4",352,"BUILD","only",size=50,h=80,x=520,w=520,bg="#ffe27a"),card("a4",442,"SHARE","next#3",size=50,h=80,x=520,w=520,bg="#cfe8ff"),
 dev("a4",250,1.4,y=1450,sit="chair",mood="smile"),
 prop("a4","itlaptop",520,0.9,"use#2",opts=dict(glow="#ffd978",screen="#fff8d8"),enter="pop",y=1430)]
# a5: stands up and walks out, the room a little lighter
it+=[back("a5","itwait",era="2026",wall="#7ba3bf"),clock("a5"),chair("a5",240),chair("a5",570),
 card("a5",130,"THE BENCH DID NOT CHANGE.","bench#4",size=48,h=130,until="confidence"),
 card("a5",130,"THE CONFIDENCE DID.","confidence",size=56,h=130,bg="#62f0c8",until="what"),
 card("a5",130,"WHAT DID YOU DO WITH YOUR BENCH TIME?","what",size=38,h=130,bg="#ffd21f"),
 dict(dev("a5",250,1.6,mood="smile"),move=dict(x=760,dur=4.2,at="confidence")),
 dict(prop("a5","itlaptop",330,0.45,0,opts=dict(),enter="none",y=1230,bob=.2),move=dict(x=880,dur=4.2,at="confidence"))]
spec=dict(kitFile="../../kits/it-life.json",tail=3.2,kit=dict(caption=dict(y=1475,size=66)),acts=acts,items=it)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
