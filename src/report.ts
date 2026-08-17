import { report } from './data';
import { stats, studiedToday, exportProgress, importProgress, resetAll } from './store';
import {
  VERSION, BUILT_AT, CONTENT, checkForUpdate, applyUpdate, updateState,
} from './version';

/** Your analysis and training plan, in plain language. */
export class ReportView {
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  render() {
    const s = stats();
    const md = (t: string) =>
      t.split('\n\n').map(p => {
        if (p.trim().startsWith('- ')) {
          const items = p.split('\n').filter(l => l.trim().startsWith('- '))
            .map(l => `<li>${bold(l.replace(/^\s*-\s*/, ''))}</li>`).join('');
          return `<ul>${items}</ul>`;
        }
        return `<p>${bold(p)}</p>`;
      }).join('');

    this.el.innerHTML = `
      <div class="view report-view">
        <div class="scorecard">
          <div><span class="big">${s.solved}</span><span>solved</span></div>
          <div><span class="big">${s.bestStreak}</span><span>best streak</span></div>
          <div><span class="big">${studiedToday()}</span><span>today</span></div>
        </div>

        <p class="headline">${report.headline}</p>

        ${report.sections.map(sec => `
          <section class="rep-section">
            <h3>${sec.title}</h3>
            ${sec.stat ? `<p class="stat">${sec.stat}</p>` : ''}
            ${md(sec.body)}
          </section>`).join('')}

        <h2 class="plan-head">Your training plan</h2>
        ${report.plan.map((p, i) => `
          <section class="plan-item">
            <h3><span class="num">${i + 1}</span> ${p.title}</h3>
            <p>${p.body}</p>
          </section>`).join('')}

        <section class="rep-section data-section">
          <h3>Your progress data</h3>
          <p>Progress is stored on this device only. Back it up if you reinstall.</p>
          <div class="actions">
            <button class="btn" id="rp-export">Export</button>
            <button class="btn" id="rp-import">Import</button>
            <button class="btn danger" id="rp-reset">Reset</button>
          </div>
          <textarea id="rp-box" rows="3" placeholder="progress data appears here"></textarea>
        </section>

        <section class="rep-section version-section">
          <h3>Version</h3>
          <dl class="ver">
            <dt>Build</dt><dd><code>${VERSION}</code></dd>
            <dt>Built</dt><dd>${BUILT_AT}</dd>
            <dt>Content</dt><dd>${CONTENT.puzzles} puzzles &middot;
              ${CONTENT.collapses} collapses &middot; ${CONTENT.openings} opening lines</dd>
          </dl>
          <div class="actions">
            <button class="btn" id="rp-check">Check for updates</button>
          </div>
          <p class="ver-status" id="rp-status"></p>
        </section>
      </div>`;

    const box = this.el.querySelector<HTMLTextAreaElement>('#rp-box')!;
    this.el.querySelector<HTMLButtonElement>('#rp-export')!.onclick = () => {
      box.value = exportProgress();
      box.select();
    };
    this.el.querySelector<HTMLButtonElement>('#rp-import')!.onclick = () => {
      if (importProgress(box.value)) this.render();
      else box.value = 'Could not read that data.';
    };
    this.el.querySelector<HTMLButtonElement>('#rp-reset')!.onclick = () => {
      if (confirm('Erase all your training progress?')) {
        resetAll();
        this.render();
      }
    };

    const status = this.el.querySelector<HTMLElement>('#rp-status')!;
    const describe = (s: string) => ({
      current: 'You have the latest version.',
      updating: 'Checking\u2026',
      ready: 'A new version is ready. Reload to use it.',
      offline: 'No connection, so this cannot be checked right now.',
      unsupported: 'This browser cannot check automatically; reload the page instead.',
    }[s] ?? '');
    status.textContent = describe(updateState());

    const check = this.el.querySelector<HTMLButtonElement>('#rp-check')!;
    check.onclick = async () => {
      check.disabled = true;
      status.textContent = describe('updating');
      const s = await checkForUpdate();
      status.textContent = describe(s);
      check.disabled = false;
      if (s === 'ready') {
        check.textContent = 'Reload now';
        check.onclick = () => void applyUpdate();
      }
    };
  }
}

function bold(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
