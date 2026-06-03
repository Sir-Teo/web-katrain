import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotificationToast } from '../src/components/layout/NotificationToast';

describe('NotificationToast', () => {
  it('offers compact copy affordance for error notifications', () => {
    const html = renderToStaticMarkup(
      <NotificationToast
        notification={{ message: 'Analysis error: backend unavailable', type: 'error' }}
        onClose={() => undefined}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-notification-copy="true"');
    expect(html).toContain('aria-label="Copy notification"');
  });

  it('supports detailed copy text without rendering it in the toast body', () => {
    const html = renderToStaticMarkup(
      <NotificationToast
        notification={{
          message: 'Sound disabled because browser audio is unavailable.',
          type: 'error',
          copyText: 'Sound error: audio blocked\nBackend: web-audio',
        }}
        onClose={() => undefined}
      />
    );

    expect(html).toContain('Sound disabled because browser audio is unavailable.');
    expect(html).not.toContain('Backend: web-audio');

    const source = readFileSync('src/components/layout/NotificationToast.tsx', 'utf8');
    expect(source).toContain('notification.copyText ?? notification.message');
  });

  it('keeps success and info notifications lightweight', () => {
    const html = renderToStaticMarkup(
      <NotificationToast
        notification={{ message: 'Copied SGF to clipboard.', type: 'success' }}
        onClose={() => undefined}
      />
    );

    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-notification-copy="true"');
  });

  it('keeps mobile notification actions at touch target size', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toContain('.notification-toast-action,\n  .notification-toast-close');
    expect(css).toContain('width: 2.875rem;');
    expect(css).toContain('height: 2.875rem;');
    expect(css).toContain('max-width: min(24rem, calc(100vw - 1.5rem));');
    expect(css).toContain('@media (min-width: 640px)');
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('width: 2rem;');
    expect(css).toContain('height: 2rem;');
  });
});
