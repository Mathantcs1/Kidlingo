import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL,RED="#F2A33A","#1F9CA8","#e0543a"
def back(act,id,sc=1.2,**o): return dict(act=act,type="prop",id=id,x=540,y=1430,scale=sc,enter="none",at=0,opts=o,qa=False)
def dev(act,x,sc=1.5,at=0,enter="none",y=1440,until=None,gest=None,**o):
    d=dict(act=act,type="prop",id="itdev",x=x,y=y,scale=sc,enter=enter,at=at,opts=o,bob=0)
    if until: d["until"]=until
    if gest: d["gest"]=gest
    return d
def card(act,y,text,at,size=52,bg="#fff",color=INK,h=130,x=40,w=1000,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
def door(act,x,sc,at,c,enter="none",y=1440,until=None,**o):
    d=dict(act=act,type="prop",id="itdoor",x=x,y=y,scale=sc,enter=enter,at=at,opts=dict(c=c,**o),qa=False)
    if until: d["until"]=until
    return d
acts=[A("hook",None,"night"),A("a1","In","cream","whip-left"),A("a2","Now-0.05","navy","push-in"),A("a3","used-0.3","violet","tilt-up"),A("a4","Tell-0.1","sunset","whip-right")]
it=[]
# hook: the verdict first
it+=[back("hook","itplain",wall="#2a1d3a",floor="#3c2c52"),
 card("hook",130,"6 ROUNDS. 200 PEOPLE.","Six",size=60,bg="#ffd21f"),
 door("hook",190,1.5,"Six",TEAL),
 dev("hook",520,1.6,mood="sad",sweat=True,gest=[dict(at="email+0.4",kind="shake",dur=1.6),dict(at="email+2.4",kind="shrug",dur=1.2)])]
for i in range(6): it.append(prop("hook","itlock",190,.8,"Six+%.2f"%(.08*i),enter="pop",y=760+i*100,qa=False))
for i in range(5): it.append(dict(act="hook",type="prop",id="itdev",x=1300,y=1440,scale=.95,enter="none",at="hundred+%.2f"%(.12*i),opts=dict(hood="#5a6a86",mood="flat"),bob=0,qa=False,phase=i*1.3,move=dict(x=700+i*68,dur=1.1,at="hundred+%.2f"%(.12*i))))
it+=[rect("hook",40,320,1000,300,"email","#fff","✉  “We have decided to move forward with other candidates.”",48,radius=24,bw=6,enter="pop")]
# a1: 2015, two engineers and a sketch
it+=[back("a1","itplain",wall="#f6dfb0",floor="#c7803c"),
 card("a1",130,"2015: ONE ROUND. MAYBE TWO.","In",size=52,bg=AMB,until="We#2"),
 card("a1",130,"TWO ENGINEERS. ONE CONVERSATION.","We#2",size=44,until="If"),
 card("a1",130,"KNOW YOUR WORK = A REAL CHANCE.","If",size=44,bg="#ffd21f"),
 rect("a1",330,1235,420,34,"In","#8a5a2c","",10,radius=6,enter="none"),
 prop("a1","itpaper",540,1.1,"design",enter="pop",y=1245,qa=False),
 dev("a1",230,1.5,mood="smile",gest=[dict(at="design",kind="point",dur=1.4),dict(at="Can+0.5",kind="cheer",dur=1.2)]),
 dict(act="a1",type="prop",id="itdev",x=850,y=1440,scale=1.5,enter="none",at=0,opts=dict(tie="#e0543a",tall=1.12,mood="smile"),bob=0,gest=[dict(at="projects",kind="nod",dur=1.0),dict(at="Can",kind="wave",dur=1.6)]),
 rect("a1",470,640,560,150,"Can","#fff","“CAN YOU JOIN IN TWO WEEKS?”",42,radius=40,bw=5)]
# a2: 2026, the door gets locks
LAB=["ONLINE TEST","CODING ROUND","SYSTEM DESIGN","BEHAVIORAL","TAKE-HOME TASK","CULTURE FIT"]; KEY=["online","coding","system","behavioral","takehome","culture"]
it+=[back("a2","itplain",wall="#10243a",floor="#1c3550"),
 card("a2",130,"2026. SAME DOOR.","Same",size=60,bg=TEAL,color="#fff"),
 door("a2",270,1.6,"Now",TEAL,enter="none"),
 dev("a2",840,1.3,mood="worry",sweat=True,gest=[dict(at="culture+0.3",kind="shrug",dur=1.4)]),
 dict(act="a2",type="clockspin",x=540,y=760,size=300,at="Now+0.15",dur=1.2)]
for i,(l,k) in enumerate(zip(LAB,KEY)):
    it.append(prop("a2","itlock",270,.9,k,enter="pop",y=760+i*100,qa=False))
    it.append(rect("a2",540,330+i*105,500,90,k,"#fff",l,44,radius=45,bw=5))
# a3: I did not get worse
it+=[back("a3","itplain",wall="#e8e4f5",floor="#c9c2e6"),
 card("a3",130,"MAYBE I GOT WORSE?","think",size=56,until="But"),
 card("a3",130,"I DID NOT GET WORSE.","But",size=56,bg="#62f0c8",until="door#2"),
 card("a3",130,"THE DOOR GOT NARROWER.","door#2",size=52,bg="#ffb0a0",until="preparing"),
 card("a3",130,"BETTER AT EXPLAINING MY WORK.","preparing",size=44,bg="#ffd21f"),
 dev("a3",250,1.5,mood="sad",sweat=True,until="But",gest=[dict(at="worse",kind="shake",dur=1.4)]),
 dev("a3",250,1.5,at="But",mood="smile",gest=[dict(at="But+0.2",kind="nod",dur=1.2),dict(at="explaining",kind="point",dur=1.6)]),
 dict(act="a3",type="typing",x=40,y=620,w=580,h=110,text="WHAT I LEARNED",at="think",dur=1.3,size=46),
 door("a3",850,1.2,0,TEAL,until="narrower"),
 door("a3",850,1.2,"narrower",TEAL,enter="pop",w=170),
 prop("a3","itpaper",560,1.0,"explaining",enter="pop",y=1330,qa=False)]
# a4: ready for the next knock
it+=[back("a4","itplain",wall="#ffe9d2",floor="#f3c9a0"),
 card("a4",130,"HOW MANY ROUNDS WAS YOUR LONGEST?","Tell",size=40,bg="#ffd21f"),
 door("a4",790,1.4,"Tell",TEAL,enter="pop"),
 dev("a4",-150,1.5,mood="smile",raise_=False,gest=[dict(at="Tell+2.5",kind="wave",dur=1.6)])]
it[-1]["move"]=dict(x=320,dur=1.3,at="Tell"); it[-1]["opts"]["mood"]="smile"
for i in it:
    if i.get("opts") and "raise_" in i["opts"]: i["opts"].pop("raise_")
it=[i for i in it if not (i.get("type")=="rect" and i.get("y")==130)]+[i for i in it if i.get("type")=="rect" and i.get("y")==130]
spec=dict(kitFile="../../kits/it-life.json",tail=3.2,kit=dict(caption=dict(y=1475,size=66)),acts=acts,items=it)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
