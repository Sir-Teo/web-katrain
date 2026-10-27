import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A source check, because the bug lives in effect ordering that
 * `renderToStaticMarkup` cannot exercise.
 *
 * The file input and drop zone are live before the first Library read
 * publishes. An import originally called `setItems` in that window, then lost
 * its new records when the initial snapshot arrived. Imports now commit
 * through the storage queue; they still wait for the initial publication so
 * the panel cannot replace their result with an older first snapshot.
 * Reproduced by holding IndexedDB's first open: without the wait the imported
 * game was absent and the library held only its 8 preloaded items.
 */
const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

/** The body of a `const <name> = async (...) => {...}` declaration. */
const handlerBody = (name: string): string => {
    const start = source.indexOf(`const ${name} = async (`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const next = source.indexOf('\n  const ', start + 1);
    return source.slice(start, next === -1 ? source.length : next);
};

describe('an import cannot outrun the library it imports into', () => {
    // These two are reachable before the first read publishes because their
    // controls exist the moment the panel mounts. Every other mutation needs
    // an item on screen, which means the read has already landed.
    const EXPOSED = ['handleImportFilesToFolder', 'handleImportDroppedTextToFolder'];

    it.each(EXPOSED)('%s waits for the first read before touching items', (name) => {
        const body = handlerBody(name);
        const wait = body.indexOf('await waitForInitialLibraryLoad()');
        const mutate = body.indexOf('persistLibraryImports(');

        expect(wait, `${name} never waits for the first read`).toBeGreaterThan(-1);
        expect(mutate, `${name} no longer persists imports`).toBeGreaterThan(-1);
        expect(wait, `${name} mutates before waiting`).toBeLessThan(mutate);
    });

    it('keeps the wait tied to the read that publishes the snapshot', () => {
        // If the promise stops being recorded, the helper silently becomes a
        // no-op and the race comes back with every test still passing.
        expect(source).toContain('initialLoadRef.current = initialLoad');
        expect(source).toContain('const waitForInitialLibraryLoad = async ()');
        expect(source).toContain('if (didLoadLibraryRef.current) return;');
    });

    it('still gates saving on the same first read', () => {
        expect(source).toContain('if (!didLoadLibraryRef.current || (itemsRevision === 0 && saveRetry === 0)) return;');
    });
});
