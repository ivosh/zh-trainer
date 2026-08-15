import './style.css';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

import { PuzzleView } from './puzzles';
import { OpeningView } from './openings';
import { PatternView } from './patterns';
import { ReportView } from './report';
import { puzzles, openings } from './data';
import { dueCount } from './store';

type TabId = 'puzzles' | 'openings' | 'patterns' | 'plan';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'puzzles', label: 'Puzzles', icon: '&#9822;' },
  { id: 'openings', label: 'Openings', icon: '&#9814;' },
  { id: 'patterns', label: 'Patterns', icon: '&#9819;' },
  { id: 'plan', label: 'Plan', icon: '&#9873;' },
];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <h1>Crazyhouse Trainer</h1>
    <span class="sub" id="hdr-sub"></span>
  </header>
  <main id="main"></main>
  <nav class="tabbar" id="tabbar"></nav>`;

const main = document.querySelector<HTMLElement>('#main')!;
const puzzleView = new PuzzleView(main);
puzzleView.setPool(puzzles);
const openingView = new OpeningView(main);
openingView.setLines(openings);
const patternView = new PatternView(main);
const reportView = new ReportView(main);

let current: TabId = (localStorage.getItem('zh-tab') as TabId) || 'puzzles';

function renderTabs() {
  const bar = document.querySelector<HTMLElement>('#tabbar')!;
  const due = dueCount(puzzles.map(p => p.id));
  bar.innerHTML = TABS.map(t => `
    <button class="tab ${t.id === current ? 'active' : ''}" data-tab="${t.id}">
      <span class="ic">${t.icon}</span>
      <span class="lb">${t.label}</span>
      ${t.id === 'puzzles' && due > 0 ? `<span class="dot">${due > 99 ? '99+' : due}</span>` : ''}
    </button>`).join('');
  bar.querySelectorAll<HTMLButtonElement>('.tab').forEach(b => {
    b.onclick = () => show(b.dataset.tab as TabId);
  });
}

function show(tab: TabId) {
  current = tab;
  localStorage.setItem('zh-tab', tab);
  window.scrollTo(0, 0);
  const sub = document.querySelector<HTMLElement>('#hdr-sub')!;
  switch (tab) {
    case 'puzzles':
      sub.textContent = `${puzzles.length} positions from your own games`;
      puzzleView.render();
      break;
    case 'openings':
      sub.textContent = `${openings.length} lines from your repertoire`;
      openingView.render();
      break;
    case 'patterns':
      sub.textContent = 'How you actually get mated';
      patternView.render();
      break;
    case 'plan':
      sub.textContent = 'Your analysis and plan';
      reportView.render();
      break;
  }
  renderTabs();
}

show(current);
