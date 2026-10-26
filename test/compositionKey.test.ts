import { describe, expect, it } from 'vitest';
import { isComposingKeyEvent } from '../src/utils/compositionKey';

describe('keys owned by a text input method', () => {
  it('recognizes native composition and React keyboard event wrappers', () => {
    expect(isComposingKeyEvent({ isComposing: true })).toBe(true);
    expect(isComposingKeyEvent({ nativeEvent: { isComposing: true } })).toBe(true);
  });

  it('recognizes a final Safari composition key after isComposing resets', () => {
    expect(isComposingKeyEvent({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isComposingKeyEvent({ nativeEvent: { isComposing: false, keyCode: 229 } })).toBe(true);
  });

  it('leaves ordinary Enter and Escape available to submit or close', () => {
    expect(isComposingKeyEvent({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isComposingKeyEvent({ nativeEvent: { keyCode: 27 } })).toBe(false);
    expect(isComposingKeyEvent({})).toBe(false);
  });
});
