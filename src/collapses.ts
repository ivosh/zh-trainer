import { ZhBoard, sanOf } from './board';
import { grade, pickNext, dueCount } from './store';
import { defencePuzzles } from './data';
import type { Puzzle } from './data';
import patternData from './data/patterns.json';

interface Pattern {
  key: string;
  title: string;
  text: string;
  count: number;
  squares?: string[];
}

const meta = patternData as { total_mates: number; patterns: Pattern[] };

/** Which mating squares belong to which pattern, for grouping the collapses. */
const SQUARES: Record<string, string[]> = {
  'back-rank-g7-g8': ['g7', 'g8', 'h7', 'h8', 'g2', 'g1', 'h2', 'h1'],
  'f7-f2': ['f7', 'f2', 'f3', 'f6'],
  'q-drop-e2-d1': ['e2', 'd1', 'e7', 'd8', 'e1', 'd2'],
  'n-drop': ['f5', 'g5', 'g4', 'h5', 'h4'],
};

/**
 * The collapse trainer. A mate you allowed one move earlier teaches nothing, so
 * every position here is the moment several moves before the mate where the
 * game was still holdable - and asks for the move that would have held it.
 */
export class CollapseView {
  private board?: ZhBoard;
  private el: HTMLElement;
  private patternKey = 'all';
  private puzzle?: Puzzle;
  private solved = false;
  private failed = false;
  private shown = new Set<string>();

  constructor(el: HTMLElement) {
    this.el = el;
  }

  private pool(): Puzzle[] {
    if (this.patternKey === 'all') return defencePuzzles;
    const sq = SQUARES[this.patternKey] ?? [];
    return defencePuzzles.filter(p => p.mate_square && sq.includes(p.mate_square));
  }

  render() {
    const counts = new Map<string, number>();
    for (const p of meta.patterns) {
      const sq = SQUARES[p.key] ?? [];
      counts.set(p.key,
        defencePuzzles.filter(d => d.mate_square && sq.includes(d.mate_square)).length);
    }
    this.el.innerHTML = `
      <div class="view collapse-view">
        <p class="lede">The mate is never the mistake. Each position is the moment
          <strong>3 to 12 moves earlier</strong>, while the game was still holdable.</p>
        <div class="toolbar">
          <select id="cl-filter" aria-label="Collapse type">
            <option value="all">All collapses (${defencePuzzles.length})</option>
            ${meta.patterns.map(p =>
              `<option value="${p.key}">${p.title} (${counts.get(p.key) ?? 0})</option>`).join('')}
          </select>
          <span class="due-badge" id="cl-due"></span>
        </div>
        <div class="lesson" id="cl-lesson"></div>
        <div class="prompt" id="cl-prompt"></div>
        <div class="board-wrap" id="cl-board"></div>
        <div class="feedback" id="cl-feedback"></div>
        <div class="actions">
          <button id="cl-hint" class="btn">Hint</button>
          <button id="cl-solution" class="btn">Show solution</button>
          <button id="cl-next" class="btn primary">Next</button>
        </div>
        <div class="meta" id="cl-meta"></div>
      </div>`;

    const sel = this.el.querySelector<HTMLSelectElement>('#cl-filter')!;
    sel.value = this.patternKey;
    sel.onchange = () => { this.patternKey = sel.value; this.next(); };
    this.el.querySelector<HTMLButtonElement>('#cl-hint')!.onclick = () => this.hint();
    this.el.querySelector<HTMLButtonElement>('#cl-solution')!.onclick = () => this.reveal();
    this.el.querySelector<HTMLButtonElement>('#cl-next')!.onclick = () => this.next();
    this.next();
  }

  private next() {
    const pool = this.pool();
    const lesson = this.el.querySelector<HTMLElement>('#cl-lesson')!;
    const pat = meta.patterns.find(p => p.key === this.patternKey);
    lesson.innerHTML = pat ? `<h3>${pat.title}</h3><p>${pat.text}</p>` : '';
    lesson.style.display = pat ? '' : 'none';

    if (!pool.length) {
      this.el.querySelector('#cl-prompt')!.textContent =
        'No collapses recorded for this pattern.';
      this.el.querySelector('#cl-board')!.innerHTML = '';
      return;
    }
    const ids = pool.map(p => p.id);
    if (this.shown.size >= ids.length) this.shown.clear();
    const id = pickNext(ids, this.shown);
    this.puzzle = pool.find(p => p.id === id) ?? pool[0];
    this.shown.add(this.puzzle.id);
    this.solved = false;
    this.failed = false;
    this.mount();
  }

  private mount() {
    const p = this.puzzle!;
    this.board?.destroy();
    this.board = new ZhBoard(this.el.querySelector<HTMLElement>('#cl-board')!, {
      fen: p.fen,
      orientation: p.turn === 'w' ? 'white' : 'black',
      onMove: (uci) => this.tryMove(uci),
    });
    const moves = Math.floor((p.plies_to_mate ?? 0) / 2);
    this.el.querySelector('#cl-prompt')!.innerHTML =
      `<strong>${p.turn === 'w' ? 'White' : 'Black'} to play — you.</strong>
       In the game you played <strong>${p.played}</strong> here and were mated
       ${moves} move${moves === 1 ? '' : 's'} later on <strong>${p.mate_square}</strong>.
       The position is still holdable. Find the move.`;
    this.el.querySelector('#cl-feedback')!.innerHTML = '';
    this.el.querySelector('#cl-due')!.textContent =
      `${dueCount(this.pool().map(x => x.id))} due`;
    this.el.querySelector('#cl-meta')!.innerHTML =
      `<a href="https://lichess.org/${p.game_id}#${p.ply}" target="_blank"
          rel="noopener">your game &rarr;</a>`;
  }

  private tryMove(uci: string) {
    const p = this.puzzle!;
    if (this.solved) return;
    if (uci === p.solution) {
      this.solved = true;
      this.board!.applyUci(uci);
      this.board!.setViewOnly(true);
      grade(p.id, this.failed ? 0 : 2);
      this.el.querySelector('#cl-feedback')!.innerHTML =
        `<div class="ok">Yes — <strong>${p.solution_san}</strong> holds.</div>
         ${p.explain ? `<div class="why">${p.explain}</div>` : ''}`;
    } else {
      this.failed = true;
      this.board!.shake();
      const san = sanOf(p.fen, uci);
      this.board!.setFen(p.fen);
      this.el.querySelector('#cl-feedback')!.innerHTML =
        `<div class="bad">${san} does not hold. Ask what his pieces in hand
         can do to your king, and defend that square first.</div>`;
    }
  }

  private hint() {
    const p = this.puzzle!;
    if (this.solved) return;
    const isDrop = p.solution.includes('@');
    const names: Record<string, string> = {
      P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king',
    };
    const letter = isDrop ? p.solution[0] : p.solution_san[0];
    const name = names[letter] ?? 'pawn';
    this.el.querySelector('#cl-feedback')!.innerHTML = isDrop
      ? `<div class="hint">Drop a <strong>${name}</strong> from your hand.</div>`
      : `<div class="hint">Move a <strong>${name}</strong> already on the board.</div>`;
  }

  private reveal() {
    const p = this.puzzle!;
    if (this.solved) return;
    this.solved = true;
    grade(p.id, 0);
    this.board!.setFen(p.fen);
    this.board!.drawArrow(p.solution);
    this.board!.setViewOnly(true);
    this.el.querySelector('#cl-feedback')!.innerHTML =
      `<div class="shown">The move was <strong>${p.solution_san}</strong>;
        you played <strong>${p.played}</strong>.</div>
       ${p.explain ? `<div class="why">${p.explain}</div>` : ''}`;
  }
}
