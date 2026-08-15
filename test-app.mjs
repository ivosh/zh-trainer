import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const errs=[];
p.on('console', m => { if(m.type()==='error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
await p.goto('http://localhost:4173/', {waitUntil:'networkidle'});
await p.waitForTimeout(1200);

console.log('--- title:', await p.title());
console.log('tabs:', await p.$$eval('.tab .lb', els=>els.map(e=>e.textContent)));
console.log('prompt:', (await p.textContent('#pz-prompt'))?.trim().slice(0,110));
console.log('board squares:', await p.$$eval('cg-board square', e=>e.length).catch(()=>'n/a'));
console.log('pieces on board:', await p.$$eval('cg-board piece', e=>e.length));
console.log('pocket buttons:', await p.$$eval('.pocket-piece', e=>e.length));
await p.screenshot({path:'/tmp/shot-puzzle.png'});

// solve current puzzle via the solution button path: test hint + solution
await p.click('#pz-hint'); await p.waitForTimeout(300);
console.log('hint:', (await p.textContent('#pz-feedback'))?.trim().slice(0,90));
await p.click('#pz-solution'); await p.waitForTimeout(400);
console.log('solution:', (await p.textContent('#pz-feedback'))?.trim().slice(0,120));
await p.screenshot({path:'/tmp/shot-solution.png'});
await p.click('#pz-next'); await p.waitForTimeout(500);
console.log('after next, prompt:', (await p.textContent('#pz-prompt'))?.trim().slice(0,80));

for (const t of ['openings','patterns','plan']) {
  await p.click(`.tab[data-tab=${t}]`);
  await p.waitForTimeout(900);
  const h = await p.$eval('#main', e=>e.innerText.slice(0,150));
  console.log(`--- ${t}:`, h.replace(/\n/g,' | ').slice(0,150));
  await p.screenshot({path:`/tmp/shot-${t}.png`});
}
console.log('\nERRORS:', errs.length ? errs.slice(0,8) : 'none');
await b.close();
