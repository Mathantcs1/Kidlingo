import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL="#F2A33A","#1F9CA8"
def back(act,id,frm=None,dur=1.3,**o):
    d=dict(act=act,type="prop",id=id,x=540,y=1285,scale=1.08,enter="none",at=0,opts=o,qa=False)
    if frm: d["zoom"]={"from":frm,"dur":dur}
    return d
def pal(act,x,sc,kind,at=0,enter="none",y=1285,fl=0,**o):
    d=dict(act=act,type="prop",id="itpal",x=x,y=y,scale=sc,enter=enter,at=at,opts=dict(kind=kind,**o),bob=.9)
    if fl: d["float"]=fl
    return d
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=150,x=60,w=960,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
acts=[A("hook",None,"cream"),
 A("a1","the-0.1","cream","wipe-left"),
 A("a2","now-0.1","navy","iris"),
 A("a3","in#3-0.1","navy","push"),
 A("a4","teach-0.5","mint","wipe-up"),
 A("a5","he#3-0.1","violet","iris"),
 A("a6","tell-0.1","sunset","zoom")]
it=[]
# hook: 2015 office, fresher walks in at the door
it+=[back("hook","itoffice",era="2015"),
 card("hook",250,"DAY ONE: 2015","day",size=60,h=140,until="senior"),
 card("hook",250,"\"COME, I WILL SHOW YOU EVERYTHING\"","come",size=40,h=140),
 dict(pal("hook",130,1.1,"fresher",mood="grin"),move=dict(x=360,dur=2.8)),
 pal("hook",740,1.1,"senior",pose="pat",mood="smile"),prop("hook","itchair",880,1.1,0,opts=dict(),enter="none",y=1285)]
# a1: push-in on the desk, senior teaches, fresher writes
it+=[back("a1","itoffice",1.5,1.4,era="2015"),
 card("a1",250,"SENIOR TEACHES. FRESHER LISTENS.","senior#2",size=40,h=140),
 pal("a1",240,1.1,"senior",pose="point",mood="smile",fl=5),
 pal("a1",560,1.1,"fresher",pose="hold",mood="smile",fl=7),
 prop("a1","itcoffee",870,0.8,0,opts=dict(),enter="none",y=831,bob=.2),
 prop("a1","itnotebook",660,0.7,"notebook",enter="pop",y=1000),
 rect("a1",600,520,440,100,"code","#fff","</> THE CODE",40),rect("a1",600,640,440,100,"shortcuts","#fff","SHORTCUTS",40),rect("a1",600,760,440,100,"questions","#ffd21f","WHICH QUESTIONS TO ASK",34)]
# a2: 2026, fresher with glowing laptop walks in, senior with tea
it+=[back("a2","itoffice",era="2026"),dict(act="a2",type="clockspin",x=540,y=900,size=460,at="now",dur=1.3),
 card("a2",250,"DAY ONE: 2026","thousand#2",size=60,h=140,until="another"),
 card("a2",250,"FIVE TOOLS I HAVEN'T OPENED","five",size=44,h=140),
 dict(pal("a2",900,1.1,"fresher",pose="hold",mood="grin"),move=dict(x=330,dur=3.0)),
 dict(prop("a2","itlaptop",980,0.6,0,opts=dict(glow="#2ee6d0",screen="#1F9CA8"),enter="none",y=1130,bob=.3),move=dict(x=440,dur=3.0)),
 pal("a2",740,1.1,"senior",pose="mug",mug=True,mood="curious")]
for i,(k,w) in enumerate(zip(["gear","chat","cloud","branch","term"],["five","tools","tools+0.25","i+0.0","not"])):
    it.append(prop("a2","itbadge",190+i*175,0.7,["five","tools","tools+0.3","not","opened"][i],opts=dict(kind=k),enter="drop",y=720))
# a3: laptop close-up, ticks
it+=[back("a3","itplain",wall="#12304a",floor="#1c4d6b"),
 card("a3",250,"10 MINUTES  vs  A WEEK","ten",size=52,h=140),
 prop("a3","itlaptop",540,1.2,"minutes",opts=dict(glow="#2ee6d0",screen="#1F9CA8"),enter="pop",y=1180),
 prop("a3","itcheck",440,0.9,"minutes",enter="pop",y=980),prop("a3","itcheck",540,0.9,"tool",enter="pop",y=980),prop("a3","itcheck",640,0.9,"week",enter="pop",y=980),
 pal("a3",290,1.0,"fresher",pose="point",mood="grin"),pal("a3",790,1.0,"senior",pose="rest",mood="curious")]
# a4: tea corner, whispers
it+=[back("a4","itpantry"),
 card("a4",480,"HOW TO READ A MEETING","read",size=38,h=90,x=40,w=520,bg="#fff"),
 card("a4",570,"WHO TO COPY ON AN EMAIL","copy",size=38,h=90,x=520,w=520,bg="#ffd21f"),
 card("a4",660,"HOW TO SAY NO POLITELY","no",size=38,h=90,x=520,w=520,bg="#fff"),
 card("a4",750,"WHAT NOT TO SAY ON A CLIENT CALL","client",size=34,h=90,x=40,w=560,bg="#ffd21f"),
 pal("a4",330,1.1,"fresher",pose="rest",mood="curious"),pal("a4",700,1.1,"senior",pose="point",mood="smile")]
# a5: puzzle
it+=[back("a5","itplain"),
 card("a5",250,"DIFFERENT STRENGTHS","gives",size=52,h=140),
 card("a5",410,"TOOLS","tools#2",size=44,h=100,x=60,w=420,bg=AMB,color="#fff"),card("a5",410,"SURVIVAL GUIDE","guide",size=40,h=100,x=560,w=460,bg=TEAL,color="#fff"),
 pal("a5",250,1.0,"fresher",pose="hold",mood="smile"),pal("a5",830,1.0,"senior",pose="hold",mood="smile",flip=True),
 dict(prop("a5","itpuzzle",320,1.0,0,opts=dict(side="left"),enter="none",y=1000,bob=.4),move=dict(x=425,dur=.9,at="fair")),
 dict(prop("a5","itpuzzle",760,1.0,0,opts=dict(side="right"),enter="none",y=1000,bob=.4),move=dict(x=654,dur=.9,at="fair"))]
# a6: fist bump + heart
it+=[back("a6","itplain",wall="#ffe9d2",floor="#f3c9a0"),
 card("a6",250,"WHO TAUGHT YOU SOMETHING THIS YEAR?","who",size=40,h=150),
 pal("a6",400,1.1,"fresher",pose="fist",mood="grin"),pal("a6",680,1.1,"senior",pose="fist",mood="grin",flip=True),
 prop("a6","itheart",540,1.3,"year",opts=dict(),enter="pop",y=760,bob=1.2)]
spec=dict(kitFile="../../kits/it-life.json",tail=3.2,kit=dict(caption=dict(y=1322)),acts=acts,items=it)
spec=restage(spec)
# steam from the senior's mug (a2) and the kettle (a4), after restage so positions match the final scale
for i in spec["items"]:
    if i["act"]=="a2" and i.get("id")=="itpal" and i["opts"].get("mug"):
        s=i["scale"]; spec["items"].append(dict(act="a2",type="steam",x=round(i["x"]+46*s+10),y=round(i["y"]-262*s),at=0,n=5,h=120))
spec["items"].append(dict(act="a4",type="steam",x=736,y=850,at=0,n=6,h=140))
spec["items"].append(dict(act="a1",type="steam",x=936,y=790,at=0,n=4,h=80))
spec["items"].append(dict(act="a6",type="steam",x=540,y=1000,at=0,n=7,h=230,c="rgba(255,255,255,.8)"))
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
