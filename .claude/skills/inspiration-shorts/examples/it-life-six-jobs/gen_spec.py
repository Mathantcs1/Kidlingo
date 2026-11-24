import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL,RED="#F2A33A","#1F9CA8","#e0543a"
def back(act,id,sc=1.2,**o): return dict(act=act,type="prop",id=id,x=540,y=1430,scale=sc,enter="none",at=0,opts=o,qa=False)
def dev(act,x,sc=1.3,at=0,enter="none",y=1440,fl=0,qa=True,**o):
    d=dict(act=act,type="prop",id="itdev",x=x,y=y,scale=sc,enter=enter,at=at,opts=o,bob=.6)
    if fl: d["float"]=fl
    if not qa: d["qa"]=False
    return d
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=120,x=40,w=1000,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
def hat(act,x,y,sc,kind,c,at,enter="drop",**k): return prop(act,"ithat",x,sc,at,opts=dict(kind=kind,c=c),enter=enter,y=y,bob=k.pop("bob",.6),**k)
HEAD=lambda y,s: round(y-398*s+10)
acts=[A("hook",None,"cream"),A("a1","one#2-0.1","mint","wipe-left"),A("a2","in#2-0.1","navy","iris"),A("a3","front-0.2","night","push"),
 A("a4","but-0.1","violet","zoom"),A("a5","tell-0.1","sunset","iris")]
it=[]
# hook: business card, one tiny hat
it+=[back("hook","itplain",wall="#f6dfb0",floor="#c7803c"),
 card("hook",130,"2015: DEVELOPER","step" if False else "two",size=60,h=130,x=140,w=800),
 rect("hook",90,420,900,420,"title","#fffaf0","",10,radius=14,rot=-3,enter="pop"),rect("hook",110,440,26,380,"title",AMB,"",10,radius=8,rot=-3,enter="pop",bw=3,flat=True),rect("hook",150,500,820,170,"title","rgba(0,0,0,0)","Developer",130,radius=0,rot=-3,bw=0,flat=True,enter="pop"),rect("hook",160,700,800,80,"title","rgba(0,0,0,0)","YOUR NAME · YOUR COMPANY",42,radius=0,rot=-3,bw=0,flat=True,color="#5a6a86",enter="pop"),
 dev("hook",830,1.5,mood="smile"),hat("hook",830,HEAD(1440,1.5),0.6,"cap","#2f6fd6","title",enter="pop")]
# a1: depth, one platform
it+=[back("a1","itplain",wall="#bfe6ff",floor="#8fd18a"),
 card("a1",130,"ONE PLATFORM.","one#2",size=56,h=130,until="people"),
 card("a1",130,"PEOPLE CAME TO ME.","people",size=56,h=130,until="depth"),
 card("a1",130,"DEPTH WAS THE CAREER PLAN.","depth",size=46,h=130,until="good"),
 card("a1",130,"GOOD AT ONE THING = SAFE","good",size=48,h=130,bg="#62f0c8"),
 prop("a1","ittower",830,1.5,"one#2",opts=dict(label="PLATFORM"),enter="rise",y=1420),
 dev("a1",540,1.6,mood="smile",fl=3,qa=False),
 dict(act="a1",type="prop",id="itpal",x=-120,y=1440,scale=1.5,enter="none",at=0,qa=False,opts=dict(kind="fresher",mood="curious"),bob=.8,move=dict(x=140,dur=1.8,at="people")),
 dict(act="a1",type="prop",id="itpal",x=-120,y=1440,scale=1.5,enter="none",at=0,qa=False,opts=dict(kind="tester",mood="curious"),bob=.8,move=dict(x=330,dur=2.0,at="exactly")),
 rect("a1",70,640,160,130,"came","#fff","?",96,radius=65,until="knew"),
 rect("a1",270,640,160,130,"exactly","#fff","?",96,radius=65,until="knew"),
 rect("a1",440,520,190,140,"knew","#62f0c8","✓",100,radius=70)]
# a2: still Developer, 2026
it+=[back("a2","itplain",wall="#12304a",floor="#1c4d6b"),card("a2",130,"2026: DEVELOPER","in#2",size=60,h=130,x=140,w=800,until="title#3"),
 card("a2",130,"THE TITLE DID NOT CHANGE.","title#3",size=46,h=130,until="job#3"),
 card("a2",130,"THE JOB DID.","job#3",size=60,h=130,bg="#ffd21f"),
 rect("a2",90,420,900,420,"thousand#2",TEAL,"",10,radius=14,rot=3,enter="pop"),rect("a2",110,440,26,380,"thousand#2","#ffd21f","",10,radius=8,rot=3,enter="pop",bw=3,flat=True),rect("a2",150,500,820,170,"thousand#2","rgba(0,0,0,0)","Developer",130,radius=0,rot=3,color="#fff",bw=0,flat=True,enter="pop"),rect("a2",160,700,800,80,"thousand#2","rgba(0,0,0,0)","YOUR NAME · YOUR COMPANY",42,radius=0,rot=3,color="#cfe8ff",bw=0,flat=True,enter="pop"),
 dict(act="a2",type="clockspin",x=540,y=800,size=460,at="in#2",dur=1.3),
 dev("a2",830,1.5,mood="flat"),hat("a2",830,HEAD(1440,1.5),0.6,"cap","#2f6fd6",0,enter="none")]
# a3: the hats
KINDS=[("cap","#2f6fd6","FRONT END","front"),("hard","#F2A33A","BACK END","back"),("db","#3ec97a","DATABASE","database"),("cloud","#cfe8ff","CLOUD","cloud"),("pipe","#a06bff","PIPELINES","pipelines"),("shield","#e0543a","SECURITY","security"),("wizard","#1F9CA8","AI ON THE SIDE","ai")]
it+=[back("a3","itplain",wall="#10243a",floor="#1c3550"),
 card("a3",130,"ONE TITLE. SIX JOBS…","front",size=56,h=130,until="little"),
 card("a3",130,"…AND A LITTLE AI = SEVEN.","little",size=56,h=130,until="description"),
 card("a3",130,"ONE JOB DESCRIPTION. SEVEN JOBS.","description",size=42,h=130,bg="#ffd21f",until="ten"),
 card("a3",130,"JOB POST: TEN YEARS OF EXPERIENCE","ten",size=40,h=130,until="three"),
 card("a3",130,"IN A TECHNOLOGY THREE YEARS OLD.","three",size=40,h=130,bg=RED,color="#fff"),
 dev("a3",330,1.5,mood="worry",sweat=True)]
for i,(k,c,lab,w) in enumerate(KINDS):
    y=HEAD(1440,1.5)-i*80
    it.append(hat("a3",330,y,1.2,k,c,w,bob=.9+i*.12))
    it.append(rect("a3",540,y-104,510,82,w,"#fff",lab,48,radius=41))
it+=[rect("a3",600,1130,440,170,"post","#fffaf0","WANTED: 10 YRS EXPERIENCE (TECH IS 3 YRS OLD)",34,radius=8,rot=3,enter="pop") if False else rect("a3",600,1090,450,230,"ten","#fffaf0","WANTED:<br>10 YEARS EXPERIENCE<br>IN A 3-YEAR-OLD TECH",36,radius=8,rot=3,enter="pop")]
# a4: depth + a little wide
it+=[back("a4","itplain",wall="#e8e4f5",floor="#c9c2e6"),
 card("a4",130,"DEPTH DID NOT LOSE ITS VALUE.","depth#2",size=42,h=130,until="enough"),
 card("a4",130,"IT IS NOT ENOUGH ALONE.","enough",size=48,h=130,until="deep"),
 card("a4",130,"DEEP + A LITTLE WIDE","deep",size=56,h=130,bg="#62f0c8",until="depth#3"),
 card("a4",130,"DEPTH GOT ME HERE. BREADTH KEEPS ME HERE.","depth#3",size=34,h=130,bg="#ffd21f"),
 dev("a4",330,1.5,mood="smile")]
for i,(k,c,lab,w) in enumerate(KINDS):   # the hats fall away
    y=HEAD(1440,1.5)-i*80
    d=hat("a4",330,y,1.2,k,c,0,enter="none",until="but+%.2f"%(0.55+0.1*i))
    d["move"]=dict(y=1250,dur=.7,at="but+%.2f"%(0.05+0.1*i)); it.append(d)
it+=[hat("a4",330,HEAD(1440,1.5),2.0,"hard","#F2A33A","depth#2",enter="drop"),hat("a4",330,HEAD(1440,1.5)-185,0.95,"cap","#2f6fd6","wide",enter="drop"),
 rect("a4",560,520,440,90,"deep","#F2A33A","ONE DEEP SKILL",42,radius=45,color="#fff"),rect("a4",560,630,440,90,"wide","#2f6fd6","A WIDE BASE",42,radius=45,color="#fff")]
# a5: end, holding up the card
it+=[back("a5","itplain",wall="#ffe9d2",floor="#f3c9a0"),
 card("a5",130,"HOW MANY JOBS IS YOUR TITLE DOING?","tell",size=40,h=130,bg="#ffd21f"),
 dict(dev("a5",400,1.5,mood="smile"),opts={"mood":"smile","raise":True}),
 hat("a5",400,HEAD(1440,1.5),1.4,"hard","#F2A33A","tell",bob=1.0),hat("a5",400,HEAD(1440,1.5)-110,1.1,"cloud","#cfe8ff","tell+0.3",bob=1.0),hat("a5",400,HEAD(1440,1.5)-200,0.9,"wizard","#1F9CA8","tell+0.6",bob=1.0),
 rect("a5",580,820,460,260,"tell+0.2",TEAL,"Developer",70,radius=12,rot=-5,color="#fff",enter="pop")]
it=[i for i in it if not (i.get("type")=="rect" and i.get("y")==130)]+[i for i in it if i.get("type")=="rect" and i.get("y")==130]   # top cards always above hats
spec=dict(kitFile="../../kits/it-life.json",tail=3.2,kit=dict(caption=dict(y=1475,size=66)),acts=acts,items=it)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
