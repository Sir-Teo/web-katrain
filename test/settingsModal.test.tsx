import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsModal } from '../src/components/SettingsModal';

describe('SettingsModal', () => {
  it('uses theme-aware tab classes instead of hard-coded dark colors', () => {
    const html = renderToStaticMarkup(<SettingsModal onClose={() => undefined} />);

    expect(html).toContain('settings-modal');
    expect(html).toContain('settings-tabs');
    expect(html).toContain('settings-tab-active');
    expect(html).not.toContain('border-blue-500');
    expect(html).not.toContain('text-white border-b-2');
    expect(html).not.toContain('text-white');
    expect(html).not.toContain('bg-slate-900/60');
    expect(html).not.toContain('bg-slate-800/70');
  });

  it('keeps deep settings labels on theme tokens', () => {
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    expect(source).not.toContain('text-slate-300');
    expect(source).not.toContain('text-slate-400');
    expect(source).not.toContain('border-slate-700/50');
  });

  it('shows board theme descriptions in the Kaya-style picker', () => {
    const html = renderToStaticMarkup(<SettingsModal onClose={() => undefined} />);

    expect(html).toContain('Kaya-style previews');
    expect(html).toContain('Traditional clamshell and slate stones');
    expect(html).toContain('id="settings-board-theme-label"');
    expect(html).toContain('aria-labelledby="settings-board-theme-label"');
    expect(html).not.toContain('<label class="ui-text-muted block">Board Theme</label>');
  });

  it('binds General settings labels to their controls', () => {
    const html = renderToStaticMarkup(<SettingsModal onClose={() => undefined} />);

    [
      ['settings-sound-enabled', 'Sound Effects'],
      ['settings-timer-sound', 'Timer Sound'],
      ['settings-main-time', 'Main Time (min)'],
      ['settings-byo-length', 'Byo Length (sec)'],
      ['settings-byo-periods', 'Byo Periods'],
      ['settings-minimal-use', 'Minimal Use (sec)'],
      ['settings-show-coordinates', 'Show Coordinates'],
      ['settings-next-move-preview', 'Next Move Preview'],
      ['settings-show-move-numbers', 'Show Move Numbers'],
      ['settings-show-board-controls', 'Show Board Controls'],
      ['settings-fuzzy-stone-placement', 'Fuzzy Stone Placement'],
      ['settings-default-board-size', 'Default Board Size'],
      ['settings-default-handicap', 'Default Handicap'],
      ['settings-ui-theme', 'UI Theme'],
      ['settings-ui-density', 'UI Density'],
      ['settings-gamepad-navigation', 'Gamepad Navigation'],
      ['settings-touch-haptics', 'Touch Haptics'],
      ['settings-load-sgf-rewind', 'Load SGF Rewind'],
      ['settings-load-sgf-fast-analysis', 'Load SGF Fast Analysis'],
      ['settings-pv-animation-time', 'PV Animation Time (sec)'],
      ['settings-game-rules', 'Rules'],
    ].forEach(([id, label]) => {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`>${label}</label>`);
    });
  });

  it('binds Analysis settings labels to their controls', () => {
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    [
      ['settings-analysis-show-children', 'Show Children ('],
      ['settings-analysis-evaluation-dots', 'Evaluation Dots ('],
      ['settings-analysis-top-moves', 'Top Moves (Hints) ('],
      ['settings-analysis-policy', 'Move Heatmap ('],
      ['settings-analysis-ownership', 'Ownership (Territory) ('],
      ['settings-analysis-evaluation-theme', 'Evaluation Theme'],
      ['settings-analysis-low-visits-threshold', 'Low Visits Threshold'],
      ['settings-analysis-primary-label', 'Primary Label'],
      ['settings-analysis-secondary-label', 'Secondary Label'],
      ['settings-analysis-policy-heatmap', 'Heatmap Metric ('],
      ['settings-analysis-extra-precision', 'Extra Precision'],
      ['settings-analysis-show-ai-dots', 'Show AI Dots'],
      ['settings-analysis-save-analysis', 'Save analysis in SGF'],
      ['settings-analysis-save-sgf-marks', 'Save SGF marks (X / square)'],
      ['settings-analysis-lock-ai-details', 'Lock AI details (Play mode)'],
      ['settings-analysis-last-n-eval-dots', 'Show Last N Eval Dots'],
      ['settings-analysis-mistake-threshold', 'Mistake Threshold (Points)'],
    ].forEach(([id, label]) => {
      expect(source).toContain(`htmlFor="${id}"`);
      expect(source).toContain(`id="${id}"`);
      expect(source).toContain(label);
    });

    [
      'settings-teach-threshold',
      'settings-teach-undo',
      'settings-teach-show-dots',
      'settings-teach-save-sgf',
    ].forEach((id) => {
      expect(source).toContain(`htmlFor={\`${id}-${'${i}'}\`}`);
      expect(source).toContain(`id={\`${id}-${'${i}'}\`}`);
    });
    expect(source).toContain('<span className="sr-only"> row {i + 1}</span>');
  });

  it('binds AI and engine settings labels to their controls', () => {
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    [
      'settings-ai-strategy',
      'settings-ai-rank-kyu',
      'settings-ai-scoreloss-strength',
      'settings-ai-jigo-target-score',
      'settings-ai-ownership-max-points-lost',
      'settings-ai-ownership-settled-weight',
      'settings-ai-ownership-opponent-factor',
      'settings-ai-ownership-min-visits',
      'settings-ai-ownership-attach-penalty',
      'settings-ai-ownership-tenuki-penalty',
      'settings-ai-policy-opening-moves',
      'settings-ai-weighted-override',
      'settings-ai-weighted-weaken',
      'settings-ai-weighted-lower',
      'settings-ai-pick-override',
      'settings-ai-pick-n',
      'settings-ai-pick-frac',
      'settings-ai-local-override',
      'settings-ai-local-stddev',
      'settings-ai-local-endgame',
      'settings-ai-local-pick-n',
      'settings-ai-local-pick-frac',
      'settings-ai-tenuki-override',
      'settings-ai-tenuki-stddev',
      'settings-ai-tenuki-endgame',
      'settings-ai-tenuki-pick-n',
      'settings-ai-tenuki-pick-frac',
      'settings-ai-edge-override',
      'settings-ai-edge-threshold',
      'settings-ai-edge-line-weight',
      'settings-ai-edge-pick-n',
      'settings-ai-edge-pick-frac',
      'settings-ai-edge-endgame',
      'settings-katago-model-url',
      'settings-katago-backend',
      'settings-katago-visits',
      'settings-katago-fast-review-depth',
      'settings-katago-max-time',
      'settings-katago-batch-size',
      'settings-katago-max-children',
      'settings-katago-top-moves',
      'settings-katago-wide-root-noise',
      'settings-katago-pv-len',
      'settings-katago-ownership',
      'settings-katago-reuse-tree',
      'settings-katago-randomize-symmetry',
      'settings-katago-conservative-pass',
    ].forEach((id) => {
      expect(source).toContain(`htmlFor="${id}"`);
      expect(source).toContain(`id="${id}"`);
    });

    expect(source).not.toContain('aria-label="Fast review visits"');
    expect(source).toContain('<div className="text-xs text-[var(--ui-text-faint)]">Upload weights (.bin.gz)</div>');
    expect(source).toContain('<div className="text-xs text-[var(--ui-text-faint)]">Official KataGo models (download links)</div>');
    expect(source).toContain('data-katago-uploaded-model-summary="true"');
    expect(source).toContain('data-katago-model-download-progress="true"');
    expect(source).toContain('data-katago-backend-selector="true"');
    expect(source).toContain('data-katago-backend-option={option.value}');
    expect(source).toContain('data-katago-backend-available={available}');
    expect(source).toContain('data-katago-backend-status="true"');
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('role="radio"');
    expect(source).toContain('aria-disabled={!available}');
    expect(source).toContain('detectWebGpuAvailability');
    expect(source).toContain('isKataGoBackendAvailable(option.value, webGpuAvailability)');
    expect(source).toContain("unavailableDescription: 'Not available in this browser'");
    expect(source).toContain('if (!available) return;');
    expect(source).toContain('aria-labelledby="settings-katago-backend-label"');
    expect(source).toContain('FaCheck aria-hidden="true"');
    expect(source).toContain('fallback from <span className="font-mono">{requestedBackendLabel}</span>');
    expect(source).toContain("event.key === 'ArrowRight'");
    expect(source).toContain("event.key === 'ArrowLeft'");
    expect(source).toContain('tabIndex={active ? 0 : -1}');
    expect(source).toContain('onKeyDown={(event) => handleBackendOptionKeyDown(event, option.value)}');
    expect(source).toContain('getModelFileNameFromUrl(url)');
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('Active browser upload');
  });
});
