// Real b-roll: Playwright screen recordings (1216x634) of real pages / the real router dashboard. Smooth scrolls only; nothing staged.
const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path');
const OUT='projects/ideatoapps-freeclaude/assets/broll'; const W=1216,H=634;
const scroll=async(p,dy,ms)=>{const steps=Math.round(ms/40);for(let i=0;i<steps;i++){await p.mouse.wheel(0,dy/steps);await p.waitForTimeout(40);}};
const clips={
 b1_openrouter_free: async p=>{await p.goto('https://openrouter.ai/models?max_price=0',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});await p.waitForTimeout(1500);await scroll(p,700,5200);await p.waitForTimeout(700);},
 b2_freellm_providers: async p=>{await p.goto('https://github.com/tashfeenahmed/freellmapi',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});await p.evaluate(()=>{const h=[...document.querySelectorAll('h2')].find(e=>/Supported providers/i.test(e.textContent));if(h)h.scrollIntoView({block:'start',behavior:'instant'});});await p.waitForTimeout(1200);await scroll(p,520,5000);await p.waitForTimeout(600);},
 b3_dash_models: async p=>{await p.goto('http://localhost:3001/models/chat',{waitUntil:'networkidle'});await p.waitForTimeout(1500);await scroll(p,520,4800);await p.waitForTimeout(700);},
 b4_dash_keys: async p=>{await p.goto('http://localhost:3001/keys',{waitUntil:'networkidle'});await p.waitForTimeout(1600);await scroll(p,380,4200);await p.waitForTimeout(900);},
};
(async()=>{const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH,args:['--no-sandbox']});
for(const [name,fn] of Object.entries(clips)){const dir=`/tmp/fc_rec_${name}`;fs.rmSync(dir,{recursive:true,force:true});
 const ctx=await b.newContext({viewport:{width:W,height:H},recordVideo:{dir,size:{width:W,height:H}},storageState:name.startsWith('b3')||name.startsWith('b4')?'/tmp/fc_dash_state.json':undefined});
 const p=await ctx.newPage();try{await fn(p);}catch(e){console.log(name,'ERR',e.message.slice(0,90));} await ctx.close();
 const f=fs.readdirSync(dir).find(x=>x.endsWith('.webm'));fs.copyFileSync(path.join(dir,f),`${OUT}/${name}.webm`);console.log('recorded',name);}
await b.close();})();
