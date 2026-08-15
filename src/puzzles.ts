import { ZhBoard, sanOf, posFromFen } from './board';
import { grade, getCard, pickNext, dueCount } from './store';
import { parseUci } from 'chessops/util';
import { makeFen } from 'chessops/fen';
import type { Puzzle } from './data';

function advance(fen: string, uci: string): string {
  const pos = posFromFen(fen);
  const mv = parseUci(uci);
  if (!pos || !mv) throw new Error('bad move');
  pos.play(mv);
  return makeFen(pos.toSetup());
}

/**
 * Puzzle trainer. Deliberately untimed: the goal is recognising patterns,
 * not racing a clock.
 */
export class PuzzleView {
  private board?: ZhBoard;
  private puzzle?: Puzzle;
  private pool: Puzzle[] = [];
  private byId = new Map<string, Puzzle>();
  private solved = false;
  private usedHint = false;
  private failed = false;
  private el: HTMLElement;
  private filter = 'all';

  constructor(root: HTMLElement) {
    this.el = root;
  }

  setPool(puzzles: Puzzle[]) {
    this.pool = puzzles;
    this.byId = new Map(puzzles.map(p => [p.id, p]));
  }

  render() {
    this.el.innerHTML = `
      <div class="view puzzle-view">
        <div class="toolbar">
          <select id="pz-filter" aria-label="Puzzle type">
            <option value="all">All puzzles</option>
            <option value="mate">Forced mate</option>
            <option value="drop">Drop tactics</option>
            <option value="np-drop">Knight &amp; pawn drops (your weak spot)</option>
            <option value="blunder">Your blunders</option>
            <option value="punish">Missed punishments</option>
          </select>
          <span class="due-badge" id="pz-due"></span>
        </div>
        <div class="prompt" id="pz-prompt"></div>
        <div class="board-wrap" id="pz-board"></div>
        <div class="feedback" id="pz-feedback"></div>
        <div class="actions">
          <button id="pz-hint" class="btn">Hint</button>
          <button id="pz-solution" class="btn">Show solution</button>
          <button id="pz-next" class="btn primary">Next</button>
        </div>
        <div class="meta" id="pz-meta"></div>
      </div>`;

    const sel = this.el.querySelector<HTMLSelectElement>('#pz-filter')!;
    sel.value = this.filter;
    sel.onchange = () => { this.filter = sel.value; this.next(); };
    this.el.querySelector<HTMLButtonElement>('#pz-hint')!.onclick = () => this.hint();
    this.el.querySelector<HTMLButtonElement>('#pz-solution')!.onclick = () => this.showSolution();
    this.el.querySelector<HTMLButtonElement>('#pz-next')!.onclick = () => this.next();
    this.next();
  }

  private filtered(): Puzzle[] {
    switch (this.filter) {
      case 'mate': return this.pool.filter(p => p.tags.includes('mate'));
      case 'drop': return this.pool.filter(p => p.tags.includes('drop'));
      case 'np-drop': return this.pool.filter(p =>
        p.tags.includes('drop-n') || p.tags.includes('drop-p'));
      case 'blunder': return this.pool.filter(p => p.kind === 'blunder');
      case 'punish': return this.pool.filter(p => p.kind === 'punish');
      default: return this.pool;
    }
  }

  next() {
    const pool = this.filtered();
    if (!pool.length) {
      this.el.querySelector('#pz-prompt')!.textContent = 'No puzzles of this type.';
      return;
    }
    const ids = pool.map(p => p.id);
    const id = pickNext(ids, this.puzzle?.id);
    this.puzzle = this.byId.get(id!) ?? pool[0];
    this.solved = false;
    this.usedHint = false;
    this.failed = false;
    this.mount();
  }

  private mount() {
    const p = this.puzzle!;
    const wrap = this.el.querySelector<HTMLElement>('#pz-board')!;
    const orientation = p.turn === 'w' ? 'white' : 'black';
    this.board = new ZhBoard(wrap, {
      fen: p.fen,
      orientation,
      onMove: (uci) => this.tryMove(uci),
    });
    const side = p.turn === 'w' ? 'White' : 'Black';
    let ask = 'Find the best move.';
    if (p.tags.includes('mate')) {
      const n = p.mate ? Math.abs(p.mate) : 0;
      ask = n === 1 ? 'Mate in 1.' : `Forced mate in ${n}.`;
    } else if (p.kind === 'punish') {
      ask = 'Your opponent just blundered. Punish it.';
    } else if (p.kind === 'blunder') {
      ask = 'You went wrong here. Find the move you missed.';
    }
    this.el.querySelector('#pz-prompt')!.innerHTML =
      `<strong>${side} to play.</strong> ${ask}`;
    this.el.querySelector('#pz-feedback')!.innerHTML = '';
    const due = dueCount(this.filtered().map(x => x.id));
    this.el.querySelector('#pz-due')!.textContent = `${due} due`;
    const c = getCard(p.id);
    this.el.querySelector('#pz-meta')!.innerHTML =
      `<a href="https://lichess.org/${p.game_id}#${p.ply}" target="_blank" rel="noopener">
         your game &rarr;</a>
       <span>${c.reps > 0 ? `seen ${c.reps}&times;` : 'new'}</span>`;
  }

  private tryMove(uci: string) {
    const p = this.puzzle!;
    if (this.solved) return;
    if (uci === p.solution) {
      this.solved = true;
      this.board!.applyUci(uci);
      this.board!.setViewOnly(true);
      const q = this.failed ? 0 : this.usedHint ? 1 : 2;
      grade(p.id, q);
      const line = this.continuation(p);
      this.el.querySelector('#pz-feedback')!.innerHTML =
        `<div class="ok">Correct: <strong>${p.solution_san}</strong>${line}</div>`;
    } else {
      this.failed = true;
      this.board!.shake();
      const san = sanOf(p.fen, uci);
      this.board!.setFen(p.fen);
      this.el.querySelector('#pz-feedback')!.innerHTML =
        `<div class="bad">${san} is not it. Look for a stronger idea &mdash;
         check what is hanging and what you hold in hand.</div>`;
    }
  }

  /** Show the engine's follow-up so the idea, not just the move, is learned. */
  private continuation(p: Puzzle): string {
    if (!p.pv || p.pv.length < 2) return '';
    const sans: string[] = [];
    let fen = p.fen;
    for (const u of p.pv.slice(0, 5)) {
      try {
        sans.push(sanOf(fen, u));
        fen = advance(fen, u);
      } catch { break; }
    }
    return sans.length > 1
      ? `<div class="line">Main line: ${sans.join(' ')}</div>` : '';
  }

  private hint() {
    const p = this.puzzle!;
    if (this.solved) return;
    this.usedHint = true;
    const isDrop = p.solution.includes('@');
    const piece = isDrop ? p.solution[0] : p.solution_san[0];
    const names: Record<string, string> = {
      P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king',
    };
    const name = names[piece] ?? 'pawn';
    this.el.querySelector('#pz-feedback')!.innerHTML = isDrop
      ? `<div class="hint">It is a <strong>drop</strong>: put a ${name} from your hand onto the board.</div>`
      : `<div class="hint">Move a <strong>${name}</strong> that is already on the board.</div>`;
  }

  private showSolution() {
    const p = this.puzzle!;
    if (this.solved) return;
    this.solved = true;
    grade(p.id, 0);
    this.board!.setFen(p.fen);
    this.board!.drawArrow(p.solution);
    this.board!.setViewOnly(true);
    this.el.querySelector('#pz-feedback')!.innerHTML =
      `<div class="shown">Solution: <strong>${p.solution_san}</strong>
        ${this.continuation(p)}</div>`;
  }
}
