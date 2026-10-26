type CompositionKeyEvent = {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

/** Enter and Escape belong to the input method while a character is being chosen. */
export function isComposingKeyEvent(event: CompositionKeyEvent): boolean {
  // Safari can report the final composition key with isComposing already false.
  return event.isComposing === true || event.keyCode === 229
    || event.nativeEvent?.isComposing === true || event.nativeEvent?.keyCode === 229;
}
