import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL,RED="#F2A33A","#1F9CA8","#e0543a"
def back(act,id,**o): return dict(act=act,type="prop",id=id,x=540,y=1430,scale=1.08,enter="none",at=0,opts=o,qa=False)
def dev(act,x,sc=1.3,at=0,enter="none",y=1400,**o): return dict(act=act,type="prop",id="itdev",x=x,y=y,scale=sc,enter=enter,at=at,opts=o,bob=.5)
def pal(act,x,kind,sc=1.3,at=0,enter="none",y=1400,**o): return dict(act=act,type="prop",id="itpal",x=x,y=y,scale=sc,enter=enter,at=at,opts=dict(kind=kind,**o),bob=.5)
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=130,x=60,w=960,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
NODES=["BUILD","UNIT","API","UI","SECURITY","DEPLOY"]
acts=[A("hook",None,"cream"),A("a1","green-0.1","cream","wipe-left"),A("a2","now-0.1","navy","iris"),A("a3","but-0.1","navy","cut"),
 A("a4","another-0.4","navy","push"),A("a5","so-0.1","cream","zoom")]
it=[]
# hook: the 2015 sheet
it+=[card("hook",120,"2015: 200 TEST CASES","two",size=60,h=130,x=100,w=880),
 dict(act="hook",type="cells",x=40,y=300,w=1000,h=1040,cols=4,rows=13,gap=5,at=0.4,dur=5.0,seed=3,labels=True,lsize=36)]
# a1: the tester clicks, dev hopes
it+=[back("a1","itqa"),
 dict(act="a1",type="cells",x=556,y=708,w=384,h=290,cols=6,rows=6,gap=4,at="green",dur=6.0,heal="turn",seed=5),
 card("a1",250,"GREEN: PASS","green",size=40,h=100,x=30,w=330,bg="#62f0c8"),card("a1",250,"RED: FAIL","red",size=40,h=100,x=375,w=330,bg="#ff9a8a"),card("a1",250,"YELLOW: UNSURE","yellow",size=36,h=100,x=720,w=330,bg="#ffe27a"),
 card("a1",250,"A TESTER. TWO DAYS. EVERY SCREEN.","tester",size=40,h=120,x=30,w=1020),
 card("a1",250,"\"LOOK. I CLICKED HERE, AND IT BROKE.\"","look",size=40,h=120,x=30,w=1020),
 pal("a1",250,"tester",1.3,pose="point",mood="smile"),
 dev("a1",470,1.25,mood="worry"),
 prop("a1","itcoffee",560,1.0,"coffee",opts=dict(),enter="pop",y=1170),
 dict(act="a1",type="steam",x=560,y=1100,at="coffee",n=4,h=70),
 card("a1",250,"HOPING THE YELLOW TURNS GREEN","hoping",size=38,h=120,x=30,w=1020,bg="#ffe27a",until="when")]
# fix legend/center card lifetimes
for i_ in it:
    if i_.get("text")=="A TESTER. TWO DAYS. EVERY SCREEN.": i_["until"]="hoping"
    if i_.get("text") in ("GREEN: PASS","RED: FAIL","YELLOW: UNSURE"): i_["until"]="tester"
# a2: 2026 pipeline
it+=[back("a2","itdash"),dict(act="a2",type="clockspin",x=540,y=900,size=460,at="now",dur=1.3),
 dict(act="a2",type="pipeline",x=60,y=625,w=960,h=320,gapY=44,gapX=60,nodes=NODES,cols=3,at="pipeline",**{"pass":["runs","runs+0.5","checks","checks+0.5","minutes","minutes+0.5"]},size=44),
 card("a2",250,"2026: THE PIPELINE","thousand#2",size=56,h=130,until="checks"),
 card("a2",250,"200 CHECKS · A FEW MINUTES","checks",size=46,h=130,until="no"),
 card("a2",250,"NO SHEET. NO WAITING.","no",size=52,h=130,until="big"),
 card("a2",250,"A BIG IMPROVEMENT","big",size=52,h=130,bg="#62f0c8"),
 dev("a2",230,1.1,mood="smile")]
# a3: one check fails, empty chair
it+=[back("a3","itdash"),
 dict(act="a3",type="pipeline",x=60,y=625,w=960,h=320,gapY=44,gapX=60,nodes=NODES,cols=3,at="but",**{"pass":["but","but+0.3","but+0.6",None,None,None]},fail=3,failAt="fails",size=44),
 dict(act="a3",type="hit",at="fails",shake=.45,flash=.3),
 card("a3",250,"ONE CHECK FAILS","check",size=52,h=130,until="failed"),
 card("a3",250,"BUILD FAILED.","failed",size=64,h=140,bg=RED,color="#fff",until="face"),
 card("a3",250,"NO FACE. NO EXPLANATION.","face",size=48,h=130,until="just"),
 card("a3",250,"JUST A RED BOX.","just",size=56,h=130,bg=RED,color="#fff"),
 card("a3",440,"MY CODE?","code",size=44,h=110,x=240,w=600,until="test",bg="#ffe27a"),
 card("a3",440,"THE TEST?","test",size=44,h=110,x=240,w=600,until="environment",bg="#ffe27a"),
 card("a3",440,"THE ENVIRONMENT?","environment",size=44,h=110,x=240,w=600,bg="#ffe27a"),
 dev("a3",400,1.1,mood="worry",sweat=True),
 prop("a3","itchair",820,1.5,"nobody",opts=dict(color="#9fb0c4"),enter="pop",y=1400)]
# a4: everything passes
it+=[back("a4","itdash"),
 dict(act="a4",type="pipeline",x=60,y=625,w=960,h=320,gapY=44,gapX=60,nodes=NODES,cols=3,at="another",**{"pass":["another+0.3","another+0.5","another+0.7","another+0.9","everything","everything+0.3"]},size=44),
 card("a4",250,"EVERYTHING PASSES","everything",size=52,h=130,bg="#62f0c8",until="passing"),
 card("a4",250,"PASSING ≠ CORRECT","passing",size=56,h=130,bg="#ffd21f"),
 prop("a4","itmag",640,2.0,"proves",opts=dict(),enter="pop",y=1050,bob=.8),
 card("a4",1180,"WHAT WE THOUGHT OF","thought",size=48,h=110,x=100,w=880),
 card("a4",1310,"NOT WHAT WE FORGOT","forgot",size=48,h=110,x=100,w=880,bg=RED,color="#fff")]
# a5: the choice
it+=[card("a5",120,"WHICH ONE DID YOU PREFER?","which",size=46,h=130,bg="#ffd21f"),
 rect("a5",30,300,500,960,"so",AMB,"",10,radius=36),rect("a5",550,300,500,960,"so",TEAL,"",10,radius=36),
 card("a5",330,"THE SHEET + A PERSON","sheet",size=34,h=100,x=50,w=460,bg="#fff"),card("a5",330,"THE PIPELINE + A RED BOX","pipeline",size=32,h=100,x=570,w=460,bg="#fff"),
 dict(act="a5",type="cells",x=60,y=460,w=440,h=260,cols=6,rows=4,gap=4,at=0,dur=.2,heal=0,seed=9),
 pal("a5",270,"tester",1.15,pose="point",mood="smile",y=1230),
 rect("a5",590,470,420,230,"pipeline",RED,"FAILED",74,color="#fff",radius=28),
 dev("a5",800,1.15,mood="worry",y=1230)]
spec=dict(kitFile="../../kits/it-life.json",tail=3.0,kit=dict(caption=dict(y=1475)),acts=acts,items=it)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
