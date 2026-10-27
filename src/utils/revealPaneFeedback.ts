/** Reveal feedback inside its scrollable pane without moving page or focus. */
export function revealPaneFeedback(element: HTMLElement, pane: HTMLElement): void {
  const bounds = element.getBoundingClientRect();
  const viewport = pane.getBoundingClientRect();
  if (bounds.bottom > viewport.bottom) {
    pane.scrollTop += Math.min(bounds.bottom - viewport.bottom + 8, bounds.top - viewport.top);
  } else if (bounds.top < viewport.top) {
    pane.scrollTop += bounds.top - viewport.top - 8;
  }
}
