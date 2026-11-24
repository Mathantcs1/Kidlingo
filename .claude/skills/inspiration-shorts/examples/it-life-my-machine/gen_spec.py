import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
from specdsl import *
INK="#14263d"; RED="#e0543a"
def back(act,id,sc=1.4,**o): return dict(act=act,type="prop",id=id,x=540,y=1430,scale=sc,enter="none",at=0,opts=o,qa=False)
def dev(act,x,sc=1.5,at=0,enter="none",y=1440,fl=0,**o):
    d=dict(act=act,type="prop",id="itdev",x=x,y=y,scale=sc,enter=enter,at=at,opts=o,bob=.6)
    if fl: d["float"]=fl
    return d
def card(act,y,text,at,size=56,bg="#fff",color=INK,h=120,x=40,w=1000,**k): return rect(act,x,y,w,h,at,bg,text,size,color=color,**k)
acts=[A("hook",None,"cream"),A("a1","i-0.1","mint","wipe-up"),A("a2","clicked-0.2","slate","cut"),A("a3","client's-0.3","steel","iris"),
 A("a4","manager-0.2","violet","push"),A("a5","since-0.1","cream","wipe-left"),A("a6","everyone-0.2","sunset","zoom")]
LAP=lambda act,at=0: prop(act,"itlaptop",325,0.55,at,opts=dict(screen="#3ec97a"),enter="none",y=1060,bob=.2)
it=[]
# hook: client demo, everything worked
it+=[back("hook","itconf"),LAP("hook"),
 card("hook",130,"CLIENT DEMO — 10 AM","client",size=56,h=130,until="everything"),
 card("hook",130,"WORKED LAST NIGHT. ON MY MACHINE.","everything",size=42,h=130,bg="#62f0c8"),
 rect("hook",240,500,320,66,"demo","#3ec97a","● RUNNING",34,radius=33,color="#fff"),
 dev("hook",150,1.5,mood="smile")]
# a1: confidence
it+=[back("a1","itconf"),LAP("a1"),dict(act="a1",type="sparkles",x=325,y=1000,r=150,n=9,at=0),
 card("a1",130,"TESTED. PERFECT.","tested",size=56,h=130,until="button"),
 card("a1",130,"EVERY BUTTON WORKED.","button",size=52,h=130,until="screen"),
 card("a1",130,"EVERY SCREEN LOADED.","screen",size=52,h=130,until="backup"),
 card("a1",130,"A BACKUP OF THE BACKUP.","backup",size=48,h=130,until="walked"),
 card("a1",130,"LIKE A ROCKET LAUNCH.","launch",size=52,h=130,bg="#ffd21f"),
 rect("a1",40,300,420,100,"five","#62f0c8","5 TESTS ✓",56,radius=50,until="walked"),
 dev("a1",140,1.5,mood="smile",raise_=True) if False else dict(dev("a1",140,1.5,mood="smile"),opts={"mood":"smile","raise":True})]
# a2: the failure
it+=[back("a2","itconf",lean=True),LAP("a2"),dict(act="a2",type="hit",at="error",shake=.5,flash=.35),
 dict(act="a2",type="spinner",x=540,y=700,size=150,at="loader",until="error"),
 rect("a2",230,560,620,200,"error",RED,"ERROR 500",100,color="#fff",radius=20),
 card("a2",130,"CLICK.","clicked",size=60,h=130,until="loader"),
 card("a2",130,"LOADING…","loader",size=60,h=130,until="error"),
 card("a2",130,"ERROR 500","error",size=64,h=130,bg=RED,color="#fff",until="five#2"),
 card("a2",130,"FIVE PEOPLE LEAN FORWARD","five#2",size=46,h=130,until="sentence"),
 card("a2",130,"THE SENTENCE EVERY ENGINEER SAYS","sentence",size=40,h=130,until="it#2"),
 card("a2",130,"\"IT WORKS ON MY MACHINE.\"","it#2",size=46,h=130,bg="#ffd21f"),
 dev("a2",140,1.5,mood="shock",sweat=True)]
# a3: the map, same code different world
it+=[back("a3","itmap",1.2),
 card("a3",130,"THE CLIENT'S ENVIRONMENT","client's",size=46,h=130,until="different"),
 card("a3",130,"A DIFFERENT VERSION. ONE SMALL THING.","different",size=36,h=130,until="same"),
 card("a3",130,"SAME CODE. DIFFERENT WORLD.","same",size=48,h=130,bg="#ffd21f"),
 rect("a3",40,720,460,150,"client's","#fff","MY LAPTOP<br>LIB 4.2 ✓",44,radius=30,color="#139f7d"),
 rect("a3",580,720,460,150,"version","#fff","CLIENT<br>LIB 4.1 ⚑",44,radius=30,color=RED),
 dev("a3",250,1.0,y=1340,mood="smile")]
# a4: let's reschedule, body on fire
it+=[back("a4","itconf"),LAP("a4"),
 card("a4",130,"\"LET'S RESCHEDULE.\"","let's",size=52,h=130,until="back"),
 card("a4",130,"I SMILED BACK.","back",size=56,h=130,until="fire"),
 card("a4",130,"BODY ON FIRE INSIDE.","fire",size=52,h=130,bg=RED,color="#fff"),
 dev("a4",140,1.5,mood="grin"),
 prop("a4","itflame",60,1.3,"back",opts=dict(),enter="pop",y=1240,bob=1.6),prop("a4","itflame",150,1.7,"back+0.3",opts=dict(),enter="pop",y=1250,bob=1.6),prop("a4","itflame",240,1.3,"fire",opts=dict(),enter="pop",y=1240,bob=1.6),prop("a4","itflame",150,1.2,"fire+0.2",opts=dict(),enter="pop",y=1100,bob=1.8)]
# a5: the lesson, sticky note
it+=[back("a5","itplain",1.2),
 card("a5",130,"MY RULE","rule",size=60,h=130,x=240,w=600,until="never"),
 card("a5",130,"NEVER DEMO IN YOUR OWN WORLD.","never",size=44,h=130,until="always"),
 card("a5",130,"TEST IN THE CLIENT'S WORLD FIRST.","always",size=42,h=130,bg="#62f0c8",until="least#2"),
 card("a5",130,"AT LEAST ONCE.","least#2",size=60,h=130,bg="#ffd21f"),
 prop("a5","itlaptop",600,1.9,0,opts=dict(screen="#cfe8ff"),enter="none",y=1330,bob=.2),
 rect("a5",410,820,420,260,"test","#ffe27a","TEST IN THEIR WORLD FIRST",44,radius=10,rot=-6,enter="pop"),
 dict(dev("a5",150,1.5,mood="smile"),opts={"mood":"smile","raise":True})]
# a6: hold up the note
it+=[back("a6","itplain",1.2,wall="#ffe9d2",floor="#f3c9a0"),
 card("a6",130,"WHAT WAS YOURS?","what",size=60,h=130,bg="#ffd21f",x=140,w=800),
 rect("a6",140,320,800,380,"everyone","#ffe27a","TEST IN THEIR WORLD FIRST.",64,radius=14,rot=-4,enter="pop"),
 dict(dev("a6",540,1.6,y=1385,mood="smile"),opts={"mood":"smile","raise":True})]
spec=dict(kitFile="../../kits/it-life.json",tail=3.2,kit=dict(caption=dict(y=1475,size=66)),acts=acts,items=it)
dump(os.path.join(os.path.dirname(os.path.abspath(__file__)),"spec.json"),spec)
