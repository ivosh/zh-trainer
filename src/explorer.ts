import { ZhBoard, advanceFen } from './board';
import type { ExplorerLine, ExplorerNode, Candidate } from './data';

/**
 * Opening explorer. Rather than revealing a single correct move, this shows the
 * engine's top candidates with evaluations, flags the move actually played in
 * these positions, and can play any candidate out so the reason is visible.
 */
export class ExplorerView {
  private board?: ZhBoard;
  private lines: ExplorerLine[] = [];
  private line?: ExplorerLine;
  private idx = 0;
  private el: HTMLElement;
  private preview?: { fens: string[]; sans: string[]; step: number };

  constructor(el: HTMLElement) {
    this.el = el;
  }

  setLines(lines: ExplorerLine[]) {
    this.lines = lines;
  }

  render() {
    this.el.innerHTML = `
      <div class="view explorer-view">
        <div class="toolbar">
          <select id="ex-line" aria-label="Opening line"></select>
        </div>
        <div class="prompt" id="ex-prompt"></div>
        <div class="board-wrap" id="ex-board"></div>
        <div id="ex-panel"></div>
        <div class="actions">
          <button id="ex-back" class="btn">Back</button>
          <button id="ex-reset" class="btn">Restart</button>
          <button id="ex-fwd" class="btn primary">Forward</button>
        </div>
        <div class="moves" id="ex-moves"></div>
      </div>`;

    const sel = this.el.querySelector<HTMLSelectElement>('#ex-line')!;
    sel.innerHTML = this.lines.map((l, i) => {
      const c = l.color === 'white' ? 'W' : 'B';
      const rec = l.games ? ` — ${l.win_pct}% of ${l.games}` : '';
      return `<option value="${i}">${c} · ${l.name}${rec}</option>`;
    }).join('');
    sel.onchange = () => this.start(this.lines[+sel.value]);
    this.el.querySelector<HTMLButtonElement>('#ex-back')!.onclick = () => this.step(-1);
    this.el.querySelector<HTMLButtonElement>('#ex-fwd')!.onclick = () => this.step(1);
    this.el.querySelector<HTMLButtonElement>('#ex-reset')!.onclick =
      () => this.start(this.line!);
    this.start(this.lines[0]);
  }

  private start(line: ExplorerLine) {
    this.line = line;
    this.idx = 0;
    this.preview = undefined;
    this.mount();
  }

  private node(): ExplorerNode | undefined {
    return this.line?.nodes[this.idx];
  }

  private mount() {
    const n = this.node();
    if (!n) return;
    this.board?.destroy();
    this.board = new ZhBoard(this.el.querySelector<HTMLElement>('#ex-board')!, {
      fen: n.fen,
      orientation: this.line!.color,
      viewOnly: true,
      onMove: () => {},
    });
    this.preview = undefined;
    this.renderPanel();
    this.renderMoves();
  }

  private step(d: number) {
    if (!this.line) return;
    const next = this.idx + d;
    if (next < 0 || next >= this.line.nodes.length) return;
    this.idx = next;
    this.mount();
  }

  private renderMoves() {
    const el = this.el.querySelector<HTMLElement>('#ex-moves')!;
    const upto = this.line!.nodes.slice(0, this.idx);
    el.innerHTML = upto.map(n => {
      const san = n.turn === 'mine'
        ? n.candidates?.[0]?.san : n.replies?.[0]?.san;
      return `<span class="mv ${n.turn === 'mine' ? 'mine' : 'theirs'}">${san ?? ''}</span>`;
    }).join('');
  }

  private renderPanel() {
    const n = this.node()!;
    const panel = this.el.querySelector<HTMLElement>('#ex-panel')!;
    const moveNo = Math.floor((n.ply - 1) / 2) + 1;

    if (n.turn === 'theirs') {
      this.el.querySelector('#ex-prompt')!.innerHTML =
        `<strong>Move ${moveNo}. Their turn.</strong> What your opponents actually play here.`;
      const total = (n.replies ?? []).reduce((s, r) => s + r.count, 0);
      panel.innerHTML = `<div class="cand-list">${(n.replies ?? []).map((r, i) => `
        <div class="cand ${i === 0 ? 'main' : ''}">
          <span class="c-san">${r.san}</span>
          <span class="c-freq">${total ? `${r.pct}% (${r.count} games)` : 'engine choice'}</span>
        </div>`).join('')}</div>
        <p class="cand-note">The line continues with the most common reply.</p>`;
      return;
    }

    this.el.querySelector('#ex-prompt')!.innerHTML =
      `<strong>Move ${moveNo}. Your turn.</strong> Tap a move to play it out on the board.`;

    const cands = n.candidates ?? [];
    const your = n.your_move;
    const shownYour = your && !cands.some(c => c.uci === your.uci);

    panel.innerHTML = `
      <div class="cand-list">
        ${cands.map((c, i) => this.candHtml(c, i === 0, c.yours)).join('')}
        ${shownYour ? `<div class="cand-sep">what you usually play</div>
          ${this.candHtml(your as unknown as Candidate, false, your!.count)}` : ''}
      </div>
      <div class="preview" id="ex-preview"></div>`;

    panel.querySelectorAll<HTMLElement>('.cand[data-line]').forEach(el => {
      el.onclick = () => this.playOut(el.dataset.line!.split(' '), el.dataset.san!);
    });
  }

  private candHtml(c: Candidate, best: boolean, played?: number): string {
    const cp = c.cp ?? 0;
    const sign = cp > 0 ? '+' : '';
    const evalTxt = c.mate
      ? `#${Math.abs(c.mate)}`
      : `${sign}${(cp / 100).toFixed(1)}`;
    const cls = c.verdict === 'best' || c.verdict === 'fine' ? 'good'
      : c.verdict === 'slightly worse' ? 'mid' : 'bad';
    const yours = played ? `<span class="c-yours">you played this ${played}&times;</span>` : '';
    return `
      <div class="cand ${best ? 'main' : ''}" data-line="${(c.line ?? []).join(' ')}"
           data-san="${c.san}">
        <span class="c-san">${c.san}</span>
        <span class="c-eval ${cls}">${evalTxt}</span>
        <span class="c-verdict ${cls}">${c.verdict}</span>
        ${yours}
      </div>`;
  }

  /** Replay a candidate's variation on the board, one move at a time. */
  private playOut(sans: string[], san: string) {
    const n = this.node()!;
    const cand = (n.candidates ?? []).find(c => c.san === san)
      ?? (n.your_move?.san === san ? n.your_move : undefined);
    if (!cand) return;
    // rebuild fens by replaying the stored uci-free SAN line via the engine PV
    const fens = [n.fen];
    let fen = n.fen;
    const ucis = cand.line_uci ?? [];
    for (const u of ucis) {
      try { fen = advanceFen(fen, u); fens.push(fen); } catch { break; }
    }
    this.preview = { fens, sans, step: Math.min(1, fens.length - 1) };
    this.showPreview();
    this.el.querySelector('#ex-board')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  private showPreview() {
    const pv = this.preview;
    if (!pv) return;
    this.board!.setFen(pv.fens[pv.step], this.line!.color);
    this.board!.setViewOnly(true);
    const box = this.el.querySelector<HTMLElement>('#ex-preview');
    if (!box) return;
    box.innerHTML = `
      <div class="line-player">
        <button class="step" id="pv-prev">&#8249;</button>
        <div class="line-moves">${pv.sans.map((s, i) =>
          `<button class="ln-mv${i === pv.step - 1 ? ' current' : ''}" data-i="${i}">${s}</button>`
        ).join('')}</div>
        <button class="step" id="pv-next">&#8250;</button>
      </div>`;
    box.querySelectorAll<HTMLButtonElement>('.ln-mv').forEach(b => {
      b.onclick = () => { pv.step = Math.min(+b.dataset.i! + 1, pv.fens.length - 1); this.showPreview(); };
    });
    box.querySelector<HTMLButtonElement>('#pv-prev')!.onclick =
      () => { pv.step = Math.max(0, pv.step - 1); this.showPreview(); };
    box.querySelector<HTMLButtonElement>('#pv-next')!.onclick =
      () => { pv.step = Math.min(pv.fens.length - 1, pv.step + 1); this.showPreview(); };
  }
}
