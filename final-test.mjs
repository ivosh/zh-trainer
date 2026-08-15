import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto('http://localhost:4173/',{waitUntil:'networkidle'});
await p.waitForTimeout(900);

// --- OPENING DRILL: use Hint then play the shown move via board drag ---
await p.click('.tab[data-tab=openings]'); await p.waitForTimeout(900);
await p.click('#op-hint'); await p.waitForTimeout(400);
const hint = (await p.textContent('#op-feedback')).trim();
console.log('opening hint:', hint.slice(0,60));
// arrow shows the move; derive squares from the drawn shape
const shape = await p.evaluate(()=> {
  const el=document.querySelector('.zh-board svg line, .zh-board svg');
  return el? el.outerHTML.slice(0,120):'none';
});
console.log('arrow drawn:', shape!=='none');
await p.screenshot({path:'/tmp/shot-op-hint.png'});

// --- SPACED REPETITION persistence ---
await p.click('.tab[data-tab=puzzles]'); await p.waitForTimeout(700);
await p.click('#pz-solution'); await p.waitForTimeout(300);
await p.click('#pz-next'); await p.waitForTimeout(500);
const prog = await p.evaluate(()=>JSON.parse(localStorage.getItem('zh-trainer-progress-v1')||'{}'));
console.log('cards stored:', Object.keys(prog.cards||{}).length, '| failed:', prog.stats?.failed);

await p.click('.tab[data-tab=plan]'); await p.waitForTimeout(600);
const solved = await p.textContent('.scorecard');
console.log('scorecard:', solved.replace(/\s+/g,' ').trim().slice(0,60));

// --- OFFLINE ---
await p.waitForTimeout(1500); // let SW install
await ctx.setOffline(true);
await p.reload({waitUntil:'domcontentloaded'});
await p.waitForTimeout(1800);
const offlineOk = await p.$$eval('.tab', e=>e.length);
const offPrompt = await p.$('#main');
console.log('OFFLINE reload -> tabs rendered:', offlineOk, '| main present:', !!offPrompt);
await p.screenshot({path:'/tmp/shot-offline.png'});
await ctx.setOffline(false);
console.log('ERRORS:', errs.length?errs.slice(0,6):'none');
await b.close();
