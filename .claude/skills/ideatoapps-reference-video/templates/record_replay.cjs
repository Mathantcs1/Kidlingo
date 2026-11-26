const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path');
const here=path.resolve('.');
function load(name){
  const log=fs.readFileSync(`cast/${name}.log`); const tim=fs.readFileSync(`cast/${name}.timing`,'utf8').trim().split('\n');
  let pos=log.indexOf(0x0a)+1; const data=[];
  for(const l of tim){const [d,n]=l.trim().split(/\s+/); if(!n||isNaN(+n)) continue; const c=parseInt(n); const chunk=log.subarray(pos,pos+c).toString('utf8'); pos+=c; data.push([parseFloat(d),chunk]);}
  return data;
}
const scenes=[
 ['scene1_direct','Setup A · Claude Code → OpenRouter free model','Test 1 of 3','Claude Code pointed straight at a free model. Real run, sample task.'],
 ['scene2_router','Setup B · Claude Code → FreeLLMAPI router','Test 2 of 3','A router that picks the free model for you. Real run, sample task.'],
 ['scene3_opencode','Setup C · OpenCode with a free Zen model','Test 3 of 3','A different agent, free model, no key. Real run, sample task.'],
];
(async()=>{const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:'video_raw',size:{width:1920,height:1080}}});
const p=await ctx.newPage(); await p.goto('file://'+here+'/replay.html');
await p.evaluate(()=>showCard('Free Claude Code: what really happens','Three setups. Same small task. Real runs. 2026-11-26',3500));
for(const [n,title,h,sub] of scenes){ await p.evaluate(([h,sub])=>showCard(h,sub,2500),[h,sub]); await p.evaluate(([s])=>playScene(s),[{title,data:load(n)}]); }
await p.evaluate(()=>showCard('Your own free keys only','Check each provider\'s terms. Free is never zero: you pay in limits, privacy or quality.',4000));
await ctx.close(); await b.close(); console.log('recorded');})();
