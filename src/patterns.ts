import { ZhBoard } from './board';
import patternData from './data/patterns.json';

interface PatternExample {
  game_id: string;
  ply: number;
  fen: string;
  mating_move: string;
  mating_uci: string;
  my_color: string;
  date: string;
}

interface Pattern {
  key: string;
  title: string;
  text: string;
  count: number;
  examples: PatternExample[];
}

const data = patternData as { total_mates: number; patterns: Pattern[] };

/**
 * Pattern library: the mating nets that actually finish this player's games,
 * each with real positions from their own losses.
 */
export class PatternView {
  private board?: ZhBoard;
  private current?: Pattern;
  private exIdx = 0;
  private revealed = false;
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  render() {
    this.el.innerHTML = `
      <div class="view pattern-view">
        <p class="lede">You have been checkmated <strong>${data.total_mates}</strong>
          times. Almost all of it is these four patterns. Learn to see them and you
          stop losing the same game over and over.</p>
        <div class="pattern-list" id="pt-list"></div>
        <div id="pt-detail"></div>
      </div>`;
    const list = this.el.querySelector('#pt-list')!;
    data.patterns.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'pattern-card';
      b.innerHTML = `<span class="pc-title">${p.title}</span>
        <span class="pc-count">${p.count} losses</span>`;
      b.onclick = () => this.open(i);
      list.appendChild(b);
    });
    this.open(0);
  }

  private open(i: number) {
    this.current = data.patterns[i];
    this.exIdx = 0;
    this.el.querySelectorAll('.pattern-card').forEach((c, j) =>
      c.classList.toggle('active', i === j));
    const d = this.el.querySelector('#pt-detail')!;
    d.innerHTML = `
      <div class="pattern-detail">
        <h3>${this.current.title}</h3>
        <p>${this.current.text}</p>
        <div class="prompt" id="pt-prompt"></div>
        <div class="board-wrap" id="pt-board"></div>
        <div class="feedback" id="pt-feedback"></div>
        <div class="actions">
          <button id="pt-reveal" class="btn">Show the mate</button>
          <button id="pt-next" class="btn primary">Another example</button>
        </div>
      </div>`;
    d.querySelector<HTMLButtonElement>('#pt-reveal')!.onclick = () => this.reveal();
    d.querySelector<HTMLButtonElement>('#pt-next')!.onclick = () => {
      this.exIdx = (this.exIdx + 1) % Math.max(1, this.current!.examples.length);
      this.mount();
    };
    this.mount();
  }

  private mount() {
    const p = this.current!;
    if (!p.examples.length) {
      this.el.querySelector('#pt-prompt')!.textContent =
        'No examples recorded for this pattern.';
      return;
    }
    const ex = p.examples[this.exIdx];
    this.revealed = false;
    // your own side at the bottom, exactly as you saw it in the game
    this.board?.destroy();
    this.board = new ZhBoard(this.el.querySelector<HTMLElement>('#pt-board')!, {
      fen: ex.fen,
      orientation: ex.my_color as 'white' | 'black',
      viewOnly: true,
      onMove: () => {},
    });
    this.el.querySelector('#pt-prompt')!.innerHTML =
      `<strong>From your game on ${ex.date.replace(/\./g, '-')}.</strong>
       You were ${ex.my_color}. Your opponent mated you in one from here.
       Can you see it?`;
    this.el.querySelector('#pt-feedback')!.innerHTML = '';
  }

  private reveal() {
    const p = this.current!;
    if (!p.examples.length || this.revealed) return;
    const ex = p.examples[this.exIdx];
    this.revealed = true;
    this.board!.drawArrow(ex.mating_uci);
    this.el.querySelector('#pt-feedback')!.innerHTML =
      `<div class="shown">Mate was <strong>${ex.mating_move}</strong>.
        <a href="https://lichess.org/${ex.game_id}#${ex.ply}" target="_blank"
           rel="noopener">see the game &rarr;</a></div>`;
  }
}
