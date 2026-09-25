import { useEffect } from 'react';

/**
 * Mirrors a piece of a component's state onto `<html>` as `data-<name>`, for
 * styles elsewhere on the page that depend on it.
 *
 * Those styles used `:root:has(...)` and `body:has(...)` to ask whether the
 * element was on the page. A `:has()` on the root is re-checked on every DOM
 * change anywhere, and six of them made each move restyle the whole document:
 * 4.9ms of style recalculation a step through a game, against 0.45ms with the
 * same rules keyed on attributes. The owner knows its state; it says so here.
 */
export function useDocumentFlag(name: string, value: string | null): void {
  useEffect(() => {
    if (value === null || typeof document === 'undefined') return;
    const root = document.documentElement;
    const attribute = `data-${name}`;
    root.setAttribute(attribute, value);
    return () => root.removeAttribute(attribute);
  }, [name, value]);
}
