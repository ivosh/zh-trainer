import { ZhBoard } from './board';
import { grade, getCard } from './store';
import type { OpeningLine, OpeningStep } from './data';

/**
 * Opening drill. The computer plays the moves your opponents actually played
 * in these positions, and you have to find the engine-approved reply.
 */
export class OpeningView {
  private board?: ZhBoard;
  private lines: OpeningLine[] = [];
  private line?: OpeningLine;
  private idx = 0;
  private mistakes = 0;
  private el: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = root;
  }

  setLines(lines: OpeningLine[]) {
    this.lines = lines;
  }

  render() {
    this.el.innerHTML = `
      <div class="view opening-view">
        <div class="toolbar">
          <select id="op-line" aria-label="Opening line"></select>
        </div>
        <div class="prompt" id="op-prompt"></div>
        <div class="board-wrap" id="op-board"></div>
        <div class="feedback" id="op-feedback"></div>
        <div class="actions">
          <button id="op-hint" class="btn">Hint</button>
          <button id="op-restart" class="btn">Restart line</button>
          <button id="op-next" class="btn primary">Next line</button>
        </div>
        <div class="moves" id="op-moves"></div>
      </div>`;

    const sel = this.el.querySelector<HTMLSelectElement>('#op-line')!;
    sel.innerHTML = this.lines.map((l, i) => {
      const c = l.color === 'white' ? 'W' : 'B';
      return `<option value="${i}">${c} &middot; ${l.name} (${l.win_pct}% in ${l.games} games)</option>`;
    }).join('');
    sel.onchange = () => this.start(this.lines[+sel.value]);
    this.el.querySelector<HTMLButtonElement>('#op-hint')!.onclick = () => this.hint();
    this.el.querySelector<HTMLButtonElement>('#op-restart')!.onclick =
      () => this.start(this.line!);
    this.el.querySelector<HTMLButtonElement>('#op-next')!.onclick = () => {
      const n = (this.lines.indexOf(this.line!) + 1) % this.lines.length;
      sel.value = String(n);
      this.start(this.lines[n]);
    };
    this.start(this.lines[0]);
  }

  private start(line: OpeningLine) {
    this.line = line;
    this.idx = 0;
    this.mistakes = 0;
    const first = line.steps[0];
    this.board = new ZhBoard(this.el.querySelector<HTMLElement>('#op-board')!, {
      fen: first.fen,
      orientation: line.color,
      onMove: (uci) => this.tryMove(uci),
    });
    this.el.querySelector('#op-moves')!.innerHTML = '';
    this.el.querySelector('#op-feedback')!.innerHTML = '';
    this.advanceToMyTurn();
  }

  /** Auto-play opponent moves until it is the user's turn. */
  private advanceToMyTurn() {
    const line = this.line!;
    while (this.idx < line.steps.length && !line.steps[this.idx].mine) {
      const s = line.steps[this.idx];
      this.board!.applyUci(s.uci);
      this.logMove(s, false);
      this.idx++;
    }
    if (this.idx >= line.steps.length) {
      this.finish();
      return;
    }
    this.board!.clearShapes();
    const s = line.steps[this.idx];
    const moveNo = Math.floor(this.idx / 2) + 1;
    let note = '';
    if (s.your_move && s.your_move_count) {
      note = `<div class="warn">In your games you usually play
        <strong>${s.your_move}</strong> here (${s.your_move_count}&times;).
        There is something better.</div>`;
    }
    this.el.querySelector('#op-prompt')!.innerHTML =
      `<strong>Move ${moveNo}. Your turn.</strong> Play the best move.${note}`;
  }

  private tryMove(uci: string) {
    const s = this.line!.steps[this.idx];
    if (!s) return;
    if (uci === s.uci) {
      this.board!.applyUci(uci);
      this.logMove(s, true);
      this.el.querySelector('#op-feedback')!.innerHTML =
        `<div class="ok">Correct: <strong>${s.san}</strong></div>`;
      this.idx++;
      setTimeout(() => this.advanceToMyTurn(), 350);
    } else {
      this.mistakes++;
      this.board!.shake();
      this.board!.setFen(s.fen, this.line!.color);
      this.el.querySelector('#op-feedback')!.innerHTML =
        `<div class="bad">Not the move here. Try again, or press Hint.</div>`;
    }
  }

  private logMove(s: OpeningStep, mine: boolean) {
    const el = this.el.querySelector('#op-moves')!;
    const span = document.createElement('span');
    span.className = 'mv ' + (mine ? 'mine' : 'theirs');
    span.textContent = s.san;
    el.appendChild(span);
  }

  private hint() {
    const s = this.line!.steps[this.idx];
    if (!s) return;
    this.mistakes++;
    this.board!.drawArrow(s.uci);
    this.el.querySelector('#op-feedback')!.innerHTML =
      `<div class="hint">Play <strong>${s.san}</strong>.</div>`;
  }

  private finish() {
    const id = 'op:' + this.line!.name;
    grade(id, this.mistakes === 0 ? 2 : this.mistakes <= 2 ? 1 : 0);
    const c = getCard(id);
    this.el.querySelector('#op-prompt')!.innerHTML =
      `<strong>Line complete.</strong> ${this.mistakes === 0
        ? 'No mistakes.' : `${this.mistakes} slip(s).`}
       Reviewed ${c.reps}&times;.`;
    this.board!.setViewOnly(true);
  }
}
