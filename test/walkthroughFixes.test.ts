import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextUntitledGameName, createLibraryItem, createLibraryFolder } from '../src/utils/library';

const read = (path: string) => readFileSync(path, 'utf8');

describe('resigning against the engine', () => {
  const layout = read('src/components/Layout.tsx');
  const handler = layout.slice(layout.indexOf('const handleResign = () => {'), layout.indexOf('const handlePlayFromHere'));

  it('resigns for the human even while the engine is thinking', () => {
    // Reading the side to move resigned for the engine mid-think: "White
    // resigns, B+R", a win recorded for the player who gave up.
    expect(handler).toContain("st.isAiPlaying && st.aiColor ? (st.aiColor === 'black' ? 'white' : 'black') : currentPlayer");
  });

  it('does not offer to resign a game that already has its result', () => {
    expect(handler).toMatch(/const recorded = st\.currentNode\.endState;\s*if \(recorded\) \{/);
  });
});

describe('library dialogs', () => {
  it('consume the Enter that submits them', () => {
    // It went on to the button focus returned to and reopened the dialog; a
    // second Enter saved a duplicate game.
    expect(read('src/components/LibraryPanel.tsx')).toMatch(/if \(e\.key === 'Enter'\) \{\s*(?:\/\/[^\n]*\n\s*)*e\.preventDefault\(\);\s*submit\(\);/);
    expect(read('src/components/SaveToLibraryDialog.tsx')).toMatch(/if \(event\.key === 'Enter'\) \{\s*(?:\/\/[^\n]*\n\s*)*event\.preventDefault\(\);\s*void submit\(\);/);
  });

  it('number untitled games after the player\'s own, not every library item', () => {
    const famous = createLibraryFolder('Famous Games');
    const bundled = Array.from({ length: 7 }, (_, i) => createLibraryItem(`Pro game ${i}`, '(;GM[1])', famous.id));
    expect(nextUntitledGameName([famous, ...bundled])).toBe('Game 1');
    expect(nextUntitledGameName([famous, ...bundled, createLibraryItem('Game 3', '(;GM[1])')])).toBe('Game 4');
  });
});

describe('desktop move rail', () => {
  it('drops the "Move" label before a two-digit count can wrap it', () => {
    expect(read('src/components/dashboard/dashboard.css')).toMatch(/@container boardcol \(max-width: 940px\) \{\s*\.wk-dashboard \.move-counter \.mc-label \{ display: none; \}/);
  });
});
