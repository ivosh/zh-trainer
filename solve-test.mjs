import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto('http://localhost:4173/',{waitUntil:'networkidle'});
await p.waitForTimeout(800);
await p.selectOption('#pz-filter','drop'); await p.waitForTimeout(600);

// read the solution from the bundle state by reproducing selection logic is hard;
// instead: click Show solution, read SAN, go Next, then solve a fresh one by
// clicking the pocket piece and the target square derived from the arrow.
async function solveCurrent(){
  // reveal to learn the answer, then restart the same puzzle by reloading filter
  const before = await p.textContent('#pz-prompt');
  await p.click('#pz-solution'); await p.waitForTimeout(400);
  const fb = (await p.textContent('#pz-feedback')).trim();
  return {before:before.trim().slice(0,60), fb:fb.slice(0,90)};
}
console.log(await solveCurrent());

// Now verify a WRONG move is rejected and a RIGHT move accepted, using a known puzzle.
// Inject: pick first mate-in-1 drop puzzle from the app's data via fetch of the JSON chunk is
// not exposed; instead drive the UI: select pocket piece then click each legal target
// until the app reports success (bounded, deterministic).
await p.click('#pz-next'); await p.waitForTimeout(500);
let solved=false, tries=0;
const pieces = await p.$$('.zh-pocket.active .pocket-piece');
for (let pi=0; pi<pieces.length && !solved; pi++){
  const fresh = await p.$$('.zh-pocket.active .pocket-piece');
  if(!fresh[pi]) break;
  await fresh[pi].click(); await p.waitForTimeout(200);
  const n = await p.$$eval('.drop-target', e=>e.length);
  for (let i=0;i<n;i++){
    const t = await p.$$('.drop-target');
    if(!t[i]) break;
    await t[i].click(); tries++;
    await p.waitForTimeout(120);
    const fb = await p.textContent('#pz-feedback');
    if (fb && fb.includes('Correct')) { solved=true; console.log('SOLVED after',tries,'attempts:',fb.trim().slice(0,70)); break; }
    // wrong move resets board; reselect the same pocket piece
    const re = await p.$$('.zh-pocket.active .pocket-piece');
    if(re[pi]) { await re[pi].click(); await p.waitForTimeout(120); }
  }
}
console.log('drop solve reached success:', solved);
await p.screenshot({path:'/tmp/shot-solved.png'});
console.log('ERRORS:', errs.length?errs.slice(0,5):'none');
await b.close();
