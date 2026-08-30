import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsModal } from '../src/components/SettingsModal';
import { BOARD_THEME_OPTIONS } from '../src/utils/boardThemes';

describe('SettingsModal', () => {
  it('uses theme-aware tab classes instead of hard-coded dark colors', () => {
    const html = renderToStaticMarkup(<SettingsModal onClose={() => undefined} />);
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('settings-modal');
    expect(html).toContain('settings-tabs');
    expect(html).toContain('settings-tab-active');
    expect(html).toContain('aria-label="AI/Engine"');
    expect(html).toContain('settings-tab-label-full');
    expect(html).toContain('settings-tab-label-compact');
    expect(html).toContain('>Engine</span>');
    expect(html).toContain('>Keys</span>');
    expect(css).toMatch(/@media \(max-width: 360px\)[\s\S]*\.settings-modal \.settings-tab-label-full[\s\S]*display: none/);
    expect(css).toMatch(/@media \(max-width: 360px\)[\s\S]*\.settings-modal \.settings-tab-label-compact[\s\S]*display: inline/);
    expect(html).not.toContain('border-blue-500');
    expect(html).not.toContain('text-white border-b-2');
    expect(html).not.toContain('text-white');
    expect(html).not.toContain('bg-slate-900/60');
    expect(html).not.toContain('bg-slate-800/70');
  });

  it('pairs plain rows into two columns on a wide dialog', () => {
    // The dialog is 960px wide, so a right-aligned switch sat ~690px from its
    // label. Pairing the rows brings that under 300px and halves the run of
    // toggles; blocks with their own internal layout keep the full width.
    const html = renderToStaticMarkup(<SettingsModal onClose={() => undefined} />);
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('settings-row');
    expect(css).toMatch(
      /@media \(min-width: 900px\)[\s\S]*\.settings-section > div:has\(> \.settings-row\) \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
    );
    // Everything that is not a plain row spans both columns, and the grid gap
    // replaces the margins Tailwind's space-y-4 puts on the siblings.
    expect(css).toMatch(
      /\.settings-section > div:has\(> \.settings-row\) > \* \{[\s\S]*grid-column: 1 \/ -1;[\s\S]*margin-top: 0 !important/
    );
    expect(css).toMatch(
      /\.settings-section > div:has\(> \.settings-row\) > \.settings-row \{[\s\S]*grid-column: span 1/
    );
  });

  it('keeps settings content scrollable in short landscape dialogs', () => {
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');
    const shortLandscapeBodyRule = css.match(/\.settings-modal \.settings-modal-body \{[^}]+\}/)?.[0] ?? '';

    expect(source).toContain('settings-modal-body min-h-0');
    expect(source).toContain('settings-modal-content min-h-0 flex-1 overflow-y-auto');
    expect(source).toContain('settings-modal-header sticky');
    expect(source).toContain('settings-modal-footer sticky');
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\.settings-modal \.settings-modal-header,[\s\S]*padding-top: 8px !important;/);
    expect(shortLandscapeBodyRule).toContain('padding-bottom: 8px !important;');
    expect(shortLandscapeBodyRule).toContain('display: grid !important;');
    expect(shortLandscapeBodyRule).toContain('grid-template-columns: minmax(9rem, 0.42fr) minmax(0, 1fr);');
    expect(css).toMatch(/\.settings-modal \.settings-search,[\s\S]*\.settings-modal \.settings-tabs[\s\S]*margin-bottom: 0 !important;/);
    expect(css).toMatch(/\.settings-modal \.settings-modal-content[\s\S]*grid-column: 1 \/ -1;[\s\S]*grid-row: 2;/);
  });

  it('keeps deep settings labels on theme tokens', () => {
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    expect(source).not.toContain('text-slate-300');
    expect(source).not.toContain('text-slate-400');
    expect(source).not.toContain('border-slate-700/50');
  });

  it('shows board theme descriptions in the theme picker', () => {
    const html = renderToStaticMarkup(<SettingsModal onClose={() => undefined} />);
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    // The native name is only appended when it differs from the English one, so
    // English renders bare rather than as "English (English)".
    expect(html).not.toContain('English (English)');
    expect(html).toContain('Japanese (日本語)');
    expect(html).toContain('data-settings-locale="true"');
    expect(html).toContain('Traditional clamshell and slate stones');
    expect(html).toContain('id="settings-board-theme-label"');
    expect(html).toContain('id="settings-board-theme"');
    expect(html).toContain('aria-labelledby="settings-board-theme-label"');
    expect(html).not.toMatch(/<input[^>]*id="settings-board-theme"/);
    expect(html.match(/role="radio"[^>]*tabindex="0"/g) ?? []).toHaveLength(1);
    expect(html.match(/role="radio"[^>]*tabindex="-1"/g) ?? []).toHaveLength(BOARD_THEME_OPTIONS.length - 1);
    expect(source).toContain("event.key === 'ArrowRight' || event.key === 'ArrowDown'");
    expect(source).toContain("'[role=\"radio\"][aria-checked=\"true\"]'");
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
      ['settings-app-locale', 'Document language metadata'],
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
    expect(source).toContain('Official model downloads');
    expect(source).toContain('aria-expanded={officialModelsOpen}');
    // Declared only while open: the region is unmounted when collapsed, and a
    // reference to an element that is not there is worse than none at all.
    expect(source).toContain("aria-controls={officialModelsOpen ? 'settings-official-models' : undefined}");
    expect(source).toContain('Advanced engine tuning');
    expect(source).toContain('aria-expanded={advancedEngineOpen}');
    expect(source).toContain("aria-controls={advancedEngineOpen ? 'settings-advanced-engine' : undefined}");
    expect(source).toContain('ADVANCED_ENGINE_SETTING_IDS.has(entry.id)');
    expect(source).toContain('setAdvancedEngineOpen(true)');
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
    expect(source).toContain('data-settings-search-id="settings-katago-backend"');
    expect(source).not.toMatch(/<input[^>]*id="settings-katago-backend"/);
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

  it('shares the themed switch with every other boolean control', () => {
    const css = readFileSync('src/index.css', 'utf8');

    // Scoping these rules to `.settings-modal` left the identical `toggle`
    // class rendering a bare 13px native checkbox in the other dialogs that
    // use it — a third of the minimum touch target.
    expect(css).not.toContain('.settings-modal .toggle');
    expect(css).toMatch(/\n {2}\.toggle \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(css).toMatch(/\n {2}\.toggle:checked::after \{[^}]*translate\(14px, -50%\)/);
  });

  it('shows a board theme description in full instead of clipping it', () => {
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    const descIndex = source.indexOf('{theme.config.description}');
    expect(descIndex).toBeGreaterThan(-1);
    const spanStart = source.lastIndexOf('<span', descIndex);
    const span = source.slice(spanStart, descIndex);
    expect(span.length).toBeGreaterThan(60);

    // The cards are 127px wide at phone width, which cut up to 109px off a
    // description, and the title attribute holding the rest never opens on
    // touch. The caption exists to explain the theme, so let it wrap.
    expect(span).not.toContain('truncate');
    expect(span).toContain('text-[0.625rem]');
  });

  it('lets a backend option name and its badge share the row without crushing the name', () => {
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    const labelIndex = source.indexOf('{option.label}');
    expect(labelIndex).toBeGreaterThan(-1);
    const rowStart = source.lastIndexOf('<span className="flex', labelIndex);
    const badgeIndex = source.indexOf('{option.badge}', labelIndex);
    expect(rowStart).toBeGreaterThan(-1);
    expect(badgeIndex).toBeGreaterThan(labelIndex);
    // Guard the slice: an empty string would satisfy nothing below by accident.
    const row = source.slice(rowStart, badgeIndex);
    expect(row.length).toBeGreaterThan(80);

    // "Recommended" is one unbreakable word, so on a single-line row it holds
    // its ~85px while the truncating name shrinks: measured at 320px wide the
    // name got 15px of the 60px it needs and read as "W...". Wrapping drops the
    // badge to its own line there and stays inline at every wider width.
    expect(row).toContain('flex-wrap');
  });
});
