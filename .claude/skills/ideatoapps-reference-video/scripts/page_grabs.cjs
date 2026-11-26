// Real page grabs for ideatoapps-freeclaude: viewport 1920x1080 @2x, scroll target phrase to mid-screen, save PNG + rect (image fractions).
const {chromium}=require('playwright'); const fs=require('fs');
const OUT='projects/ideatoapps-freeclaude'; const T=[
 ['FL_README','https://github.com/tashfeenahmed/freellmapi','10.1 billion tokens per month',0.18],
 ['FL_DISC','https://github.com/tashfeenahmed/freellmapi','personal experimentation and learning',0.5],
 ['FL_LIC','https://github.com/tashfeenahmed/freellmapi/blob/HEAD/LICENSE','MIT License',0.3],
 ['CC_GW','https://code.claude.com/docs/en/llm-gateway',"doesn't support routing Claude Code to non-Claude models",0.5],
 ['ZEN_BP','https://opencode.ai/docs/zen/','Big Pickle is a stealth model',0.5],
 ['ZEN_DS','https://opencode.ai/docs/zen/','DeepSeek V4.1 Flash Free is free on OpenCode',0.5],
 ['OR_WARN','https://openrouter.ai/docs/guides/coding-agents/claude-code-integration','only guaranteed to work with the Anthropic first-party provider',0.5],
 ['OR_VARS','https://openrouter.ai/docs/guides/coding-agents/claude-code-integration','Provide your',0.5],
 ['FL_QUICK','https://github.com/tashfeenahmed/freellmapi','Prefer to read before you pipe to bash',0.5],
 ['OC_INSTALL','https://opencode.ai/docs/','opencode.ai/v2/install',0.5],
];
(async()=>{const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH,args:['--no-sandbox']});const ctx=await b.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:2});const p=await ctx.newPage();const rects={};
for(const [id,url,phrase,at] of T){await p.goto(url,{waitUntil:'networkidle',timeout:60000}).catch(()=>{});await p.waitForTimeout(1500);
 await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
 for(const step of [1,2]){ var r=await p.evaluate(([ph,at,step])=>{const norm=s=>s.replace(/[‘’]/g,"'").replace(/\s+/g,' ');const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n,best=null;
  while(n=w.nextNode()){const t=norm(n.nodeValue);const i=t.indexOf(ph);if(i>=0&&n.parentElement&&n.parentElement.offsetParent!==null&&!/SCRIPT|STYLE/.test(n.parentElement.tagName)){best={n,i};break;}}
  if(!best)return null;const el=best.n.parentElement;if(step===1){el.scrollIntoView({block:'center',behavior:'instant'});return {scrolled:1};}
  const rg=document.createRange();const raw=best.n.nodeValue;let idx=raw.replace(/[‘’]/g,"'").indexOf(ph);if(idx<0)idx=0;rg.setStart(best.n,idx);rg.setEnd(best.n,Math.min(raw.length,idx+ph.length));
  const rs=[...rg.getClientRects()];const b=rs.length?rs:[el.getBoundingClientRect()];let x0=1e9,y0=1e9,x1=0,y1=0;for(const q of b){x0=Math.min(x0,q.left);y0=Math.min(y0,q.top);x1=Math.max(x1,q.right);y1=Math.max(y1,q.bottom);}
  const eb=el.getBoundingClientRect();return {x:x0/innerWidth,y:y0/innerHeight,w:(x1-x0)/innerWidth,h:(y1-y0)/innerHeight,el:[eb.left/innerWidth,eb.top/innerHeight,eb.width/innerWidth,eb.height/innerHeight]};},[phrase,at,step]); await p.waitForTimeout(900);}
 if(!r){console.log(id,'PHRASE NOT FOUND');continue;} await p.waitForTimeout(400); await p.screenshot({path:`${OUT}/assets/grabs/fc_${id.toLowerCase()}.png`});
 rects[id]={phrase,rect:[+r.x.toFixed(4),+r.y.toFixed(4),+r.w.toFixed(4),+r.h.toFixed(4)],el:r.el.map(v=>+v.toFixed(4))};console.log(id,JSON.stringify(rects[id].rect));}
fs.writeFileSync(`${OUT}/scenes/sets/fc_rects.js`,'// Real positions (image fractions [x,y,w,h]) grabbed live on '+new Date().toISOString().slice(0,10)+'. Re-run tools/fc_grab.cjs before recording.\nexport const FC = '+JSON.stringify(rects,null,1)+';\n');
await b.close();})();
