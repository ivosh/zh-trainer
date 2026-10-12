import { ZhBoard, advanceFen } from './board';
import type { CourseCandidate, CourseLesson, CourseStep, OpeningCourse } from './data';
import { getCard, grade } from './store';

type Mode = 'practice' | 'explore';

function html(value: string | number): string {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]!);
}

function score(cp: number, mate: number | null): string {
  if (mate !== null) return `${mate > 0 ? '+' : '-'}#${Math.abs(mate)}`;
  const value = cp / 100;
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function replyLabel(candidate: CourseCandidate): string {
  const reply = candidate.pvSan[1];
  if (!reply) return 'The engine finds no further move in this line.';
  if (reply.includes('#')) return `${reply} is checkmate.`;
  if (reply.includes('+')) return `${reply} gives check.`;
  if (reply.includes('@')) return `${reply} is a pocket drop.`;
  if (reply.includes('x')) return `${reply} captures and gains a pocket piece.`;
  return `${reply} is the engine's strongest reply.`;
}

export class OpeningCourseView {
  private board?: ZhBoard;
  private course: OpeningCourse;
  private root: HTMLElement;
  private line: CourseLesson;
  private idx = 0;
  private mode: Mode = 'practice';
  private pending = false;
  private failed = false;
  private hintLevel = 0;
  private feedback = '';
  private timer?: number;
  private preview?: { fens: string[]; sans: string[]; index: number; candidate: CourseCandidate };

  constructor(root: HTMLElement, course: OpeningCourse) {
    this.root = root;
    this.course = course;
    const saved = localStorage.getItem('zh-opening-line');
    this.line = course.lessons.find(line => line.id === saved) ?? course.lessons[0];
    this.idx = this.line.startPly;
  }

  render() {
    this.root.innerHTML = `
      <div class="view course-view">
        <div class="toolbar"><select id="co-line" aria-label="Opening lesson"></select></div>
        <div class="course-summary" id="co-summary"></div>
        <div class="course-modes" role="group" aria-label="Opening mode">
          <button id="co-practice" type="button">Practice</button>
          <button id="co-explore" type="button">Explore lines</button>
        </div>
        <div class="prompt" id="co-prompt"></div>
        <div class="course-layout">
          <div class="board-wrap" id="co-board"></div>
          <div class="course-side">
            <div class="course-eval" id="co-eval"></div>
            <div id="co-panel"></div>
          </div>
        </div>
        <div class="actions">
          <button id="co-back" class="btn" type="button">Back</button>
          <button id="co-restart" class="btn" type="button">Restart</button>
          <button id="co-next" class="btn primary" type="button">Next</button>
        </div>
        <div class="moves course-moves" id="co-moves"></div>
      </div>`;
    const select = this.root.querySelector<HTMLSelectElement>('#co-line')!;
    select.innerHTML = this.course.lessons.map(line =>
      `<option value="${html(line.id)}">${line.color === 'white' ? 'White' : 'Black'} · ${html(line.name)}</option>`,
    ).join('');
    select.value = this.line.id;
    select.onchange = () => {
      this.line = this.course.lessons.find(line => line.id === select.value)!;
      localStorage.setItem('zh-opening-line', this.line.id);
      this.restart();
    };
    this.root.querySelector<HTMLButtonElement>('#co-practice')!.onclick = () => this.setMode('practice');
    this.root.querySelector<HTMLButtonElement>('#co-explore')!.onclick = () => this.setMode('explore');
    this.root.querySelector<HTMLButtonElement>('#co-back')!.onclick = () => this.moveStep(-1);
    this.root.querySelector<HTMLButtonElement>('#co-next')!.onclick = () => this.next();
    this.root.querySelector<HTMLButtonElement>('#co-restart')!.onclick = () => this.restart();
    this.showStep();
  }

  dispose() {
    this.clearTimer();
    this.board?.destroy();
    this.board = undefined;
  }

  private step(): CourseStep | undefined {
    return this.line.steps[this.idx];
  }

  private clearTimer() {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private restart() {
    this.idx = this.line.startPly;
    this.showStep();
  }

  private setMode(mode: Mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'practice') this.idx = Math.max(this.idx, this.line.startPly);
    this.showStep();
  }

  private moveStep(delta: number) {
    const next = this.idx + delta;
    const first = this.mode === 'practice' ? this.line.startPly : 0;
    if (next < first || next >= this.line.steps.length) return;
    if (this.mode === 'practice' && next > this.idx && !this.pending) return;
    this.idx = next;
    this.showStep();
  }

  private next() {
    if (this.mode === 'practice' && this.step()?.mine && !this.pending) {
      this.showSolution();
      return;
    }
    if (this.idx < this.line.steps.length) this.idx++;
    this.showStep();
  }

  private showStep() {
    this.clearTimer();
    this.pending = false;
    this.failed = false;
    this.hintLevel = 0;
    this.feedback = '';
    this.preview = undefined;
    this.board?.destroy();
    const step = this.step();
    if (step) {
      this.board = new ZhBoard(this.root.querySelector<HTMLElement>('#co-board')!, {
        fen: step.fen,
        orientation: this.line.color,
        viewOnly: this.mode === 'explore' || !step.mine,
        onMove: uci => this.tryMove(uci),
      });
    } else {
      this.board = undefined;
      this.root.querySelector<HTMLElement>('#co-board')!.innerHTML = '';
    }
    this.renderState();
    if (this.mode === 'practice' && step && !step.mine) {
      this.timer = window.setTimeout(() => {
        this.board?.applyUci(step.selected);
        this.idx++;
        this.showStep();
      }, 800);
    }
  }

  private renderState() {
    const step = this.step();
    const sources = this.line.sources;
    const moveCount = Math.ceil(this.line.steps.length / 2);
    const movesToLearn = this.line.steps.slice(this.line.startPly).filter(item => item.mine);
    const solved = movesToLearn.filter(item => getCard(this.cardId(item)).reps > 0).length;
    const opponentWord = sources.humanOpponents === 1 ? 'opponent' : 'opponents';
    const humanSummary = sources.human1800
      ? `<strong>${sources.human1800}</strong> human 1800+ games from ${sources.humanOpponents} ${opponentWord}`
      : '<strong>0</strong> human 1800+ games';
    const scenario = this.line.startPly ? ` · scenario starts at move ${Math.ceil((this.line.startPly + 1) / 2)}` : '';
    this.root.querySelector<HTMLElement>('#co-summary')!.innerHTML =
      `${humanSummary} · ` +
      `<strong>${sources.ai5}</strong> AI level 5 games · through move ${moveCount}${scenario} · ` +
      `<strong>${solved}/${movesToLearn.length}</strong> solved`;
    this.root.querySelector('#co-practice')!.classList.toggle('active', this.mode === 'practice');
    this.root.querySelector('#co-explore')!.classList.toggle('active', this.mode === 'explore');
    const prompt = this.root.querySelector<HTMLElement>('#co-prompt')!;
    if (!step) {
      prompt.innerHTML = '<strong>Line complete.</strong> Restart or choose another opening.';
    } else if (this.mode === 'explore') {
      prompt.innerHTML = `<strong>Move ${Math.ceil(step.ply / 2)}. ${step.mine ? 'Your' : 'Their'} turn.</strong> ` +
        'Compare the engine lines and step through their replies.';
    } else if (!step.mine) {
      prompt.innerHTML = `<strong>Move ${Math.ceil(step.ply / 2)}.</strong> Opponent plays ${html(step.selectedSan)}.`;
    } else if (this.pending) {
      prompt.innerHTML = `<strong>${html(step.selectedSan)}.</strong> Review the reason and the reply, then continue.`;
    } else {
      prompt.innerHTML = `<strong>Move ${Math.ceil(step.ply / 2)}. Your turn.</strong> Find the course move.`;
    }
    const next = this.root.querySelector<HTMLButtonElement>('#co-next')!;
    next.textContent = this.mode === 'practice' && step?.mine && !this.pending ? 'Show move' : 'Continue';
    next.disabled = !step;
    this.root.querySelector<HTMLButtonElement>('#co-back')!.disabled =
      this.idx <= (this.mode === 'practice' ? this.line.startPly : 0);
    this.renderEval();
    this.renderPanel();
    this.renderMoves();
  }

  private renderEval() {
    const box = this.root.querySelector<HTMLElement>('#co-eval')!;
    const step = this.step();
    if (!step || !step.eval || (this.mode === 'practice' && !this.pending)) {
      box.innerHTML = '';
      return;
    }
    const candidate = this.mode === 'explore' ? this.preview?.candidate : undefined;
    const cp = candidate?.cp ?? step.eval.cp;
    const mate = candidate ? candidate.mate : step.eval.mate;
    const pct = Math.round(100 / (1 + Math.exp(-cp / 250)));
    box.innerHTML = `<span>${candidate ? 'Selected line' : 'Engine estimate for you'}</span><strong>${score(cp, mate)}</strong>` +
      `<div class="course-eval-track"><div style="width:${pct}%"></div></div>`;
  }

  private renderPanel() {
    const panel = this.root.querySelector<HTMLElement>('#co-panel')!;
    const step = this.step();
    if (!step) {
      panel.innerHTML = '';
      return;
    }
    if (this.mode === 'explore') {
      this.renderExplore(panel, step);
      return;
    }
    if (!step.mine) {
      panel.innerHTML = `<p class="course-note">${this.supportText(step)}</p>`;
      return;
    }
    if (!this.pending) {
      panel.innerHTML = `<div class="course-feedback">${this.feedback}</div>` +
        `<div class="course-help"><button id="co-hint" class="btn" type="button">Hint</button>` +
        `<button id="co-solution" class="btn" type="button">Show solution</button></div>` +
        `<p class="course-note">${getCard(this.cardId(step)).reps ? 'Reviewed before' : 'New position'} · ` +
        `${this.supportText(step)}</p>`;
      panel.querySelector<HTMLButtonElement>('#co-hint')!.onclick = () => this.hint();
      panel.querySelector<HTMLButtonElement>('#co-solution')!.onclick = () => this.showSolution();
      return;
    }
    const candidate = step.candidates.find(c => c.uci === step.selected);
    const alternative = step.candidates.filter(c => c.uci !== step.selected)
      .sort((a, b) => b.cp - a.cp)[0];
    const comparison = candidate && alternative
      ? `<p><strong>Compare:</strong> ${html(alternative.san)} scores ${score(alternative.cp, alternative.mate)}. ` +
        `${html(replyLabel(alternative))}</p>`
      : '';
    panel.innerHTML = `<div class="course-feedback">${this.feedback}</div>` +
      `<div class="course-explain"><h3>Why ${html(step.selectedSan)}?</h3>` +
      `<p>${html(step.idea)}</p>` +
      `${step.threat ? `<p><strong>Threat before your move:</strong> ${html(step.threat)}</p>` : ''}` +
      `<p><strong>Watch for:</strong> ${html(step.watch || (candidate ? replyLabel(candidate) : 'No forcing reply in the analyzed line.'))}</p>` +
      comparison +
      `<p><strong>Engine line:</strong> ${html(candidate?.pvSan.join(' ') || step.selectedSan)}</p></div>` +
      `<button id="co-view-line" class="btn course-wide" type="button">Explore the engine line</button>`;
    panel.querySelector<HTMLButtonElement>('#co-view-line')!.onclick = () => {
      this.setMode('explore');
      const match = this.step()?.candidates.find(c => c.uci === step.selected);
      if (match) this.previewCandidate(match);
    };
  }

  private supportText(step: CourseStep): string {
    const s = step.support;
    if (s.human1800 + s.ai5 + s.other === 0) return 'Engine continuation beyond matching games';
    return `${s.human1800} human 1800+ · ${s.ai5} AI level 5 · ${s.other} other recent games followed this move`;
  }

  private renderExplore(panel: HTMLElement, step: CourseStep) {
    const sorted = [...step.candidates].sort((a, b) => step.mine ? b.cp - a.cp : a.cp - b.cp);
    panel.innerHTML = `<p class="course-note">Scores are from your side. Engine searched deeper than the three full moves shown.</p>` +
      `<div class="cand-list">${sorted.map(candidate =>
        `<button type="button" class="course-candidate ${candidate.uci === step.selected ? 'chosen' : ''}" data-uci="${html(candidate.uci)}">` +
          `<strong>${html(candidate.san)}</strong><span>${score(candidate.cp, candidate.mate)}</span>` +
          `<small>${candidate.uci === step.selected ? 'course line · ' : ''}depth ${candidate.depth}</small></button>`,
      ).join('')}</div><div id="co-preview"></div>`;
    panel.querySelectorAll<HTMLButtonElement>('.course-candidate').forEach(button => {
      button.onclick = () => {
        const candidate = step.candidates.find(c => c.uci === button.dataset.uci);
        if (candidate) this.previewCandidate(candidate);
      };
    });
    if (this.preview) this.renderPreview();
  }

  private previewCandidate(candidate: CourseCandidate) {
    const step = this.step();
    if (!step) return;
    const fens = [step.fen];
    let fen = step.fen;
    for (const uci of candidate.pvUci) {
      try {
        fen = advanceFen(fen, uci);
        fens.push(fen);
      } catch { break; }
    }
    this.preview = { fens, sans: candidate.pvSan.slice(0, fens.length - 1), index: Math.min(1, fens.length - 1), candidate };
    this.renderEval();
    this.renderPreview();
  }

  private renderPreview() {
    const preview = this.preview;
    const box = this.root.querySelector<HTMLElement>('#co-preview');
    if (!preview || !box) return;
    this.board?.setFen(preview.fens[preview.index], this.line.color);
    this.board?.setViewOnly(true);
    box.innerHTML = `<div class="course-explain"><strong>Reply to watch:</strong> ${html(replyLabel(preview.candidate))}</div>` +
      `<div class="line-player"><button id="co-pv-back" class="step" type="button" aria-label="Previous move">‹</button>` +
      `<div class="line-moves">${preview.sans.map((san, index) =>
        `<button type="button" class="ln-mv ${index === preview.index - 1 ? 'current' : ''}" data-index="${index + 1}">${html(san)}</button>`,
      ).join('')}</div><button id="co-pv-next" class="step" type="button" aria-label="Next move">›</button></div>`;
    box.querySelector<HTMLButtonElement>('#co-pv-back')!.onclick = () => this.previewAt(preview.index - 1);
    box.querySelector<HTMLButtonElement>('#co-pv-next')!.onclick = () => this.previewAt(preview.index + 1);
    box.querySelectorAll<HTMLButtonElement>('.ln-mv').forEach(button => {
      button.onclick = () => this.previewAt(Number(button.dataset.index));
    });
  }

  private previewAt(index: number) {
    if (!this.preview) return;
    this.preview.index = Math.max(0, Math.min(index, this.preview.fens.length - 1));
    this.renderPreview();
  }

  private renderMoves() {
    const box = this.root.querySelector<HTMLElement>('#co-moves')!;
    const max = this.mode === 'explore' ? this.line.steps.length : this.idx + (this.pending ? 1 : 0);
    box.innerHTML = this.line.steps.slice(0, max).map((step, index) =>
      `<button type="button" class="mv ${step.mine ? 'mine' : 'theirs'} ${index === this.idx ? 'current' : ''}" data-index="${index}">` +
      `${index % 2 === 0 ? `${Math.ceil(step.ply / 2)}. ` : ''}${html(step.selectedSan)}</button>`,
    ).join('');
    box.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      button.onclick = () => {
        this.idx = Number(button.dataset.index);
        this.showStep();
      };
    });
  }

  private cardId(step: CourseStep): string {
    return `opening-${step.fen}-${step.selected}`;
  }

  private hint() {
    const step = this.step();
    if (!step?.mine || this.pending) return;
    this.hintLevel++;
    if (this.hintLevel === 1) {
      this.feedback = `<span class="hint">Hint: ${html(step.idea)}</span>`;
    } else {
      this.board?.drawArrow(step.selected);
      this.feedback = '<span class="hint">The arrow marks the course move.</span>';
    }
    this.renderPanel();
  }

  private showSolution() {
    const step = this.step();
    if (!step?.mine || this.pending) return;
    this.finishMove(true);
  }

  private tryMove(uci: string) {
    const step = this.step();
    if (this.mode !== 'practice' || !step?.mine || this.pending) return;
    if (uci === step.selected) {
      this.finishMove(false);
      return;
    }
    this.board?.shake();
    this.board?.setFen(step.fen);
    const candidate = step.candidates.find(c => c.uci === uci);
    const chosen = step.candidates.find(c => c.uci === step.selected);
    if (candidate && chosen && candidate.cp >= chosen.cp - 60 && candidate.mate === chosen.mate) {
      this.feedback = `<span class="hint">${html(candidate.san)} also looks playable (${score(candidate.cp, candidate.mate)}). ` +
        `This course practices ${html(step.selectedSan)}. ${html(replyLabel(candidate))}</span>`;
    } else if (candidate) {
      this.failed = true;
      this.feedback = `<span class="bad">${html(candidate.san)} is weaker here (${score(candidate.cp, candidate.mate)}). ` +
        `${html(replyLabel(candidate))}</span>`;
    } else {
      this.feedback = '<span class="hint">That legal move has no prepared engine score here. Try a hint or compare the analyzed lines.</span>';
    }
    this.renderPanel();
  }

  private finishMove(revealed: boolean) {
    const step = this.step()!;
    this.board?.clearShapes();
    this.board?.applyUci(step.selected);
    this.board?.setViewOnly(true);
    this.pending = true;
    grade(this.cardId(step), revealed || this.failed ? 0 : this.hintLevel ? 1 : 2);
    this.feedback = revealed
      ? `<span class="shown">Course move: <strong>${html(step.selectedSan)}</strong></span>`
      : `<span class="ok">Correct: <strong>${html(step.selectedSan)}</strong></span>`;
    this.renderState();
  }
}
