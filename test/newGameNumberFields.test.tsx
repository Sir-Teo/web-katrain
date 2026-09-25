import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DraftNumberInput } from '../src/components/DraftNumberInput';

describe('DraftNumberInput', () => {
  it('renders the owner value as a number field', () => {
    const html = renderToStaticMarkup(<DraftNumberInput value={30} min={1} onChange={() => undefined} />);

    expect(html).toContain('type="number"');
    expect(html).toContain('value="30"');
    expect(html).toContain('min="1"');
  });

  it('shows the typed text while focused and passes on only complete numbers', () => {
    const source = readFileSync('src/components/DraftNumberInput.tsx', 'utf8');

    expect(source).toContain('value={draft ?? value}');
    expect(source).toContain("if (raw.trim() !== '' && Number.isFinite(Number(raw))) onChange?.(event);");
    expect(source).toMatch(/onBlur=\{\(event\) => \{\s*setDraft\(null\);/);
  });
});

describe('New Game dialog', () => {
  const source = readFileSync('src/components/NewGameModal.tsx', 'utf8');

  it('uses the draft field for every clamped number', () => {
    // Clamping into the field itself made 60 into 160 and -5 into 05.
    expect(source.match(/<DraftNumberInput\b/g)?.length ?? 0).toBeGreaterThanOrEqual(38);
    // Komi keeps its own text draft, which also flags a blank value.
    expect(source.match(/type="number"/g) ?? []).toHaveLength(1);
    expect(source).toContain('value={komiText}');
  });

  it('takes the AI name off a side the AI has left', () => {
    // AI as White, then AI as Black, named both players KataGo.
    expect(source).toContain("if (key !== aiNameKey && prev[key] === AI_DEFAULT_NAME) next[key] = '';");
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*if \(!aiColor\) return;/);
  });
});

describe('Settings dialog', () => {
  it('uses the draft field for every number', () => {
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    // The same clamp-into-the-field made 60 byo-yomi seconds into 160.
    expect(source.match(/<DraftNumberInput\b/g)?.length ?? 0).toBeGreaterThanOrEqual(52);
    expect(source).not.toContain('type="number"');
  });
});
