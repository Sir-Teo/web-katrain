import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A stylesheet rule keyed on an attribute nothing sets is invisible: it lints
 * clean, it type-checks, and it silently does nothing. One of these shipped --
 * `:root[data-mobile-home='open']` moved the PWA install banner off the mobile
 * home action list, but the only code setting that attribute put
 * `data-mobile-home="true"` on the overlay element instead, so the banner
 * covered a recent-games row on every phone-width screen.
 *
 * Nothing else could have caught it: the components render to static markup in
 * these tests, so no effect runs and no stylesheet is applied. This pairs the
 * two halves statically instead -- every `:root[data-x='v']` selector needs
 * some source file to assign `dataset.x`, and to mention the value `v`.
 */
const SRC = new URL('../src/', import.meta.url).pathname;

function readSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            out.push(...readSourceFiles(path));
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
            out.push(readFileSync(path, 'utf8'));
        }
    }
    return out;
}

const css = readFileSync(join(SRC, 'index.css'), 'utf8');
const sources = readSourceFiles(SRC).join('\n');

const selectors = [
    ...new Map(
        [...css.matchAll(/:root\[data-([a-z-]+)(?:='([^']*)')?\]/g)].map((match) => [
            match[0],
            {
                attribute: `data-${match[1]}`,
                property: match[1]!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
                value: match[2],
            },
        ]),
    ).values(),
];

describe('root data attributes the stylesheet reads', () => {
    it('finds some to check', () => {
        expect(selectors.length).toBeGreaterThan(0);
    });

    for (const { attribute, property, value } of selectors) {
        it(`${attribute}${value ? `='${value}'` : ''} is set by the app`, () => {
            const assigns =
                sources.includes(`dataset.${property} =`) ||
                sources.includes(`setAttribute('${attribute}'`) ||
                sources.includes(`setAttribute("${attribute}"`);
            expect(assigns, `no source file assigns dataset.${property}`).toBe(true);

            if (value) {
                expect(sources.includes(`'${value}'`) || sources.includes(`"${value}"`),
                    `no source file mentions the value '${value}' that ${attribute} is matched against`).toBe(true);
            }
        });
    }
});
