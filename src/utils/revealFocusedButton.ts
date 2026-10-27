/** Keep a mobile panel's focused action above its bottom notification. */
export function revealFocusedButton(overlay: HTMLElement) {
  const button = document.activeElement;
  if (!(button instanceof HTMLButtonElement) || overlay.contains(button)) return;
  const target = button.getBoundingClientRect();
  const cover = overlay.getBoundingClientRect();
  if (target.right <= cover.left || target.left >= cover.right
    || target.bottom <= cover.top || target.top >= cover.bottom) return;

  for (let pane = button.parentElement; pane && pane !== document.body; pane = pane.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(pane).overflowY)) continue;
    const bounds = pane.getBoundingClientRect();
    const distance = target.bottom - cover.top + 8;
    // Do not move the page or push the action out through the pane's top edge.
    if (target.top - distance < bounds.top
      || pane.scrollHeight - pane.clientHeight - pane.scrollTop < distance) continue;
    pane.scrollTop += distance;
    return;
  }
}
