import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { NotificationToast, type NotificationToastMessage } from '../src/components/layout/NotificationToast';

const noop = () => undefined;

const render = (notification: NotificationToastMessage, onUndo?: () => void) =>
  renderToStaticMarkup(<NotificationToast notification={notification} onClose={noop} onUndo={onUndo} />);

describe('NotificationToast undo action', () => {
  it('offers Undo on a toast reporting an undoable edit', () => {
    const html = render({ message: 'Removed setup stone.', type: 'info', undoable: true }, noop);

    expect(html).toContain('data-notification-undo="true"');
    expect(html).toContain('>Undo<');
  });

  it('says Undo in words rather than leaving it to an icon', () => {
    const html = render({ message: 'Cleared markers, labels and drawings on this node.', type: 'info', undoable: true }, noop);

    expect(html).toContain('>Undo<');
  });

  it('does not offer Undo for a toast that reports no edit', () => {
    const html = render({ message: 'Continuous analysis on', type: 'info' }, noop);

    expect(html).not.toContain('data-notification-undo="true"');
  });

  it('does not offer Undo when nothing was wired up to perform it', () => {
    const html = render({ message: 'Removed setup stone.', type: 'info', undoable: true });

    expect(html).not.toContain('data-notification-undo="true"');
  });

  it('still offers Copy details on an error, alongside no Undo', () => {
    const html = render({ message: 'Analysis error: out of memory', type: 'error', copyText: 'stack' }, noop);

    expect(html).toContain('data-notification-copy="true"');
    expect(html).not.toContain('data-notification-undo="true"');
  });

  it('keeps routine confirmations compact without discarding their full message', () => {
    const message = 'Loaded "A representative game title that is intentionally long".';
    const html = render({ message, type: 'success' });
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain(`title="${message.replaceAll('"', '&quot;')}"`);
    expect(css).toMatch(/notification-toast-region--desktop-dashboard:has\(\.notification-toast-success\) \.notification-toast-message \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
    expect(css).toMatch(/\.notification-toast-success \.notification-toast-message \{[^}]*-webkit-line-clamp: 2;/);
  });
});
