import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const errs=[];
p.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
p.on('console', m => { if(m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:4173/', {waitUntil:'networkidle'});
await p.waitForTimeout(900);

// find a puzzle whose solution is a DROP so we can test pocket interaction
await p.selectOption('#pz-filter','drop');
await p.waitForTimeout(700);
const sol = await p.evaluate(()=>{
  const raw = localStorage.getItem('zh-tab'); return raw;
});
console.log('prompt:', (await p.textContent('#pz-prompt'))?.trim().slice(0,90));
console.log('pocket count:', await p.$$eval('.zh-pocket.active .pocket-piece', e=>e.length));

// click a pocket piece -> drop targets should appear
const pocket = await p.$$('.zh-pocket.active .pocket-piece');
if (pocket.length){
  await pocket[0].click(); await p.waitForTimeout(400);
  const targets = await p.$$eval('.drop-target', e=>e.length);
  console.log('drop targets shown after pocket click:', targets);
  await p.screenshot({path:'/tmp/shot-drop.png'});
  // pocket re-renders on click, so re-query before clicking again
  const again = await p.$$('.zh-pocket.active .pocket-piece.selected');
  if (again.length) { await again[0].click(); await p.waitForTimeout(300); }
  console.log('targets after deselect:', await p.$$eval('.drop-target', e=>e.length));
}
// check actions visible in viewport
const btn = await p.$('#pz-next');
const box = await btn.boundingBox();
console.log('Next button y:', Math.round(box.y), 'viewport h: 844, visible:', box.y+box.height <= 844);
await p.screenshot({path:'/tmp/shot-fixed.png'});
console.log('ERRORS:', errs.length?errs.slice(0,5):'none');
await b.close();
