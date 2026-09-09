/**
 * Stops the mouse wheel from silently editing a focused number input.
 *
 * Chrome and Firefox treat a wheel tick over a focused `input[type=number]` as
 * a step up or down. This app puts number inputs inside long scrollable
 * surfaces -- Settings, New game, the analysis dialogs, the move counter on the
 * desktop rail -- so the ordinary act of clicking a field and then scrolling the
 * panel changed komi, visits or a move number without a keystroke and without
 * anything saying so.
 *
 * Blurring during the capture phase is what fixes it: the step is a default
 * action that only applies to a focused input, so by the time it would run the
 * input is no longer focused, and the wheel goes on to scroll the panel as it
 * should. Preventing the event instead would stop that scroll, which is the
 * thing the person was actually trying to do. The value stays reachable by
 * typing and by the arrow keys, which is how a number is edited anyway.
 */
export function installNumberInputWheelGuard(doc: Document = document): () => void {
  const onWheel = (event: Event) => {
    const active = doc.activeElement as HTMLInputElement | null;
    // Only the field under the pointer, and only while it is focused: an
    // unfocused number input does not step, and blurring something the wheel
    // is merely passing over would steal focus for nothing.
    if (!active || active !== event.target) return;
    if (active.tagName !== 'INPUT' || active.type !== 'number') return;
    active.blur();
  };
  const options = { passive: true, capture: true } as const;
  doc.addEventListener('wheel', onWheel, options);
  return () => doc.removeEventListener('wheel', onWheel, { capture: true });
}
