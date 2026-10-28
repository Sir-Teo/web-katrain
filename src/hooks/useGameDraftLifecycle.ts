import { useEffect, useRef } from 'react';

/** Preserve owned edits when their editor or document goes away.
 * Keep preserve stable so a rerender cannot commit an edit mid-keystroke.
 */
export function useGameDraftLifecycle(preserve: () => boolean, onPreserved?: () => void): void {
  const onPreservedRef = useRef(onPreserved);
  useEffect(() => { onPreservedRef.current = onPreserved; }, [onPreserved]);

  useEffect(() => {
    const preserveBeforeLeaving = () => {
      const saved = preserve();
      if (saved) onPreservedRef.current?.();
      return saved;
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!preserveBeforeLeaving()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const preserveWhenHidden = () => {
      if (document.visibilityState === 'hidden') preserveBeforeLeaving();
    };
    window.addEventListener('beforeunload', warnBeforeUnload, true);
    window.addEventListener('pagehide', preserveBeforeLeaving, true);
    document.addEventListener('visibilitychange', preserveWhenHidden, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload, true);
      window.removeEventListener('pagehide', preserveBeforeLeaving, true);
      document.removeEventListener('visibilitychange', preserveWhenHidden, true);
      // Do not update the departing editor's UI during unmount.
      preserve();
    };
  }, [preserve]);
}
