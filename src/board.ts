import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key, Color as CgColor } from 'chessground/types';
import { Crazyhouse } from 'chessops/variant';
import { parseFen, makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { chessgroundDests } from 'chessops/compat';
import { parseSquare, makeSquare, parseUci } from 'chessops/util';
import type { Move, Role, Color } from 'chessops/types';

export const ROLES: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
export const ROLE_LETTER: Record<string, string> = {
  pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q',
};
const LETTER_ROLE: Record<string, Role> = {
  P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen',
};

export function uciToMove(uci: string): Move | undefined {
  return parseUci(uci);
}

export function moveToUci(m: Move): string {
  if ('role' in m) return `${ROLE_LETTER[m.role]}@${makeSquare(m.to)}`;
  const promo = m.promotion ? ROLE_LETTER[m.promotion].toLowerCase() : '';
  return `${makeSquare(m.from)}${makeSquare(m.to)}${promo}`;
}

export function posFromFen(fen: string): Crazyhouse | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Crazyhouse.fromSetup(setup.value);
  return pos.isErr ? undefined : pos.value;
}

export function sanOf(fen: string, uci: string): string {
  const pos = posFromFen(fen);
  const mv = parseUci(uci);
  if (!pos || !mv) return uci;
  return makeSan(pos, mv);
}

/** Pocket counts for a side, as an ordered list. */
export function pocketOf(pos: Crazyhouse, color: Color): { role: Role; count: number }[] {
  const side = pos.pockets?.[color];
  if (!side) return [];
  return ROLES.map(r => ({ role: r, count: side[r] })).filter(x => x.count > 0);
}

export interface BoardOptions {
  fen: string;
  orientation: CgColor;
  onMove: (uci: string, san: string) => void;
  viewOnly?: boolean;
}

/**
 * A crazyhouse board: chessground for the 8x8 plus hand-rolled pockets,
 * since chessground has no pocket support.
 */
export class ZhBoard {
  private cg: Api;
  private pos: Crazyhouse;
  private selectedDrop: Role | undefined;
  private orientation: CgColor;
  private onMove: (uci: string, san: string) => void;
  private viewOnly: boolean;
  private topEl: HTMLElement;
  private bottomEl: HTMLElement;
  private boardEl: HTMLElement;

  constructor(root: HTMLElement, opts: BoardOptions) {
    root.innerHTML = `
      <div class="zh-pocket" data-side="top"></div>
      <div class="zh-board"></div>
      <div class="zh-pocket" data-side="bottom"></div>`;
    this.topEl = root.querySelector('[data-side=top]')!;
    this.bottomEl = root.querySelector('[data-side=bottom]')!;
    this.boardEl = root.querySelector('.zh-board')!;
    this.orientation = opts.orientation;
    this.onMove = opts.onMove;
    this.viewOnly = !!opts.viewOnly;
    this.pos = posFromFen(opts.fen)!;

    this.cg = Chessground(this.boardEl, {
      fen: opts.fen.split('[')[0],
      orientation: this.orientation,
      viewOnly: this.viewOnly,
      coordinates: true,
      movable: {
        free: false,
        showDests: true,
        events: { after: (from, to) => this.handleBoardMove(from, to) },
      },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true },
    });
    this.refresh();
  }

  private turnColor(): CgColor {
    return this.pos.turn === 'white' ? 'white' : 'black';
  }

  setFen(fen: string, orientation?: CgColor) {
    this.pos = posFromFen(fen)!;
    if (orientation) this.orientation = orientation;
    this.selectedDrop = undefined;
    this.cg.set({
      fen: fen.split('[')[0],
      orientation: this.orientation,
      lastMove: undefined,
      check: false,
    });
    this.refresh();
  }

  setViewOnly(v: boolean) {
    this.viewOnly = v;
    this.refresh();
  }

  shake() {
    this.boardEl.classList.remove('shake');
    void this.boardEl.offsetWidth;
    this.boardEl.classList.add('shake');
  }

  drawArrow(uci: string) {
    const to = uci.includes('@') ? uci.slice(2) : uci.slice(2, 4);
    const from = uci.includes('@') ? undefined : uci.slice(0, 2);
    if (from) {
      this.cg.setShapes([{ orig: from as Key, dest: to as Key, brush: 'green' }]);
    } else {
      this.cg.setShapes([{ orig: to as Key, brush: 'green' }]);
    }
  }

  clearShapes() {
    this.cg.setShapes([]);
  }

  /** Play a move on the internal position and update the view. */
  applyUci(uci: string) {
    const mv = parseUci(uci);
    if (!mv || !this.pos.isLegal(mv)) return;
    this.pos.play(mv);
    const fen = makeFen(this.pos.toSetup());
    const to = uci.includes('@') ? uci.slice(2) : uci.slice(2, 4);
    const from = uci.includes('@') ? to : uci.slice(0, 2);
    this.cg.set({ fen: fen.split('[')[0], lastMove: [from as Key, to as Key] });
    this.refresh();
  }

  get fen(): string {
    return makeFen(this.pos.toSetup());
  }

  private handleBoardMove(from: Key, to: Key) {
    const fromSq = parseSquare(from)!;
    const toSq = parseSquare(to)!;
    let mv: Move = { from: fromSq, to: toSq };
    // auto-queen: crazyhouse promotions are almost always to queen
    const piece = this.pos.board.get(fromSq);
    if (piece?.role === 'pawn') {
      const rank = toSq >> 3;
      if (rank === 7 || rank === 0) mv = { ...mv, promotion: 'queen' };
    }
    if (!this.pos.isLegal(mv)) {
      this.refresh();
      return;
    }
    const san = makeSan(this.pos.clone(), mv);
    this.onMove(moveToUci(mv), san);
  }

  private handleDropTo(sq: string) {
    if (!this.selectedDrop) return;
    const to = parseSquare(sq);
    if (to === undefined) return;
    const mv: Move = { role: this.selectedDrop, to };
    if (!this.pos.isLegal(mv)) return;
    const san = makeSan(this.pos.clone(), mv);
    this.selectedDrop = undefined;
    this.onMove(moveToUci(mv), san);
  }

  /** Redraw pockets and legal destinations. */
  refresh() {
    const turn = this.turnColor();
    const dests = chessgroundDests(this.pos);
    this.cg.set({
      turnColor: turn,
      viewOnly: this.viewOnly,
      check: this.pos.isCheck() ? turn : false,
      movable: {
        color: this.viewOnly ? undefined : turn,
        dests: this.selectedDrop ? new Map() : dests,
      },
    });
    this.renderPockets();
    this.renderDropTargets();
  }

  private renderPockets() {
    const bottomColor: Color = this.orientation === 'white' ? 'white' : 'black';
    const topColor: Color = bottomColor === 'white' ? 'black' : 'white';
    this.renderPocket(this.topEl, topColor);
    this.renderPocket(this.bottomEl, bottomColor);
  }

  private renderPocket(el: HTMLElement, color: Color) {
    const items = pocketOf(this.pos, color);
    const canUse = !this.viewOnly && this.pos.turn === color;
    el.innerHTML = '';
    el.classList.toggle('active', canUse);
    if (!items.length) {
      el.innerHTML = '<span class="pocket-empty">no pieces in hand</span>';
      return;
    }
    for (const { role, count } of items) {
      const b = document.createElement('button');
      b.className = `pocket-piece ${color} ${role}`;
      b.dataset.role = role;
      b.disabled = !canUse;
      b.setAttribute('aria-label', `${ROLE_LETTER[role]} in hand, ${count}`);
      if (this.selectedDrop === role && canUse) b.classList.add('selected');
      b.innerHTML = `<span class="count">${count}</span>`;
      b.onclick = () => {
        if (!canUse) return;
        this.selectedDrop = this.selectedDrop === role ? undefined : role;
        this.refresh();
      };
      el.appendChild(b);
    }
  }

  /** Overlay clickable squares when a pocket piece is selected. */
  private renderDropTargets() {
    this.boardEl.querySelectorAll('.drop-target').forEach(e => e.remove());
    if (!this.selectedDrop || this.viewOnly) return;
    const cont = this.boardEl.querySelector('cg-container');
    if (!cont) return;
    const role = this.selectedDrop;
    for (let sq = 0; sq < 64; sq++) {
      if (!this.pos.isLegal({ role, to: sq })) continue;
      const key = makeSquare(sq);
      const file = sq & 7;
      const rank = sq >> 3;
      const x = this.orientation === 'white' ? file : 7 - file;
      const y = this.orientation === 'white' ? 7 - rank : rank;
      const d = document.createElement('div');
      d.className = 'drop-target';
      d.style.left = `${x * 12.5}%`;
      d.style.top = `${y * 12.5}%`;
      d.onclick = () => this.handleDropTo(key);
      cont.appendChild(d);
    }
  }

  destroy() {
    this.cg.destroy();
  }
}
