import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A source check, because the bug lives in effect ordering that
 * `renderToStaticMarkup` cannot exercise.
 *
 * `LibraryPanel` gates *saving* on its first read having published
 * (`didLoadLibraryRef`) but gates nothing on *mutating*. The file input and the
 * drop zone are live as soon as the panel mounts, so an import that landed in
 * that window called `setItems`, was overwritten by the snapshot that arrived
 * afterwards, and was never written back -- the file vanished with no error.
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
        const mutate = body.indexOf('setItems(');

        expect(wait, `${name} never waits for the first read`).toBeGreaterThan(-1);
        expect(mutate, `${name} no longer calls setItems`).toBeGreaterThan(-1);
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
