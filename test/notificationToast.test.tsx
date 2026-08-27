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
    expect(source).toContain('[notification.copyText, notification.message, notification.type]');
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

  it('supports a desktop dashboard placement below interactive header controls', () => {
    const html = renderToStaticMarkup(
      <NotificationToast
        notification={{ message: 'Analysis error: backend unavailable', type: 'error' }}
        onClose={() => undefined}
        placement="desktop-dashboard"
      />
    );

    expect(html).toContain('notification-toast-region--desktop-dashboard');
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toContain('top: 3.25rem;');
    // Offset from the sidebar's own width, not a copy of it: the sidebar became
    // responsive and a hard-coded 360px left the toast sitting on top of it.
    expect(css).toContain('right: calc(var(--sidebar-w) + 1rem);');
    expect(css).toContain('.notification-toast-region--desktop-dashboard .notification-toast');
    expect(css).toContain('min-height: 2.75rem;');
    expect(css).toContain('@media (min-width: 1024px) and (max-width: 1100px)');
    expect(css).toContain('right: calc(var(--sidebar-w) + 0.5rem);');
    expect(css).toContain('display: none;');
  });

  it('puts routine status in the header flex slot rather than over the controls', () => {
    const html = renderToStaticMarkup(
      <NotificationToast
        notification={{ message: 'Continuous analysis on', type: 'info' }}
        onClose={() => undefined}
        placement="desktop-header"
      />
    );

    expect(html).toContain('notification-toast-region--desktop-header');

    // In flow inside .header-spacer, so the two header clusters squeeze it
    // instead of being covered by it — no offset can be measured wrong.
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toMatch(/\.notification-toast-region--desktop-header \{[^}]*position: static;[^}]*min-width: 0;/);
    const dashboard = readFileSync('src/components/dashboard/dashboard.css', 'utf8');
    expect(dashboard).toMatch(/\.wk-dashboard \.header-spacer \{[^}]*display: flex;[^}]*min-width: 8px;/);

    // Only errors keep the overlay placement, so only they can reach the board.
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    expect(layout).toContain("notification.type !== 'error' ? (");
    expect(layout).toContain("notification.type === 'error' && (");
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
    expect(css).toContain('min-width: min(100%, 14rem);');
    expect(css).toContain('max-width: min(30rem, calc(100% - 1rem));');
    expect(css).toContain('width: 45px;');
    expect(css).toContain('height: 45px;');
  });

  it('overlays mobile notifications without resizing the board', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toMatch(/\/\* Mobile workspaces keep the board as the primary interaction surface\. \*\/[\s\S]*?\.notification-toast-region,[\s\S]*?position: absolute;/);
    expect(css).toContain('inset: 0.5rem 0.5rem auto;');
    expect(css).toContain('.notification-toast-region--below-command-bar {\n      top: 4rem;');
    expect(css).toContain('@media (max-width: 480px) and (min-height: 700px) and (orientation: portrait)');
    expect(css).toContain('bottom: 0.5rem;');
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\) \{[\s\S]*?\.notification-toast-region,[\s\S]*?justify-content: flex-end;/);
    expect(css).toContain('max-width: min(18rem, calc(100% - 1rem));');
  });
});
