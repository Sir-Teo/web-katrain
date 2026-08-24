import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameAnalysisModal } from '../src/components/GameAnalysisModal';

describe('GameAnalysisModal', () => {
  it('uses explicit labels for re-analysis form controls', () => {
    const html = renderToStaticMarkup(<GameAnalysisModal onClose={() => undefined} />);
    const css = readFileSync('src/index.css', 'utf8');

    for (const id of [
      'game-analysis-max-visits',
      'game-analysis-limit-moves',
      'game-analysis-start-move',
      'game-analysis-end-move',
      'game-analysis-mistakes-only',
    ]) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }

    expect(html).not.toContain('data-game-analysis-progress="true"');
    expect(html).not.toContain('>Stop</button>');
    expect(html).not.toContain('role="status"');
    expect(html).toContain('grid gap-3 grid-cols-1');
    expect(html).toContain('Analysis depth presets');
    expect(html).not.toContain('MCTS depth presets');
    expect(html).toContain('id="game-analysis-depth-presets-label"');
    expect(html).toContain('aria-labelledby="game-analysis-depth-presets-label"');
    expect(html).toContain('game-analysis-modal ui-panel');
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.game-analysis-modal \{[^}]*max-height: calc\(100dvh - 24px\) !important;/);
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.game-analysis-modal button,[\s\S]*\.game-analysis-modal input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\) \{[\s\S]*min-height: 44px;/);
    expect(css).toMatch(/@media \(min-width: 540px\) and \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\.game-analysis-modal \{[^}]*max-width: min\(720px, calc\(100vw - 32px\)\) !important;[^}]*max-height: calc\(100dvh - 16px\) !important;/);
    expect(css).toMatch(/@media \(min-width: 700px\) and \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\.game-analysis-body > \.game-analysis-column:last-child \{[^}]*display: contents;/);
    expect(css).toMatch(/\.game-analysis-column \{[^}]*display: flex;[^}]*gap: 8px;/);
    expect(css).toMatch(/\.game-analysis-range \{[^}]*grid-column: 2;/);
    expect(css).toMatch(/\.game-analysis-mistakes \{[^}]*grid-column: 3;/);
  });

  it('shows live progress and a stop action while full re-analysis is running', () => {
    const source = readFileSync('src/components/GameAnalysisModal.tsx', 'utf8');

    expect(source).toContain("const isRunning = isGameAnalysisRunning && gameAnalysisType === 'full';");
    expect(source).toContain('{isRunning && (');
    expect(source).toContain("isRunning ? 'grid-cols-2' : 'grid-cols-1'");
    expect(source).toContain('data-game-analysis-progress="true"');
    expect(source).toContain('>Progress</div>');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-labelledby={STATUS_LABEL_ID}');
    expect(source).toContain('{gameAnalysisDone}/{gameAnalysisTotal}');
    expect(source).toContain('onClick={() => stopGameAnalysis()}');
  });
});
