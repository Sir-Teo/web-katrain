import { isComposingKeyEvent } from './compositionKey';

export type NoteEditorKeyAction = 'none' | 'save' | 'cancel';

export type NoteEditorKeyInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
};

export function getNoteEditorKeyAction(event: NoteEditorKeyInput): NoteEditorKeyAction {
  if (isComposingKeyEvent(event)) return 'none';

  if (event.key === 'Escape') return 'cancel';

  const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const hasCommandKey = Boolean(event.ctrlKey || event.metaKey);
  const isEnter = normalizedKey === 'Enter' || normalizedKey === 'NumpadEnter';
  const isSaveKey = normalizedKey === 's';

  if (event.altKey) return 'none';
  if (isEnter && !event.shiftKey) return 'save';
  if (hasCommandKey && isSaveKey) return 'save';

  return 'none';
}
