import sys; import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
AMB,TEAL,INK="#F2A33A","#1F9CA8","#14263d"
def room(act,at=0,**o): return dict(act=act,type="prop",id="itroom",x=540,y=1285,scale=1.08,enter="none",at=at,opts=o,qa=False)
def dev(act,x,sc,at=0,enter="none",**o): return dict(act=act,type="prop",id="itdev",x=x,y=1285,scale=sc,enter=enter,at=at,opts=o,bob=.5)
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=150,x=60,w=960,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
acts=[A("hook",None,"cream"),
 A("a1","no-0.1","navy","zoom"),
 A("a2","already-0.3","slate","shutters"),
 A("a3","so-0.1","navy","push"),
 A("a4","open-0.3","slate","wipe-left"),
 A("a5","join-0.2","navy","iris"),
 A("a6","team#2-0.1","slate","cut"),
 A("a7","in#2-0.1","cream","wipe-left"),
 A("a8","so#2-0.1","navy","push"),
 A("a9","tell-0.1","cream","iris")]
it=[]
# hook
it+=[room("hook",h=4,m=45),
 card("hook",250,"FRIDAY 4:45 PM","friday",size=64,h=150),
 prop("hook","itlaptop",780,0.8,0,opts={},enter="none",y=1190,bob=.2),
 dev("hook",290,1.3,mood="flat"),
 card("hook",470,"QUICK SYNC","title",size=64,bg="#ffd21f",h=140,x=190,w=700,rot=-3)]
# a1 the invite
it+=[card("a1",260,"NO AGENDA.<br>NO DESCRIPTION.","description",size=56,h=240),
 card("a1",540,"QUICK SYNC · FRI 4:45","no",size=44,bg="#cfe8ff",h=100),
 dict(act="a1",type="prop",id="itcall",x=540,y=1180,scale=1.0,enter="pop",at="agenda",opts={},bob=.2)]
# a2 storm
it+=[room("a2",h=4,m=50,wall="#cfd8e3",sky="#51607d",sun=False,desk="#8a6b4a",note="FRIDAY"),
 dict(act="a2",type="prop",id="itcloud",x=540,y=700,scale=1.4,enter="pop",at="storm",opts={},bob=.5),
 dev("a2",540,1.25,mood="worry",sweat=True),
 card("a2",260,"NOT GOING TO BE QUICK","quick" if False else "going",size=52,h=130)]
# a3 guessing
it+=[room("a3",h=6,m=15,wall="#cfd8e3",sky="#2b3f63",sun=False,night=True,desk="#8a6b4a",note="FRIDAY"),
 card("a3",250,"QUICK = 90 MINUTES","game",size=60,h=130,bg="#ffd21f"),
 rect("a3",40,700,540,120,"production","#fff","PRODUCTION ISSUE?",40,radius=60),
 rect("a3",500,840,540,120,"deadline","#fff","NEW DEADLINE?",44,radius=60),
 rect("a3",40,980,540,120,"reorganization","#ffd9d9","REORG?",56,radius=60),
 dev("a3",780,1.0,mood="worry")]
# a4 emails
it+=[room("a4",h=6,m=20,wall="#cfd8e3",sky="#2b3f63",sun=False,night=True,desk="#8a6b4a",note="FRIDAY"),
 card("a4",250,"EVERY EMAIL. JUST IN CASE.","email",size=48,h=130),
 rect("a4",40,760,660,100,"week","#fff","RE: SPRINT NOTES",40),rect("a4",40,880,660,100,"last","#fff","FWD: LAST WEEK'S STATUS",40),rect("a4",40,1000,660,100,"just","#fff","FW: FW: DEPLOY PLAN",40),
 dev("a4",830,1.2,mood="worry",sweat=True)]
# a5 call
it+=[dict(act="a5",type="prop",id="itcall",x=540,y=1090,scale=1.0,enter="none",at=0,opts=dict(tiles=[dict(c="#bfe6ea",f="smile"),dict(c="#f9e0b0",f="smile"),dict(c="#d9d2f0",f="smile"),dict(c="#ffd9d9",f="smile")]),bob=.2),
 card("a5",250,"EVERYONE IS SMILING","smiling",size=52,h=120),
 card("a5",1130,"SLIDE: TEAM LUNCH DATE","date",size=48,h=130,bg="#ffd21f")]
# a6 twist
it+=[room("a6",h=6,m=50,wall="#cfd8e3",sky="#2b3f63",sun=False,night=True,desk="#8a6b4a",note="FRIDAY"),dev("a6",540,1.5,mood="shock"),
 card("a6",260,"TEAM LUNCH?!","lunch#2",size=80,h=190,bg="#ffd21f",rot=-3,x=140,w=800),
 card("a6",520,"MY HEART WAS RACING","racing",size=44,h=110)]
# a7 split
it+=[card("a7",150,"THEN VS NOW","two",size=64,h=130,bg="#ffd21f",x=240,w=600),rect("a7",40,300,500,200,"fifteen",AMB,"2015",130,color="#fff"),rect("a7",40,520,500,420,"production#2" if False else "issue#2","#fff","QUICK SYNC = PRODUCTION ISSUE",52,color=INK),
 rect("a7",560,300,480,200,"twentysix",TEAL,"2026",130,color="#fff"),rect("a7",560,520,480,420,"reorg","#fff","QUICK SYNC = MAYBE A REORG",52,color=INK)]
# a8 small fear
it+=[room("a8",h=6,m=30,wall="#cfd8e3",sky="#2b3f63",sun=False,night=True,desk="#8a6b4a",note="FRIDAY"),
 card("a8",250,"A SMALL FEAR IN EVERY INVITE","fear",size=44,h=130),
 rect("a8",40,780,540,100,"every#2","#fff","DESIGN REVIEW",42),rect("a8",40,900,540,100,"invite#2","#fff","BIRTHDAY CAKE",42),rect("a8",40,1020,540,100,"harmless","#fff","TEAM PHOTO",42),
 dev("a8",830,1.1,mood="worry")]
# a9 end
it+=[room("a9",h=4,m=45),
 card("a9",250,"YOUR WORST QUICK SYNC?","worst",size=48,h=130),
 prop("a9","itlaptop",780,0.8,"turn",opts=dict(lines=False,screen="#26334a"),enter="none",y=1190,bob=.2),
 dev("a9",290,1.3,mood="smile"),
 card("a9",420,"DID IT TURN OUT TO BE LUNCH?","turn",size=40,h=120,bg="#ffd21f")]
spec=dict(kitFile="../../kits/it-life.json",tail=3.0,kit=dict(caption=dict(y=1322)),acts=acts,items=it)
spec=restage(spec)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
