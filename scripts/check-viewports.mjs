import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const VIEWPORTS = [
  { width: 1280, height: 800, mobile: false },
  { width: 1024, height: 768, mobile: false },
  { width: 768, height: 1024, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 844, height: 390, mobile: true },
];

const chromePath =
  process.env.CHROME_PATH ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');
const screenshotDir = process.env.VIEWPORT_SCREENSHOT_DIR || '/tmp/web-katrain-viewport-check';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForHttp(url, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling.
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connectDevtools(webSocketDebuggerUrl) {
  const url = new URL(webSocketDebuggerUrl);
  const socket = net.createConnection(Number(url.port), url.hostname);
  let nextId = 0;
  let ready = false;
  let buffer = Buffer.alloc(0);
  let fragments = [];
  const pending = new Map();

  const readyPromise = new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('connect', () => {
      const key = crypto.randomBytes(16).toString('base64');
      socket.write([
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!ready) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = buffer.slice(0, headerEnd).toString('utf8');
        if (!header.includes('101')) {
          reject(new Error(`WebSocket upgrade failed: ${header}`));
          return;
        }
        buffer = buffer.slice(headerEnd + 4);
        ready = true;
        resolve();
      }
      parseFrames();
    });
  });

  function handleText(payload) {
    const message = JSON.parse(payload);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }

  function parseFrames() {
    while (ready && buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = !!(second & 0x80);
      let mask;
      if (masked) {
        if (buffer.length < offset + 4) return;
        mask = buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (buffer.length < offset + length) return;
      let payload = buffer.slice(offset, offset + length);
      buffer = buffer.slice(offset + length);
      if (masked && mask) payload = Buffer.from(payload.map((byte, idx) => byte ^ mask[idx % 4]));

      const fin = !!(first & 0x80);
      const opcode = first & 0x0f;
      if (opcode === 1 || opcode === 0) {
        fragments.push(payload);
        if (fin) {
          handleText(Buffer.concat(fragments).toString('utf8'));
          fragments = [];
        }
      }
    }
  }

  function writeFrame(text) {
    const payload = Buffer.from(text);
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x81, 0x80 | payload.length]);
    } else if (payload.length < 65_536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const masked = Buffer.from(payload.map((byte, idx) => byte ^ mask[idx % 4]));
    socket.write(Buffer.concat([header, mask, masked]));
  }

  return {
    ready: readyPromise,
    send(method, params = {}) {
      const message = { id: ++nextId, method, params };
      return new Promise((resolve) => {
        pending.set(message.id, resolve);
        writeFrame(JSON.stringify(message));
      });
    },
    close() {
      socket.end();
    },
  };
}

async function chromeTarget(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page') ?? targets[0];
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch {
      // Keep polling.
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome devtools target');
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.result.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text ?? 'Runtime evaluation failed');
  }
  return response.result.result.value;
}

async function waitForBoard(cdp) {
  for (let i = 0; i < 120; i++) {
    const hasBoard = await evaluate(cdp, '!!document.querySelector("[data-board-snapshot=true]")');
    if (hasBoard) return;
    await sleep(150);
  }
  const diagnostic = await evaluate(cdp, `(() => ({
    readyState: document.readyState,
    url: location.href,
    text: document.body.innerText.slice(0, 240),
  }))()`).catch(() => null);
  throw new Error(`Board did not render${diagnostic ? ` (${JSON.stringify(diagnostic)})` : ''}`);
}

function assertViewport(result) {
  const failures = [];
  if (result.documentOverflow > 1) failures.push(`document overflows by ${result.documentOverflow}px`);
  if (!result.board) failures.push('board missing');
  if (result.board && result.board.left < -1) failures.push('board overflows left edge');
  if (result.board && result.board.right > result.innerWidth + 1) failures.push('board overflows right edge');
  if (result.desktop) {
    if (!result.topBar) failures.push('top bar missing');
    if (result.topControlsOutOfBar > 0) failures.push(`${result.topControlsOutOfBar} top controls escape top bar`);
    if (result.missingFileActions.length > 0) failures.push(`missing file actions: ${result.missingFileActions.join(', ')}`);
    if (!result.viewMenuReachable) failures.push('View menu not reachable');
    if (!result.actionsMenuReachable) failures.push('Actions menu not reachable');
    if (result.topToggleOverTopBar) failures.push('top toggle overlaps top bar');
    if (result.topToggleOverEditToolbar) failures.push('top toggle overlaps edit toolbar');
  } else {
    if (!result.toolsReachable) failures.push('mobile tools menu not reachable');
    if (!result.editToolsReachable) failures.push('mobile edit tools not reachable');
    if (!result.noteEditorReachable) failures.push('mobile note editor not reachable from Review tab');
    if (!result.noteEditorKeyboardAware) failures.push('mobile note editor is missing keyboard-aware scroll margin');
    if (!result.boardTouchAction.includes('pinch-zoom') && result.boardTouchAction !== 'manipulation') {
      failures.push(`play-mode board touch-action does not allow pinch zoom (${result.boardTouchAction})`);
    }
    if (result.editModeBoardTouchAction !== 'none') {
      failures.push(`edit-mode board touch-action should be none (${result.editModeBoardTouchAction})`);
    }
    if (result.smallTouchTargets.length > 0) {
      const summary = result.smallTouchTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.smallTouchTargets.length} mobile touch target(s) below 44px: ${summary}`);
    }
    if (result.editModeSmallTouchTargets.length > 0) {
      const summary = result.editModeSmallTouchTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.editModeSmallTouchTargets.length} edit-mode touch target(s) below 44px: ${summary}`);
    }
    if (result.modalSmallTouchTargets.length > 0) {
      const summary = result.modalSmallTouchTargets
        .slice(0, 8)
        .map((target) => `${target.modal}: ${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.modalSmallTouchTargets.length} modal touch target(s) below 44px: ${summary}`);
    }
  }
  if (result.modalSmokeFailures.length > 0) {
    failures.push(`modal smoke failures: ${result.modalSmokeFailures.join(', ')}`);
  }
  if (failures.length > 0) {
    throw new Error(`${result.viewport}: ${failures.join('; ')}`);
  }
}

async function main() {
  fs.rmSync(screenshotDir, { recursive: true, force: true });
  fs.mkdirSync(screenshotDir, { recursive: true });

  const appPort = await freePort();
  const devtoolsPort = await freePort();
  const server = spawn(path.join('node_modules', '.bin', 'vite'), [
    '--host',
    '127.0.0.1',
    '--port',
    String(appPort),
    '--strictPort',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let chrome;
  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/`);

    chrome = spawn(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${devtoolsPort}`,
      '--window-size=1280,900',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });

    const target = await chromeTarget(devtoolsPort);
    const cdp = connectDevtools(target);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const results = [];
    for (const viewport of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });
      await waitForBoard(cdp);
      await evaluate(cdp, `(() => {
        const continueButton = Array.from(document.querySelectorAll('button')).find((button) => {
          const label = [
            button.getAttribute('aria-label') || '',
            button.getAttribute('title') || '',
            button.textContent || '',
          ].join(' ');
          return label.includes('Continue Board') || label.includes('Open board');
        });
        if (!continueButton) return false;
        continueButton.click();
        return true;
      })()`);
      await sleep(300);
      const result = await evaluate(cdp, `(async () => {
        const rect = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        const intersects = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const topBar = Array.from(document.querySelectorAll('.ui-bar.ui-bar-height')).find((el) => el.getBoundingClientRect().top < 2) || null;
        const topBarRect = rect(topBar);
        const topControlsOutOfBar = topBar
          ? Array.from(topBar.querySelectorAll('button')).filter((button) => {
              const r = rect(button);
              return r && (r.left < -1 || r.right > innerWidth + 1 || r.top < topBarRect.top - 1 || r.bottom > topBarRect.bottom + 1);
            }).length
          : 0;
        const topToggle = Array.from(document.querySelectorAll('button')).find((button) => (button.getAttribute('title') || '').includes('top bar')) || null;
        const editToolbar = document.querySelector('[data-edit-toolbar]');
        const board = document.querySelector('[data-board-snapshot="true"]');
        const requiredFileActions = ['New game', 'Save SGF', 'Load SGF, board photo, or model weights', 'Paste SGF / OGS', 'Photo Board'];
        const allButtons = Array.from(document.querySelectorAll('button'));
        const targetLabel = (el) => {
          const aria = el.getAttribute('aria-label');
          if (aria) return aria.trim();
          const title = el.getAttribute('title');
          if (title) return title.trim();
          const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (text) return text.slice(0, 48);
          return el.tagName.toLowerCase();
        };
        const isVisibleTarget = (el) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
          if (el.matches(':disabled,[aria-disabled="true"]')) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom >= 0 && r.right >= 0 && r.top <= innerHeight && r.left <= innerWidth;
        };
        const auditSmallTouchTargets = (scope = document) => Array.from(scope.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [role="tab"]'))
          .filter((el) => !el.closest('[data-board-snapshot="true"]'))
          .filter(isVisibleTarget)
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width < 44 || r.height < 44)
          .map(({ el, r }) => ({
            label: targetLabel(el),
            tag: el.tagName.toLowerCase(),
            width: r.width,
            height: r.height,
          }));
        const waitForFrames = async (frames = 2) => {
          for (let i = 0; i < frames; i++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
        };
        const waitForSelector = async (selector) => {
          for (let i = 0; i < 60; i++) {
            const el = document.querySelector(selector);
            if (el && isVisibleTarget(el)) return el;
            await waitForFrames(1);
          }
          return null;
        };
        const modalSmokeFailures = [];
        const modalSmallTouchTargets = [];
        const dispatchShortcut = (key, options = {}) => {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
            ctrlKey: !!options.ctrlKey,
            metaKey: !!options.metaKey,
            shiftKey: !!options.shiftKey,
            altKey: !!options.altKey,
          }));
        };
        const withShortcutOverride = async (id, binding, action) => {
          const storageKey = 'web-katrain:shortcuts:v1';
          const original = localStorage.getItem(storageKey);
          try {
            const overrides = original ? JSON.parse(original) : {};
            overrides[id] = [binding];
            localStorage.setItem(storageKey, JSON.stringify(overrides));
            window.dispatchEvent(new CustomEvent('web-katrain:shortcuts-updated'));
            await action();
          } finally {
            if (original === null) localStorage.removeItem(storageKey);
            else localStorage.setItem(storageKey, original);
            window.dispatchEvent(new CustomEvent('web-katrain:shortcuts-updated'));
          }
        };
        const closeDialog = async (dialog, closeLabel) => {
          const button = Array.from(dialog.querySelectorAll('button')).find((candidate) => targetLabel(candidate).includes(closeLabel));
          if (!button) return false;
          button.click();
          await waitForFrames(2);
          return true;
        };
        const smokeModal = async ({ name, selector, closeLabel, open, afterOpen }) => {
          try {
            await open();
            const dialog = await waitForSelector(selector);
            if (!dialog) {
              modalSmokeFailures.push(\`\${name} did not open\`);
              return;
            }
            if (${viewport.mobile}) {
              modalSmallTouchTargets.push(...auditSmallTouchTargets(dialog).map((target) => ({ ...target, modal: name })));
            }
            if (afterOpen) await afterOpen(dialog);
            if (!(await closeDialog(dialog, closeLabel))) {
              modalSmokeFailures.push(\`\${name} close control missing\`);
            }
          } catch (error) {
            modalSmokeFailures.push(\`\${name}: \${error instanceof Error ? error.message : String(error)}\`);
          }
        };
        const editButton = allButtons.find((button) => {
          const label = [
            button.getAttribute('aria-label') || '',
            button.getAttribute('title') || '',
            button.textContent || '',
          ].join(' ');
          return label.includes('Open SGF edit tools');
        }) || null;
        const editToolsReachable = ${viewport.mobile} ? !!editButton : true;
        const smallTouchTargets = ${viewport.mobile} ? auditSmallTouchTargets() : [];
        const boardTouchAction = board ? getComputedStyle(board).touchAction : '';
        let noteEditorReachable = true;
        let noteEditorKeyboardAware = true;
        if (${viewport.mobile}) {
          const reviewTab = Array.from(document.querySelectorAll('button[role="tab"]')).find((button) => button.getAttribute('aria-label') === 'Review');
          reviewTab?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const noteEditor = document.querySelector('[data-note-editor="true"]');
          noteEditorReachable = !!noteEditor;
          if (noteEditor) {
            noteEditor.focus();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const margin = getComputedStyle(noteEditor).scrollMarginBlockEnd;
            noteEditorKeyboardAware = noteEditor.getAttribute('data-note-keyboard-aware') === 'true' && margin !== '0px';
          } else {
            noteEditorKeyboardAware = false;
          }
          const boardTab = Array.from(document.querySelectorAll('button[role="tab"]')).find((button) => button.getAttribute('aria-label') === 'Board');
          boardTab?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        let editModeSmallTouchTargets = [];
        let editModeBoardTouchAction = 'none';
        if (${viewport.mobile} && editButton) {
          editButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          editModeSmallTouchTargets = auditSmallTouchTargets();
          editModeBoardTouchAction = board ? getComputedStyle(board).touchAction : '';
          const closeEditButton = Array.from(document.querySelectorAll('button')).find((button) => {
            const label = [
              button.getAttribute('aria-label') || '',
              button.getAttribute('title') || '',
              button.textContent || '',
            ].join(' ');
            return label.includes('Close edit mode');
          });
          closeEditButton?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        await smokeModal({
          name: 'keyboard shortcuts',
          selector: '[aria-labelledby="keyboard-help-title"]',
          closeLabel: 'Close keyboard shortcuts',
          open: async () => {
            dispatchShortcut('?');
            await waitForFrames(2);
          },
        });
        await smokeModal({
          name: 'paste SGF',
          selector: '[aria-labelledby="paste-sgf-title"]',
          closeLabel: 'Close paste SGF',
          open: async () => {
            await withShortcutOverride('paste-sgf', { key: 'F9', ctrl: false, shift: false, alt: false }, async () => {
              dispatchShortcut('F9');
              await waitForFrames(2);
            });
          },
        });
        await smokeModal({
          name: 'game report',
          selector: '[aria-labelledby="game-report-title"]',
          closeLabel: 'Close game report',
          open: async () => {
            dispatchShortcut('F3');
            await waitForFrames(2);
          },
          afterOpen: async (dialog) => {
            const guide = Array.from(dialog.querySelectorAll('button')).find((candidate) => targetLabel(candidate).includes('Open report guide'));
            if (!guide) {
              modalSmokeFailures.push('report guide control missing');
              return;
            }
            guide.click();
            const guideDialog = await waitForSelector('[aria-labelledby="report-guide-title"]');
            if (!guideDialog) {
              modalSmokeFailures.push('report guide did not open');
              return;
            }
            if (${viewport.mobile}) {
              modalSmallTouchTargets.push(...auditSmallTouchTargets(guideDialog).map((target) => ({ ...target, modal: 'report guide' })));
            }
            if (!(await closeDialog(guideDialog, 'Close report guide'))) {
              modalSmokeFailures.push('report guide close control missing');
            }
          },
        });
        return {
          viewport: '${viewport.width}x${viewport.height}',
          desktop: ${viewport.width >= 1024},
          innerWidth,
          innerHeight,
          documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          topBar: topBarRect,
          topControlsOutOfBar,
          topToggle: rect(topToggle),
          editToolbar: rect(editToolbar),
          board: rect(board),
          missingFileActions: requiredFileActions.filter((label) => !allButtons.some((button) => button.getAttribute('aria-label') === label)),
          viewMenuReachable: !!Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('View')),
          actionsMenuReachable: !!Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Actions')),
          toolsReachable: !!Array.from(document.querySelectorAll('button')).find((button) => (button.getAttribute('aria-label') || button.getAttribute('title') || '') === 'Tools'),
          editToolsReachable,
          noteEditorReachable,
          noteEditorKeyboardAware,
          boardTouchAction,
          smallTouchTargets,
          editModeBoardTouchAction,
          editModeSmallTouchTargets,
          modalSmokeFailures,
          modalSmallTouchTargets,
          topToggleOverTopBar: intersects(rect(topToggle), topBarRect),
          topToggleOverEditToolbar: intersects(rect(topToggle), rect(editToolbar)),
        };
      })()`);
      assertViewport(result);
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(
        path.join(screenshotDir, `${viewport.width}x${viewport.height}.png`),
        Buffer.from(screenshot.result.data, 'base64')
      );
      results.push(result);
    }
    cdp.close();
    console.log(`Viewport checks passed. Screenshots: ${screenshotDir}`);
    for (const result of results) {
      console.log(`${result.viewport}: board ${Math.round(result.board.width)}x${Math.round(result.board.height)}`);
    }
  } finally {
    chrome?.kill('SIGTERM');
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
