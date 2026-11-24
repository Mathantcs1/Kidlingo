import sys; import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; AMB,TEAL="#F2A33A","#1F9CA8"
def meet(act,era,at=0): return dict(act=act,type="prop",id="itmeet",x=540,y=1285,scale=1.08,enter="none",at=at,opts=dict(era=era),qa=False)
def scale(act,level,frm=1.6,dur=1.3,**o): return dict(act=act,type="prop",id="itscale",x=540,y=1285,scale=1.08,enter="none",at=0,opts=dict(level=level,**o),qa=False,zoom=dict(**{"from":frm,"dur":dur}))
def stars(act): return dict(act=act,type="starfield",at=0,n=80,h=1500,speed=46,shoot=3.6)
def planet(act,x,y,x1,y1,dur,sc=0.9,kind="earth",at=0): return dict(act=act,type="prop",id="itplanet",x=x,y=y,scale=sc,enter="none",at=at,opts=dict(kind=kind),move=dict(x=x1,y=y1,dur=dur),qa=False)
def dev(act,x,sc,at=0,enter="none",y=1285,fl=0,**o):
    d=dict(act=act,type="prop",id="itdev",x=x,y=y,scale=sc,enter=enter,at=at,opts=o,bob=.5)
    if fl: d["float"]=fl; d["rot"]=3
    return d
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=150,x=60,w=960,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
MGR=dict(hood="#e0a030",pocket="#b8801c",tie="#e0543a",tablet=True,tall=1.12,mood="flat")
acts=[A("hook",None,"cream"),
 A("a1","that-0.1","cream","wipe-left"),
 A("a2","now-0.1","navy","iris"),
 A("a3","sorry-0.1","slate","zoom"),
 A("a4","sorry#2-0.1","slate","zoom"),
 A("a5","sorry#3-0.1","navy","zoom"),
 A("a6","entire-0.1","navy","zoom"),
 A("a7","be-0.3","navy","wipe-up"),
 A("a8","so-0.1","navy","cut"),
 A("a9","tell-0.1","navy","iris")]
it=[]
it+=[meet("hook","2015"),card("hook",250,"APPRAISAL: 2015","two",size=60,h=140),
 dev("hook",290,1.25,mood="flat"),dev("hook",800,1.25,**dict(MGR,mood="flat")),
 card("hook",800,"\"FOCUS ON THE PROBLEM IN YOUR PROJECT\"","focus",size=40,h=130,x=40,w=1000,bg="#ffd21f") if False else card("hook",420,"FOCUS ON THE PROBLEM<br>IN YOUR PROJECT","focus",size=44,h=190,bg="#ffd21f")]
it+=[meet("a1","2015"),card("a1",250,"ONE PROJECT. ONE PROBLEM.","one#2",size=50,h=140),
 prop("a1","itfolder",480,1.0,"project",opts=dict(),enter="pop",y=1190),
 prop("a1","itbug",480,1.0,"problem#2",opts=dict(),enter="drop",y=960),
 dev("a1",290,1.25,mood="smile"),
 rect("a1",560,1010,480,100,"defect","#62f0c8","FIXED THE DEFECT",40,x=0) if False else rect("a1",620,800,420,100,"fixed","#62f0c8","FIXED THE DEFECT",38),
 rect("a1",620,920,420,100,"wrote","#62f0c8","WROTE NOTES",40),rect("a1",620,1040,420,100,"home","#62f0c8","HOME ON TIME",40)]
it+=[meet("a2","2026"),dict(act="a2",type="clockspin",x=540,y=900,size=460,at="now",dur=1.3),
 card("a2",250,"APPRAISAL: 2026","thousand#2",size=60,h=140,until="same"),
 card("a2",250,"SAME ROOM. SAME MANAGER.","same",size=46,h=140,until="but"),
 card("a2",250,"FOCUS ON THE COMPANY","focus#2",size=52,h=140,bg="#ffd21f"),
 dev("a2",290,1.25,mood="worry"),dev("a2",800,1.25,**dict(MGR,mood="flat"))]
it+=[scale("a3","building"),card("a3",250,"THE INDUSTRY","industry",size=64,h=150,bg="#ffd21f"),dev("a3",540,1.0,mood="worry")]
it+=[scale("a4","city"),card("a4",250,"THE MARKET","market",size=64,h=150,bg="#ffd21f"),dev("a4",540,1.0,mood="worry",sweat=True)]
it+=[scale("a5","planet"),card("a5",250,"SORRY...","sorry#3",size=64,h=150,bg="#ffd21f"),dev("a5",540,1.0,mood="sad",sweat=True)]
it+=[scale("a6","space",1.7,1.3,void=True),stars("a6"),planet("a6",850,520,780,560,7),planet("a6",120,380,950,300,9,1.0,"moon"),card("a6",250,"THE ENTIRE UNIVERSE","universe",size=56,h=150,bg="#ffd21f"),dev("a6",540,1.0,mood="sad",y=1200,fl=16),
 card("a6",620,"LAST YEAR: ONE BUG","last",size=48,h=130,x=140,w=800),prop("a6","itbug",820,0.9,"bug",opts=dict(),enter="pop",y=860)]
it+=[scale("a7","space",1.25,9,void=True),stars("a7"),planet("a7",780,560,700,600,8),planet("a7",950,330,120,420,9,1.0,"moon"),card("a7",250,"SAME MESSAGE. FROM ABOVE.","above",size=44,h=140),
 dev("a7",800,0.7,at="manager",enter="pop",y=760,fl=10,**dict(MGR,mood="smile")),
 dev("a7",400,1.0,mood="flat",y=1200,fl=16),
 rect("a7",40,470,420,90,"bigger","#fff","THINK BIGGER",40),rect("a7",40,570,420,90,"fewer","#fff","FEWER PEOPLE",40),rect("a7",40,670,420,90,"less","#fff","LESS TIME",40)]
it+=[scale("a8","space",1.25,9,void=True),stars("a8"),planet("a8",700,600,640,540,8),planet("a8",120,420,980,340,9,1.0,"moon"),dev("a8",540,1.25,mood="smile",y=1200,fl=16),
 prop("a8","itlaptop",540,0.7,0,opts=dict(),enter="none",y=1330) if False else prop("a8","itlaptop",300,0.8,0,opts=dict(),enter="none",y=1180,bob=.3),
 card("a8",250,"FIX MY BUG","fix",size=56,h=130,x=60,w=450),card("a8",250,"UNDERSTAND THE UNIVERSE","understand",size=36,h=130,x=530,w=490) if False else card("a8",410,"+ UNDERSTAND THE UNIVERSE","understand",size=42,h=130)]
it+=[scale("a9","space",1.2,9,void=True),stars("a9"),planet("a9",640,540,820,500,8),planet("a9",980,340,150,300,9,1.0,"moon"),dict(act="a9",type="prop",id="itdev",x=540,y=1200,scale=1.3,enter="none",at=0,opts={"mood":"smile","raise":True},bob=.5,float=16,rot=3),
 card("a9",250,"WHAT DID YOUR APPRAISAL<br>ASK YOU TO OWN?","what",size=44,h=190)]
spec=dict(kitFile="../../kits/it-life.json",tail=3.5,kit=dict(caption=dict(y=1322)),acts=acts,items=it)
spec=restage(spec)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
