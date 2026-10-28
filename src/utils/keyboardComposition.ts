/** Safari can end composition before its confirming keydown, still tagged 229. */
export function isComposingKeyEvent(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}
