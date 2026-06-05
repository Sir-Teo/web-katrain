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
  if (result.boardInteractionFailures?.length > 0) {
    failures.push(...result.boardInteractionFailures);
  }
  if (result.navigationSmokeFailures.length > 0) {
    failures.push(`navigation smoke failures: ${result.navigationSmokeFailures.join(', ')}`);
  }
  if (result.captureSmokeFailures.length > 0) {
    failures.push(`capture smoke failures: ${result.captureSmokeFailures.join(', ')}`);
  }
  if (result.fullscreenSmokeFailures.length > 0) {
    failures.push(`fullscreen smoke failures: ${result.fullscreenSmokeFailures.join(', ')}`);
  }
  if (result.pwaBannerFailures.length > 0) {
    failures.push(`PWA banner failures: ${result.pwaBannerFailures.join(', ')}`);
  }
  if (result.photoBoardTraceImportFailures.length > 0) {
    failures.push(`photo board trace import failures: ${result.photoBoardTraceImportFailures.join(', ')}`);
  }
  if (result.boardThemeSmokeFailures.length > 0) {
    failures.push(`board theme smoke failures: ${result.boardThemeSmokeFailures.join(', ')}`);
  }
  if (result.localeSmokeFailures.length > 0) {
    failures.push(`locale smoke failures: ${result.localeSmokeFailures.join(', ')}`);
  }
  if (result.documentOverflow > 1) failures.push(`document overflows by ${result.documentOverflow}px`);
  if (!result.board) failures.push('board missing');
  if (result.board && result.board.left < -1) failures.push('board overflows left edge');
  if (result.board && result.board.right > result.innerWidth + 1) failures.push('board overflows right edge');
  if (result.desktop) {
    if (!result.topBar) failures.push('top bar missing');
    if (result.topControlsOutOfBar > 0) {
      const summary = result.topControlsOutOfBarDetails
        .slice(0, 4)
        .map((target) => `${target.label} at ${Math.round(target.left)},${Math.round(target.top)}-${Math.round(target.right)},${Math.round(target.bottom)}`)
        .join(', ');
      failures.push(`${result.topControlsOutOfBar} top controls escape top bar${summary ? `: ${summary}` : ''}`);
    }
    if (result.missingFileActions.length > 0) failures.push(`missing file actions: ${result.missingFileActions.join(', ')}`);
    if (!result.viewMenuReachable) failures.push('View menu not reachable');
    if (!result.actionsMenuReachable) failures.push('Actions menu not reachable');
    if (result.topToggleOverTopBar) failures.push('top toggle overlaps top bar');
    if (result.topToggleOverEditToolbar) failures.push('top toggle overlaps edit toolbar');
    if (result.expectDualDesktopPanels) {
      if (!result.libraryPanelVisible) failures.push('laptop library panel is not visible with side panel open');
      if (!result.sidePanelVisible) failures.push('laptop side panel is not visible with library open');
      if (result.libraryPanelOverlapsBoard) failures.push('laptop library panel overlaps board');
      if (result.sidePanelOverlapsBoard) failures.push('laptop side panel overlaps board');
      if (result.board && result.board.width < 300) failures.push(`laptop board too small with both panels open (${Math.round(result.board.width)}px)`);
    }
  } else {
    if (!result.toolsReachable) failures.push('mobile tools menu not reachable');
    if (!result.editToolsReachable) failures.push('mobile edit tools not reachable');
    if (!result.noteEditorReachable) failures.push('mobile note editor not reachable from Review tab');
    if (!result.noteEditorKeyboardAware) failures.push('mobile note editor is missing keyboard-aware scroll margin');
    if (result.noteEditorLifecycleFailures.length > 0) {
      failures.push(`mobile note editor lifecycle failures: ${result.noteEditorLifecycleFailures.join(', ')}`);
    }
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
    if (result.reviewSmallTouchTargets.length > 0) {
      const summary = result.reviewSmallTouchTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.reviewSmallTouchTargets.length} review-tab touch target(s) below 44px: ${summary}`);
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
  if (result.clipboardSmokeFailures.length > 0) {
    failures.push(`clipboard smoke failures: ${result.clipboardSmokeFailures.join(', ')}`);
  }
  if (result.editToolSmokeFailures.length > 0) {
    failures.push(`edit tool smoke failures: ${result.editToolSmokeFailures.join(', ')}`);
  }
  if (!result.scorePanelReachable) failures.push('score panel not reachable');
  if (result.scorePanelFailures.length > 0) {
    failures.push(`score panel failures: ${result.scorePanelFailures.join(', ')}`);
  }
  if (result.scorePanelSmallTouchTargets.length > 0) {
    const summary = result.scorePanelSmallTouchTargets
      .slice(0, 8)
      .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
      .join(', ');
    failures.push(`${result.scorePanelSmallTouchTargets.length} score panel touch target(s) below 44px: ${summary}`);
  }
  if (!result.analysisDepthReachable) failures.push('analysis depth selector not reachable');
  if (result.analysisDepthFailures.length > 0) {
    failures.push(`analysis depth failures: ${result.analysisDepthFailures.join(', ')}`);
  }
  if (result.analysisDepthSmallTouchTargets.length > 0) {
    const summary = result.analysisDepthSmallTouchTargets
      .slice(0, 8)
      .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
      .join(', ');
    failures.push(`${result.analysisDepthSmallTouchTargets.length} analysis depth touch target(s) below 44px: ${summary}`);
  }
  if (result.pwaBannerSmallTouchTargets.length > 0) {
    const summary = result.pwaBannerSmallTouchTargets
      .slice(0, 8)
      .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
      .join(', ');
    failures.push(`${result.pwaBannerSmallTouchTargets.length} PWA banner touch target(s) below 44px: ${summary}`);
  }
  if (result.commandBarOverlaps.length > 0) {
    const summary = result.commandBarOverlaps
      .slice(0, 6)
      .map((target) => `${target.label} at ${Math.round(target.left)},${Math.round(target.top)}-${Math.round(target.right)},${Math.round(target.bottom)}`)
      .join(', ');
    failures.push(`${result.commandBarOverlaps.length} control(s) overlap analysis command bar: ${summary}`);
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
      const appUrl = `http://127.0.0.1:${appPort}/`;
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      });
      await cdp.send('Page.navigate', { url: appUrl });
      await waitForBoard(cdp);
      if (viewport.width === 1024 && viewport.height === 768 && !viewport.mobile) {
        await evaluate(cdp, `(() => {
          localStorage.setItem('web-katrain:library_open:v1', 'true');
          localStorage.setItem('web-katrain:sidebar_open:v1', 'true');
        })()`);
        await cdp.send('Page.navigate', { url: appUrl });
        await waitForBoard(cdp);
      }
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
      const defaultLayout = await evaluate(cdp, `(() => {
        const board = document.querySelector('[data-board-snapshot="true"]');
        if (!board) return { board: null };
        const r = board.getBoundingClientRect();
        return {
          board: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
          documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        };
      })()`);
      const defaultScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(
        path.join(screenshotDir, `${viewport.width}x${viewport.height}.png`),
        Buffer.from(defaultScreenshot.result.data, 'base64')
      );
      const result = await evaluate(cdp, `(async () => {
        const rect = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        const intersects = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const dashboard = document.querySelector('.wk-dashboard');
        const topBar = dashboard?.querySelector('.header') ||
          Array.from(document.querySelectorAll('.ui-bar.ui-bar-height')).find((el) => el.getBoundingClientRect().top < 2) ||
          null;
        const topBarRect = rect(topBar);
        const topControlsOutOfBarDetails = topBar
          ? Array.from(topBar.querySelectorAll('button')).filter((button) => {
              const r = rect(button);
              return r && (r.left < -1 || r.right > innerWidth + 1 || r.top < topBarRect.top - 1 || r.bottom > topBarRect.bottom + 1);
            }).map((button) => ({
              label: (
                button.getAttribute('aria-label') ||
                button.getAttribute('title') ||
                (button.textContent || '').replace(/\s+/g, ' ').trim() ||
                button.tagName.toLowerCase()
              ).slice(0, 48),
              ...rect(button),
            }))
          : [];
        const topControlsOutOfBar = topControlsOutOfBarDetails.length;
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
        const targetSearchText = (el) => [
          el.getAttribute('aria-label') || '',
          el.getAttribute('title') || '',
          el.textContent || '',
        ].join(' ').replace(/\\s+/g, ' ').trim();
        const isVisibleTarget = (el) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
          if (el.matches(':disabled,[aria-disabled="true"]')) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom >= 0 && r.right >= 0 && r.top <= innerHeight && r.left <= innerWidth;
        };
        const isVisibleBox = (el) => {
          if (!el) return false;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom >= 0 && r.right >= 0 && r.top <= innerHeight && r.left <= innerWidth;
        };
        const auditSmallTouchTargets = (scope = document) => Array.from(scope.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [role="tab"]'))
          .filter((el) => !el.closest('[data-board-snapshot="true"], [data-photo-board-trace-grid="true"]'))
          .filter(isVisibleTarget)
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width < 44 || r.height < 44)
          .map(({ el, r }) => ({
            label: targetLabel(el),
            tag: el.tagName.toLowerCase(),
            width: r.width,
            height: r.height,
          }));
        const commandBar = document.querySelector('[data-analysis-command-bar="true"]');
        const commandBarRect = rect(commandBar);
        const commandBarOverlaps = commandBarRect
          ? Array.from(document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [role="tab"]'))
            .filter((el) => !el.closest('[data-analysis-command-bar="true"], [data-board-snapshot="true"], [data-photo-board-trace-grid="true"]'))
            .filter(isVisibleTarget)
            .map((el) => ({ el, r: rect(el) }))
            .filter(({ r }) => intersects(r, commandBarRect))
            .map(({ el, r }) => ({
              label: targetLabel(el),
              left: r.left,
              top: r.top,
              right: r.right,
              bottom: r.bottom,
            }))
          : [];
        const waitForFrames = async (frames = 2) => {
          for (let i = 0; i < frames; i++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
        };
        const setTextControlValue = (control, value) => {
          const setter = Object.getOwnPropertyDescriptor(control.constructor.prototype, 'value')?.set;
          if (!setter) {
            control.value = value;
          } else {
            setter.call(control, value);
          }
          control.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const runBoardInteractionSmoke = async () => {
          const failures = [];
          const boardEl = document.querySelector('[data-board-snapshot="true"]');
          if (!boardEl) return ['board interaction smoke: board missing'];
          const size = Number(boardEl.getAttribute('data-board-size'));
          const cellSize = Number(boardEl.getAttribute('data-board-cell-size'));
          const originX = Number(boardEl.getAttribute('data-board-origin-x'));
          const originY = Number(boardEl.getAttribute('data-board-origin-y'));
          const beforeStones = boardEl.getAttribute('data-board-stones') || '';
          const beforeMoveCount = Number(boardEl.getAttribute('data-board-move-count'));
          const beforePlayer = boardEl.getAttribute('data-board-current-player');
          if (!Number.isFinite(size) || size <= 0) failures.push('board size metadata missing');
          if (!Number.isFinite(cellSize) || cellSize <= 0) failures.push('board cell metadata missing');
          if (!Number.isFinite(originX) || !Number.isFinite(originY)) failures.push('board origin metadata missing');
          if (!Number.isFinite(beforeMoveCount)) failures.push('board move-count metadata missing');
          if (beforePlayer !== 'black' && beforePlayer !== 'white') failures.push('board current-player metadata missing');
          if (beforeStones.length !== size * size) failures.push(\`board stone metadata length \${beforeStones.length}, expected \${size * size}\`);
          if (failures.length > 0) return failures;

          const emptyIndex = beforeStones.indexOf('.');
          if (emptyIndex < 0) return ['board interaction smoke: no empty intersection available'];
          const x = emptyIndex % size;
          const y = Math.floor(emptyIndex / size);
          const r = boardEl.getBoundingClientRect();
          boardEl.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: r.left + originX + x * cellSize,
            clientY: r.top + originY + y * cellSize,
          }));
          await waitForFrames(4);

          const afterMoveCount = Number(boardEl.getAttribute('data-board-move-count'));
          const afterPlayer = boardEl.getAttribute('data-board-current-player');
          const afterStones = boardEl.getAttribute('data-board-stones') || '';
          const expectedStone = beforePlayer === 'black' ? 'B' : 'W';
          const expectedNextPlayer = beforePlayer === 'black' ? 'white' : 'black';
          if (afterMoveCount !== beforeMoveCount + 1) failures.push(\`board click did not advance move count (\${beforeMoveCount} -> \${afterMoveCount})\`);
          if (afterPlayer !== expectedNextPlayer) failures.push(\`board click did not switch player to \${expectedNextPlayer}\`);
          if (afterStones[emptyIndex] !== expectedStone) {
            failures.push(\`board click did not place \${expectedStone} at index \${emptyIndex}\`);
          }
          return failures;
        };
        const runNavigationSmoke = async () => {
          const failures = [];
          const boardEl = document.querySelector('[data-board-snapshot="true"]');
          if (!boardEl) return ['navigation smoke: board missing'];
          const size = Number(boardEl.getAttribute('data-board-size'));
          const cellSize = Number(boardEl.getAttribute('data-board-cell-size'));
          const originX = Number(boardEl.getAttribute('data-board-origin-x'));
          const originY = Number(boardEl.getAttribute('data-board-origin-y'));
          const initialStones = boardEl.getAttribute('data-board-stones') || '';
          const initialMoveCount = Number(boardEl.getAttribute('data-board-move-count'));
          if (!Number.isFinite(size) || size <= 0 || initialStones.length !== size * size) {
            return ['navigation smoke: board metadata invalid'];
          }
          if (!Number.isFinite(cellSize) || cellSize <= 0 || !Number.isFinite(originX) || !Number.isFinite(originY)) {
            return ['navigation smoke: board geometry metadata invalid'];
          }
          if (!Number.isFinite(initialMoveCount)) return ['navigation smoke: move-count metadata invalid'];

          const clickBoardIndex = async (index) => {
            const x = index % size;
            const y = Math.floor(index / size);
            const r = boardEl.getBoundingClientRect();
            boardEl.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: r.left + originX + x * cellSize,
              clientY: r.top + originY + y * cellSize,
            }));
            await waitForFrames(4);
          };
          const emptyIndexes = [];
          for (let i = 0; i < initialStones.length; i++) {
            if (initialStones[i] === '.') emptyIndexes.push(i);
          }
          if (emptyIndexes.length < 3) return ['navigation smoke: not enough empty points'];
          const moveIndexes = emptyIndexes.slice(0, 3);
          for (const index of moveIndexes) await clickBoardIndex(index);

          const atEndMoveCount = Number(boardEl.getAttribute('data-board-move-count'));
          const atEndStones = boardEl.getAttribute('data-board-stones') || '';
          if (atEndMoveCount !== initialMoveCount + 3) {
            failures.push('played moves did not advance move count by 3 (' + initialMoveCount + ' -> ' + atEndMoveCount + ')');
          }
          if (moveIndexes.some((index) => atEndStones[index] === '.')) {
            failures.push('played move stones missing at end before navigation');
          }

          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          dispatchShortcut('ArrowLeft');
          await waitForFrames(4);
          const afterBackMoveCount = Number(boardEl.getAttribute('data-board-move-count'));
          const afterBackStones = boardEl.getAttribute('data-board-stones') || '';
          if (afterBackMoveCount !== initialMoveCount + 2) {
            failures.push('ArrowLeft did not move back once (' + afterBackMoveCount + ')');
          }
          if (afterBackStones[moveIndexes[2]] !== '.') failures.push('ArrowLeft did not hide the last move stone');

          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          dispatchShortcut('ArrowRight');
          await waitForFrames(4);
          const afterForwardMoveCount = Number(boardEl.getAttribute('data-board-move-count'));
          const afterForwardStones = boardEl.getAttribute('data-board-stones') || '';
          if (afterForwardMoveCount !== initialMoveCount + 3) {
            failures.push('ArrowRight did not restore the last move (' + afterForwardMoveCount + ')');
          }
          if (afterForwardStones[moveIndexes[2]] === '.') failures.push('ArrowRight did not restore the last move stone');

          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          dispatchShortcut('Home');
          await waitForFrames(4);
          const afterHomeMoveCount = Number(boardEl.getAttribute('data-board-move-count'));
          const afterHomeStones = boardEl.getAttribute('data-board-stones') || '';
          if (afterHomeMoveCount !== 0) failures.push('Home did not navigate to root (' + afterHomeMoveCount + ')');
          if (moveIndexes.some((index) => afterHomeStones[index] !== '.')) {
            failures.push('Home left played move stones visible');
          }

          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          dispatchShortcut('End');
          await waitForFrames(4);
          const afterEndMoveCount = Number(boardEl.getAttribute('data-board-move-count'));
          const afterEndStones = boardEl.getAttribute('data-board-stones') || '';
          if (afterEndMoveCount !== initialMoveCount + 3) {
            failures.push('End did not navigate to line end (' + afterEndMoveCount + ')');
          }
          if (moveIndexes.some((index) => afterEndStones[index] === '.')) {
            failures.push('End did not restore played move stones');
          }
          return failures;
        };
        const runCaptureSmoke = async () => {
          const failures = [];
          const boardEl = document.querySelector('[data-board-snapshot="true"]');
          if (!boardEl) return ['capture smoke: board missing'];
          const size = Number(boardEl.getAttribute('data-board-size'));
          const cellSize = Number(boardEl.getAttribute('data-board-cell-size'));
          const originX = Number(boardEl.getAttribute('data-board-origin-x'));
          const originY = Number(boardEl.getAttribute('data-board-origin-y'));
          if (!Number.isFinite(size) || size < 16) return ['capture smoke: board size too small'];
          if (!Number.isFinite(cellSize) || cellSize <= 0 || !Number.isFinite(originX) || !Number.isFinite(originY)) {
            return ['capture smoke: board geometry metadata invalid'];
          }

          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          dispatchShortcut('Home');
          await waitForFrames(4);
          const firstPlayer = boardEl.getAttribute('data-board-current-player');
          const expectedCaptor = firstPlayer === 'black' ? 'B' : firstPlayer === 'white' ? 'W' : null;
          if (!expectedCaptor) failures.push('capture smoke: current-player metadata invalid');

          const clickPoint = async (x, y) => {
            const r = boardEl.getBoundingClientRect();
            boardEl.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: r.left + originX + x * cellSize,
              clientY: r.top + originY + y * cellSize,
            }));
            await waitForFrames(4);
          };

          const sequence = [
            [3, 4],  // Captor D15
            [4, 4],  // Captured stone E15
            [5, 4],  // Captor F15
            [15, 3], // Tenuki Q16
            [4, 3],  // Captor E16
            [15, 15], // Tenuki Q4
            [4, 5],  // Captor E14 captures E15
          ];
          for (const [x, y] of sequence) await clickPoint(x, y);

          const moveCount = Number(boardEl.getAttribute('data-board-move-count'));
          const stones = boardEl.getAttribute('data-board-stones') || '';
          const capturedIndex = 4 + 4 * size;
          if (moveCount !== sequence.length) failures.push('capture sequence move count was ' + moveCount + ', expected ' + sequence.length);
          if (stones[capturedIndex] !== '.') failures.push('captured E15 stone is still present');
          for (const [x, y] of [[3, 4], [5, 4], [4, 3], [4, 5]]) {
            if (expectedCaptor && stones[x + y * size] !== expectedCaptor) {
              failures.push('capturing stone missing at ' + x + ',' + y + ' for ' + firstPlayer);
            }
          }
          return failures;
        };
        const runEditToolSmoke = async () => {
          const failures = [];
          const boardEl = document.querySelector('[data-board-snapshot="true"]');
          if (!boardEl) return ['edit tool smoke: board missing'];
          const size = Number(boardEl.getAttribute('data-board-size'));
          const cellSize = Number(boardEl.getAttribute('data-board-cell-size'));
          const originX = Number(boardEl.getAttribute('data-board-origin-x'));
          const originY = Number(boardEl.getAttribute('data-board-origin-y'));
          const beforeStones = boardEl.getAttribute('data-board-stones') || '';
          if (!Number.isFinite(size) || size <= 0 || beforeStones.length !== size * size) {
            return ['edit tool smoke: board metadata invalid'];
          }
          if (!Number.isFinite(cellSize) || cellSize <= 0 || !Number.isFinite(originX) || !Number.isFinite(originY)) {
            return ['edit tool smoke: board geometry metadata invalid'];
          }

          const clickBoardPoint = async (x, y) => {
            const r = boardEl.getBoundingClientRect();
            boardEl.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: r.left + originX + x * cellSize,
              clientY: r.top + originY + y * cellSize,
            }));
            await waitForFrames(4);
          };
          const xyToSgf = (x, y) => String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
          const emptyIndexes = [];
          for (let i = 0; i < beforeStones.length; i++) {
            if (beforeStones[i] === '.') emptyIndexes.push(i);
          }
          if (emptyIndexes.length < 2) return ['edit tool smoke: not enough empty points'];
          const setupIndex = emptyIndexes[0];
          const markerIndex = emptyIndexes[1];
          const setupPoint = { x: setupIndex % size, y: Math.floor(setupIndex / size) };
          const markerPoint = { x: markerIndex % size, y: Math.floor(markerIndex / size) };
          const markerCoord = xyToSgf(markerPoint.x, markerPoint.y);

          const findFreshButton = (label) => Array.from(document.querySelectorAll('button')).find((button) =>
            targetSearchText(button).includes(label)
          ) || null;
          const openEditButton = findFreshButton('Open SGF edit tools');
          if (!openEditButton) return ['edit tool smoke: open control missing'];
          openEditButton.click();
          await waitForFrames(3);
          if (!document.querySelector('[data-edit-toolbar]')) failures.push('edit toolbar did not open');

          const whiteTool = findFreshButton('Setup white stone');
          if (!whiteTool) {
            failures.push('setup white tool missing');
          } else {
            whiteTool.click();
            await waitForFrames(2);
            await clickBoardPoint(setupPoint.x, setupPoint.y);
            const afterSetup = boardEl.getAttribute('data-board-stones') || '';
            if (afterSetup[setupIndex] !== 'W') failures.push('setup white tool did not place W');
          }

          const triangleTool = findFreshButton('Triangle marker');
          if (!triangleTool) {
            failures.push('triangle marker tool missing');
          } else {
            triangleTool.click();
            await waitForFrames(2);
            await clickBoardPoint(markerPoint.x, markerPoint.y);
            const triangles = (boardEl.getAttribute('data-board-triangles') || '').split(',').filter(Boolean);
            if (!triangles.includes(markerCoord)) failures.push('triangle marker tool did not record marker');
          }

          const closeEditButton = findFreshButton('Close edit mode');
          if (!closeEditButton) {
            failures.push('edit close control missing');
          } else {
            closeEditButton.click();
            await waitForFrames(2);
          }
          return failures;
        };
        const waitForSelector = async (selector) => {
          for (let i = 0; i < 60; i++) {
            const el = document.querySelector(selector);
            if (el && isVisibleTarget(el)) return el;
            await waitForFrames(1);
          }
          return null;
        };
        const runNoteEditorLifecycleSmoke = async () => {
          const failures = [];
          const openEditor = async () => {
            const existing = document.querySelector('[data-note-editor="true"]');
            if (existing) return existing;
            const editButton = document.querySelector('[data-note-edit="true"]');
            const preview = document.querySelector('[data-note-preview="true"]');
            (editButton || preview)?.click();
            await waitForFrames(2);
            return document.querySelector('[data-note-editor="true"]');
          };
          const saveWithButton = async (text) => {
            const editor = await openEditor();
            if (!editor) {
              failures.push('note editor did not open');
              return null;
            }
            editor.focus();
            setTextControlValue(editor, text);
            await waitForFrames(1);
            const saveButton = document.querySelector('[data-note-save="true"]');
            if (!saveButton) {
              failures.push('save control missing');
              return null;
            }
            saveButton.click();
            await waitForFrames(3);
            return document.querySelector('[data-note-preview="true"]');
          };
          const firstNote = 'Viewport QA note save';
          const cancelledNote = 'Viewport QA note cancel';
          const enterNote = 'Viewport QA note enter save';

          let preview = await saveWithButton(firstNote);
          if (!preview || !(preview.textContent || '').includes(firstNote)) {
            failures.push('save button did not persist preview text');
          }

          preview = document.querySelector('[data-note-preview="true"]');
          preview?.click();
          await waitForFrames(2);
          let editor = document.querySelector('[data-note-editor="true"]');
          if (!editor) {
            failures.push('note editor did not reopen from preview');
          } else {
            editor.focus();
            setTextControlValue(editor, cancelledNote);
            await waitForFrames(1);
            editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            await waitForFrames(3);
            preview = document.querySelector('[data-note-preview="true"]');
            const previewText = preview?.textContent || '';
            if (!previewText.includes(firstNote)) failures.push('Escape cancel did not restore saved note');
            if (previewText.includes(cancelledNote)) failures.push('Escape cancel leaked draft text into preview');
          }

          preview = document.querySelector('[data-note-preview="true"]');
          preview?.click();
          await waitForFrames(2);
          editor = document.querySelector('[data-note-editor="true"]');
          if (!editor) {
            failures.push('note editor did not reopen for Enter save');
          } else {
            editor.focus();
            setTextControlValue(editor, enterNote);
            await waitForFrames(1);
            editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            await waitForFrames(3);
            preview = document.querySelector('[data-note-preview="true"]');
            if (!preview || !(preview.textContent || '').includes(enterNote)) {
              failures.push('Enter did not save note text');
            }
          }

          preview = document.querySelector('[data-note-preview="true"]');
          preview?.click();
          await waitForFrames(2);
          editor = document.querySelector('[data-note-editor="true"]');
          if (editor) {
            setTextControlValue(editor, '');
            await waitForFrames(1);
            document.querySelector('[data-note-save="true"]')?.click();
            await waitForFrames(2);
          }

          return failures;
        };
        const modalSmokeFailures = [];
        const modalSmallTouchTargets = [];
        const dispatchShortcut = (key, options = {}) => {
          const event = new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
            ctrlKey: !!options.ctrlKey,
            metaKey: !!options.metaKey,
            shiftKey: !!options.shiftKey,
            altKey: !!options.altKey,
          });
          window.dispatchEvent(event);
          return event.defaultPrevented;
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
        const runClipboardSmoke = async () => {
          const failures = [];
          const waitForToastText = async (text) => {
            for (let i = 0; i < 30; i++) {
              const toast = Array.from(document.querySelectorAll('.notification-toast')).find((candidate) =>
                (candidate.textContent || '').includes(text)
              );
              if (toast) return toast;
              await waitForFrames(1);
            }
            return null;
          };
          const originalClipboard = (() => {
            try {
              return navigator.clipboard;
            } catch {
              return undefined;
            }
          })();
          const hadOwnClipboard = Object.prototype.hasOwnProperty.call(navigator, 'clipboard');
          const originalQaClipboard = window.__webKatrainQaClipboardText;
          try {
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true,
              value: {
                writeText: async (text) => {
                  window.__webKatrainQaClipboardText = String(text);
                },
                readText: async () => String(window.__webKatrainQaClipboardText || ''),
              },
            });
          } catch (error) {
            return ['clipboard mock failed: ' + (error instanceof Error ? error.message : String(error))];
          }

          try {
            await withShortcutOverride('copy-sgf', { key: 'F10', ctrl: false, shift: false, alt: false }, async () => {
              dispatchShortcut('F10');
              await waitForFrames(4);
            });
            const copied = String(window.__webKatrainQaClipboardText || '');
            if (!/^\\(\\s*;/.test(copied)) failures.push('copied text is not SGF');
            if (!copied.includes('SZ[')) failures.push('copied SGF is missing board size');
            const copiedToast = await waitForToastText('Copied SGF to clipboard');
            if (!copiedToast) failures.push('copy success toast missing');
            copiedToast?.querySelector('.notification-toast-close')?.click();
            await waitForFrames(2);

            const pasteSgf = '(;FF[4]GM[1]SZ[19]AB[dd]PL[W])';
            window.__webKatrainQaClipboardText = pasteSgf;
            await withShortcutOverride('paste-sgf', { key: 'F12', ctrl: false, shift: false, alt: false }, async () => {
              dispatchShortcut('F12');
              await waitForFrames(8);
            });
            const boardEl = document.querySelector('[data-board-snapshot="true"]');
            const stones = boardEl?.getAttribute('data-board-stones') || '';
            const size = Number(boardEl?.getAttribute('data-board-size'));
            const ddIndex = 3 + 3 * size;
            if (!boardEl || !Number.isFinite(size) || stones[ddIndex] !== 'B') {
              failures.push('pasted setup SGF did not place B at dd');
            }
            const loadedToast = await waitForToastText('Loaded SGF');
            if (!loadedToast) failures.push('paste success toast missing');
            loadedToast?.querySelector('.notification-toast-close')?.click();
            await waitForFrames(2);
          } finally {
            if (originalQaClipboard === undefined) {
              delete window.__webKatrainQaClipboardText;
            } else {
              window.__webKatrainQaClipboardText = originalQaClipboard;
            }
            try {
              if (hadOwnClipboard) {
                Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
              } else {
                delete navigator.clipboard;
              }
            } catch {
              // Best effort restore for the mocked clipboard.
            }
          }
          return failures;
        };
        const runFullscreenSmoke = async () => {
          const failures = [];
          const root = document.documentElement;
          const requestDescriptor = Object.getOwnPropertyDescriptor(root, 'requestFullscreen');
          const exitDescriptor = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
          const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
          let fullscreenActive = false;
          let requestCount = 0;
          let exitCount = 0;
          try {
            Object.defineProperty(root, 'requestFullscreen', {
              configurable: true,
              value: async () => {
                requestCount += 1;
                fullscreenActive = true;
                document.dispatchEvent(new Event('fullscreenchange'));
              },
            });
            Object.defineProperty(document, 'exitFullscreen', {
              configurable: true,
              value: async () => {
                exitCount += 1;
                fullscreenActive = false;
                document.dispatchEvent(new Event('fullscreenchange'));
              },
            });
            Object.defineProperty(document, 'fullscreenElement', {
              configurable: true,
              get: () => (fullscreenActive ? root : null),
            });
          } catch (error) {
            return ['fullscreen mock failed: ' + (error instanceof Error ? error.message : String(error))];
          }

          try {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            const firstPrevented = dispatchShortcut('F11');
            await waitForFrames(4);
            if (!firstPrevented) failures.push('F11 fullscreen request did not prevent default');
            if (requestCount !== 1) failures.push('F11 did not request fullscreen');
            if (!fullscreenActive) failures.push('F11 did not enter fullscreen');

            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            const secondPrevented = dispatchShortcut('F11');
            await waitForFrames(4);
            if (!secondPrevented) failures.push('F11 fullscreen exit did not prevent default');
            if (exitCount !== 1) failures.push('F11 did not exit fullscreen');
            if (fullscreenActive) failures.push('F11 left fullscreen active after second toggle');
          } finally {
            if (requestDescriptor) Object.defineProperty(root, 'requestFullscreen', requestDescriptor);
            else delete root.requestFullscreen;
            if (exitDescriptor) Object.defineProperty(document, 'exitFullscreen', exitDescriptor);
            else delete document.exitFullscreen;
            if (fullscreenDescriptor) Object.defineProperty(document, 'fullscreenElement', fullscreenDescriptor);
            else delete document.fullscreenElement;
          }
          return failures;
        };
        const runPwaBannerSmoke = async () => {
          const failures = [];
          const smallTouchTargets = [];
          const waitForBanner = async () => {
            for (let i = 0; i < 30; i++) {
              const banner = document.querySelector('.pwa-install-banner');
              if (banner && isVisibleBox(banner)) return banner;
              await waitForFrames(1);
            }
            return null;
          };
          const assertBannerFits = (banner, label) => {
            const bannerRect = rect(banner);
            if (!bannerRect) {
              failures.push(label + ' banner rect missing');
              return;
            }
            if (bannerRect.left < -1 || bannerRect.right > innerWidth + 1 || bannerRect.top < -1 || bannerRect.bottom > innerHeight + 1) {
              failures.push(label + ' banner escapes viewport ' + Math.round(bannerRect.width) + 'x' + Math.round(bannerRect.height) + ' at ' + Math.round(bannerRect.left) + ',' + Math.round(bannerRect.top) + '-' + Math.round(bannerRect.right) + ',' + Math.round(bannerRect.bottom) + ' in ' + innerWidth + 'x' + innerHeight);
            }
          };

          window.dispatchEvent(new Event('web-katrain:pwa-offline-ready'));
          await waitForFrames(4);
          let banner = await waitForBanner();
          if (!banner) {
            failures.push('offline-ready banner missing');
            return { failures, smallTouchTargets };
          }
          if (document.documentElement.getAttribute('data-pwa-banner') !== 'offline-ready') {
            failures.push('offline-ready root state missing');
          }
          if (!(banner.textContent || '').includes('Offline ready')) {
            failures.push('offline-ready banner text missing');
          }
          if (!getComputedStyle(document.documentElement).getPropertyValue('--pwa-banner-height').trim()) {
            failures.push('offline-ready banner did not reserve root height');
          }
          assertBannerFits(banner, 'offline-ready');
          if (${viewport.mobile}) smallTouchTargets.push(...auditSmallTouchTargets(banner));

          window.dispatchEvent(new Event('web-katrain:pwa-update-ready'));
          await waitForFrames(4);
          banner = await waitForBanner();
          if (!banner) {
            failures.push('update-ready banner missing');
            return { failures, smallTouchTargets };
          }
          if (document.documentElement.getAttribute('data-pwa-banner') !== 'update-ready') {
            failures.push('update-ready did not replace offline-ready banner');
          }
          if (!(banner.textContent || '').includes('Update ready')) {
            failures.push('update-ready banner text missing');
          }
          assertBannerFits(banner, 'update-ready');
          if (${viewport.mobile}) smallTouchTargets.push(...auditSmallTouchTargets(banner));

          const dismissButton = findButtonByLabel('Dismiss', banner);
          if (!dismissButton) {
            failures.push('dismiss control missing');
          } else {
            dismissButton.click();
            await waitForFrames(4);
            if (document.querySelector('.pwa-install-banner')) {
              failures.push('dismiss did not remove banner');
            }
            if (document.documentElement.hasAttribute('data-pwa-banner')) {
              failures.push('dismiss did not clear root banner state');
            }
            if (getComputedStyle(document.documentElement).getPropertyValue('--pwa-banner-height').trim()) {
              failures.push('dismiss did not clear root banner height');
            }
          }
          return { failures, smallTouchTargets };
        };
        const findButtonByLabel = (label, scope = document) => Array.from(scope.querySelectorAll('button')).find((candidate) => {
          const candidateLabel = targetLabel(candidate);
          return candidateLabel === label || candidateLabel.includes(label) || targetSearchText(candidate).includes(label);
        }) || null;
        const closeDialog = async (dialog, closeLabel) => {
          const button = findButtonByLabel(closeLabel, dialog);
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
        const boardThemeSmokeFailures = [];
        let boardThemeSmokeRan = false;
        const localeSmokeFailures = [];
        let localeSmokeRan = false;
        const runTopLanguageSwitcherSmoke = async () => {
          if (${viewport.mobile}) return;
          const trigger = document.querySelector('[data-language-switcher-button="true"]');
          if (!trigger || !isVisibleBox(trigger)) {
            return;
          }
          trigger.click();
          await waitForFrames(3);
          const menu = document.querySelector('[data-language-switcher-menu="true"]');
          if (!menu) {
            localeSmokeFailures.push('top language switcher menu missing');
            return;
          }
          const optionValues = Array.from(menu.querySelectorAll('[data-language-option]')).map((option) => option.getAttribute('data-language-option'));
          const requiredLocales = ['en', 'zh', 'ko', 'ja', 'fr', 'de', 'es', 'it'];
          for (const locale of requiredLocales) {
            if (!optionValues.includes(locale)) localeSmokeFailures.push('top language option missing: ' + locale);
          }
          const germanOption = menu.querySelector('[data-language-option="de"]');
          if (!germanOption) {
            localeSmokeFailures.push('top language German option missing');
            return;
          }
          germanOption.click();
          await waitForFrames(4);
          if (document.documentElement.lang !== 'de') {
            localeSmokeFailures.push('top language switcher did not update html lang to de');
          }
          if (document.documentElement.getAttribute('data-locale') !== 'de') {
            localeSmokeFailures.push('top language switcher did not update root data-locale to de');
          }
          const afterTrigger = document.querySelector('[data-language-switcher-button="true"]');
          if (afterTrigger?.getAttribute('data-current-locale') !== 'de') {
            localeSmokeFailures.push('top language switcher current locale not updated');
          }
        };
        const runBoardThemePickerSmoke = async (dialog) => {
          if (boardThemeSmokeRan) return;
          boardThemeSmokeRan = true;
          const boardEl = document.querySelector('[data-board-snapshot="true"]');
          const beforeTheme = boardEl?.getAttribute('data-board-theme') || '';
          const picker = dialog.querySelector('[data-board-theme-picker="true"]');
          if (!boardEl) {
            boardThemeSmokeFailures.push('board missing before theme change');
            return;
          }
          if (!picker) {
            boardThemeSmokeFailures.push('board theme picker missing');
            return;
          }
          const choices = Array.from(picker.querySelectorAll('[data-board-theme-choice]'));
          if (choices.length < 2) {
            boardThemeSmokeFailures.push('board theme choices missing');
            return;
          }
          const nextChoice = choices.find((choice) => choice.getAttribute('data-board-theme-choice') !== beforeTheme) || choices[0];
          const nextTheme = nextChoice?.getAttribute('data-board-theme-choice') || '';
          if (!nextChoice || !nextTheme) {
            boardThemeSmokeFailures.push('alternate board theme choice missing');
            return;
          }
          nextChoice.click();
          await waitForFrames(4);
          const afterTheme = document.querySelector('[data-board-snapshot="true"]')?.getAttribute('data-board-theme') || '';
          if (afterTheme !== nextTheme) {
            boardThemeSmokeFailures.push('board theme did not update from ' + beforeTheme + ' to ' + nextTheme + ' (saw ' + afterTheme + ')');
          }
          if (nextChoice.getAttribute('aria-checked') !== 'true') {
            boardThemeSmokeFailures.push('selected board theme choice did not become checked');
          }
        };
        const runLocalePickerSmoke = async (dialog) => {
          if (localeSmokeRan) return;
          localeSmokeRan = true;
          const selector = dialog.querySelector('[data-settings-locale="true"]');
          if (!selector) {
            localeSmokeFailures.push('locale selector missing');
            return;
          }
          const optionValues = Array.from(selector.querySelectorAll('option')).map((option) => option.value);
          const requiredLocales = ['en', 'zh', 'ko', 'ja', 'fr', 'de', 'es', 'it'];
          for (const locale of requiredLocales) {
            if (!optionValues.includes(locale)) localeSmokeFailures.push('locale option missing: ' + locale);
          }
          const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
          if (valueSetter) valueSetter.call(selector, 'ja');
          else selector.value = 'ja';
          selector.dispatchEvent(new Event('change', { bubbles: true }));
          await waitForFrames(4);
          if (selector.value !== 'ja') localeSmokeFailures.push('locale selector did not keep Japanese value');
          if (document.documentElement.lang !== 'ja') {
            localeSmokeFailures.push('html lang did not update to ja');
          }
          if (document.documentElement.getAttribute('data-locale') !== 'ja') {
            localeSmokeFailures.push('root data-locale did not update to ja');
          }
        };
        const runPhotoBoardTraceImportSmoke = async () => {
          const failures = [];
          const waitForToastText = async (text) => {
            for (let i = 0; i < 30; i++) {
              const toast = Array.from(document.querySelectorAll('.notification-toast')).find((candidate) =>
                (candidate.textContent || '').includes(text)
              );
              if (toast) return toast;
              await waitForFrames(1);
            }
            return null;
          };
          const waitForDialogClose = async () => {
            for (let i = 0; i < 60; i++) {
              if (!document.querySelector('[aria-labelledby="photo-board-title"]')) return true;
              await waitForFrames(1);
            }
            return false;
          };
          const openPhotoBoard = async () => {
            if (${viewport.mobile}) {
              const toolsButton = findButtonByLabel('Tools');
              if (!toolsButton) throw new Error('Tools button missing');
              toolsButton.click();
              const toolsDialog = await waitForSelector('[data-mobile-tools-dialog="true"]');
              if (!toolsDialog) throw new Error('Tools dialog did not open');
              const photoBoardButton = findButtonByLabel('Photo Board', toolsDialog);
              if (!photoBoardButton) throw new Error('Photo Board action missing in tools');
              photoBoardButton.click();
              await waitForFrames(2);
              return;
            }
            const photoBoardButton = findButtonByLabel('Photo Board');
            if (!photoBoardButton) throw new Error('Photo Board action missing');
            photoBoardButton.click();
            await waitForFrames(2);
          };
          const createSyntheticBoardPhoto = async (boardSize, blackPoint, whitePoint) => {
            const canvas = document.createElement('canvas');
            canvas.width = 760;
            canvas.height = 760;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Synthetic board canvas unavailable');
            const margin = Math.min(canvas.width, canvas.height) * 0.06;
            const span = canvas.width - 1 - margin * 2;
            const cell = span / Math.max(1, boardSize - 1);
            const pointCenter = (point) => ({
              x: margin + (point.x / Math.max(1, boardSize - 1)) * span,
              y: margin + (point.y / Math.max(1, boardSize - 1)) * span,
            });
            context.fillStyle = '#d6ad68';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.strokeStyle = 'rgba(53, 37, 24, 0.7)';
            context.lineWidth = Math.max(1, cell * 0.035);
            for (let i = 0; i < boardSize; i++) {
              const position = margin + (i / Math.max(1, boardSize - 1)) * span;
              context.beginPath();
              context.moveTo(margin, position);
              context.lineTo(margin + span, position);
              context.moveTo(position, margin);
              context.lineTo(position, margin + span);
              context.stroke();
            }
            const drawStone = (point, color) => {
              const center = pointCenter(point);
              context.beginPath();
              context.arc(center.x, center.y, cell * 0.36, 0, Math.PI * 2);
              context.fillStyle = color === 'black' ? '#181818' : '#f8f8f8';
              context.fill();
            };
            drawStone(blackPoint, 'black');
            drawStone(whitePoint, 'white');
            const blob = await new Promise((resolve) => canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png'));
            if (!blob) throw new Error('Synthetic board image export failed');
            return new File([blob], 'viewport-auto-trace-board.png', { type: 'image/png' });
          };
          const chooseSyntheticBoardPhoto = async (dialog, boardSize, blackPoint, whitePoint) => {
            const input = Array.from(dialog.querySelectorAll('input[type="file"]')).find((candidate) =>
              (candidate.getAttribute('accept') || '').includes('.png')
            );
            if (!input) throw new Error('Photo file input missing');
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(await createSyntheticBoardPhoto(boardSize, blackPoint, whitePoint));
            Object.defineProperty(input, 'files', { configurable: true, value: dataTransfer.files });
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await waitForFrames(8);
          };
          const waitForAutoTrace = async (dialog) => {
            for (let i = 0; i < 90; i++) {
              const status = dialog.querySelector('[data-photo-board-auto-trace-status="true"]');
              if ((status?.textContent || '').includes('Auto traced')) return status;
              await waitForFrames(1);
            }
            return null;
          };

          try {
            await openPhotoBoard();
            const dialog = await waitForSelector('[aria-labelledby="photo-board-title"]');
            if (!dialog) return ['photo board dialog did not open'];
            if (${viewport.mobile}) {
              const traceTab = dialog.querySelector('[data-photo-board-mobile-tab="trace"]');
              if (!traceTab) {
                failures.push('mobile trace tab missing');
              } else {
                traceTab.click();
                await waitForFrames(2);
              }
            }

            const tracePanel = dialog.querySelector('[data-photo-board-panel="trace"]');
            tracePanel?.scrollIntoView({ block: 'center', inline: 'nearest' });
            await waitForFrames(2);
            const traceToolGroup = tracePanel?.querySelector('[aria-label="Trace tool"]') || null;
            const grid = tracePanel?.querySelector('[data-photo-board-trace-grid="true"]') || null;
            if (!tracePanel) failures.push('trace panel missing');
            if (!traceToolGroup) failures.push('trace tool group missing');
            if (!grid) failures.push('trace grid missing');
            const boardSize = Math.sqrt(grid?.querySelectorAll('[data-photo-board-point="true"]').length || 0);
            if (!Number.isInteger(boardSize) || boardSize < 9) failures.push('trace grid size invalid');
            if (failures.length > 0) return failures;

            const blackPoint = { x: Math.min(10, boardSize - 2), y: Math.min(10, boardSize - 2) };
            const whitePoint = { x: Math.max(0, boardSize - 2), y: Math.max(0, boardSize - 2) };
            const blackIndex = blackPoint.y * boardSize + blackPoint.x;
            const whiteIndex = whitePoint.y * boardSize + whitePoint.x;
            await chooseSyntheticBoardPhoto(dialog, boardSize, blackPoint, whitePoint);
            const autoTraceButton = dialog.querySelector('[data-photo-board-auto-trace="true"]');
            if (!autoTraceButton) {
              failures.push('auto trace control missing');
              return failures;
            }
            if (autoTraceButton.disabled || autoTraceButton.getAttribute('aria-disabled') === 'true') {
              failures.push('auto trace control stayed disabled after photo upload');
              return failures;
            }
            autoTraceButton.click();
            const autoTraceStatus = await waitForAutoTrace(dialog);
            if (!autoTraceStatus) failures.push('auto trace status missing');
            const blackTracePoint = grid.querySelector('[data-photo-board-index="' + blackIndex + '"]');
            const whiteTracePoint = grid.querySelector('[data-photo-board-index="' + whiteIndex + '"]');
            if (!((blackTracePoint?.getAttribute('aria-label') || '').includes('black'))) {
              failures.push('auto trace missing black stone at synthetic point');
            }
            if (!((whiteTracePoint?.getAttribute('aria-label') || '').includes('white'))) {
              failures.push('auto trace missing white stone at synthetic point');
            }
            const importButton = dialog.querySelector('[data-photo-board-import="true"]');
            if (!importButton) {
              failures.push('import control missing');
              return failures;
            }
            if (importButton.disabled || importButton.getAttribute('aria-disabled') === 'true') {
              failures.push('import control stayed disabled after tracing');
              return failures;
            }
            importButton.click();
            await waitForFrames(4);
            if (!(await waitForDialogClose())) failures.push('import did not close photo board dialog');

            const importedBoard = document.querySelector('[data-board-snapshot="true"]');
            const importedSize = Number(importedBoard?.getAttribute('data-board-size'));
            const importedMoveCount = Number(importedBoard?.getAttribute('data-board-move-count'));
            const importedStones = importedBoard?.getAttribute('data-board-stones') || '';
            if (!importedBoard || importedSize !== boardSize || importedStones.length !== boardSize * boardSize) {
              failures.push('main board metadata missing after photo board import');
            } else {
              if (importedMoveCount !== 0) failures.push('photo board import should load setup at move 0');
              if (importedStones[blackIndex] !== 'B') failures.push('photo board import missing traced black stone');
              if (importedStones[whiteIndex] !== 'W') failures.push('photo board import missing traced white stone');
            }
            const importedToast = await waitForToastText('Imported board position.');
            importedToast?.querySelector('.notification-toast-close')?.click();
            await waitForFrames(2);
          } catch (error) {
            failures.push('photo board trace import: ' + (error instanceof Error ? error.message : String(error)));
          }
          return failures;
        };
        const scorePanelFailures = [];
        const scorePanelSmallTouchTargets = [];
        let scorePanelReachable = true;
        const fullscreenSmokeFailures = await runFullscreenSmoke();
        const clipboardSmokeFailures = await runClipboardSmoke();
        const pwaBannerSmoke = await runPwaBannerSmoke();
        let photoBoardTraceImportFailures = [];
        let editToolSmokeFailures = [];
        const analysisDepthFailures = [];
        const analysisDepthSmallTouchTargets = [];
        let analysisDepthReachable = true;
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
        let noteEditorLifecycleFailures = [];
        let reviewSmallTouchTargets = [];
        if (${viewport.mobile}) {
          const reviewTab = Array.from(document.querySelectorAll('button[role="tab"]')).find((button) => button.getAttribute('aria-label') === 'Review');
          reviewTab?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          reviewSmallTouchTargets = auditSmallTouchTargets();
          const noteEditor = document.querySelector('[data-note-editor="true"]');
          noteEditorReachable = !!noteEditor;
          if (noteEditor) {
            noteEditor.focus();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const margin = getComputedStyle(noteEditor).scrollMarginBlockEnd;
            noteEditorKeyboardAware = noteEditor.getAttribute('data-note-keyboard-aware') === 'true' && margin !== '0px';
            noteEditorLifecycleFailures = await runNoteEditorLifecycleSmoke();
          } else {
            noteEditorKeyboardAware = false;
            noteEditorLifecycleFailures = ['note editor missing'];
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
        photoBoardTraceImportFailures = await runPhotoBoardTraceImportSmoke();
        await runTopLanguageSwitcherSmoke();
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
        await smokeModal({
          name: 'settings',
          selector: '[aria-labelledby="settings-title"]',
          closeLabel: 'Close settings',
          open: async () => {
            if (${viewport.mobile}) {
              const menuButton = findButtonByLabel('Menu');
              if (!menuButton) throw new Error('Menu button missing');
              menuButton.click();
              const menuDialog = await waitForSelector('[aria-labelledby="menu-title"]');
              if (!menuDialog) throw new Error('Menu drawer did not open');
              modalSmallTouchTargets.push(...auditSmallTouchTargets(menuDialog).map((target) => ({ ...target, modal: 'menu drawer' })));
              const menuLocale = menuDialog.querySelector('[data-menu-locale="true"]');
              if (!menuLocale) {
                localeSmokeFailures.push('mobile menu locale selector missing');
              } else {
                const optionValues = Array.from(menuLocale.querySelectorAll('option')).map((option) => option.value);
                for (const locale of ['en', 'zh', 'ko', 'ja', 'fr', 'de', 'es', 'it']) {
                  if (!optionValues.includes(locale)) localeSmokeFailures.push('mobile menu locale option missing: ' + locale);
                }
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
                if (valueSetter) valueSetter.call(menuLocale, 'fr');
                else menuLocale.value = 'fr';
                menuLocale.dispatchEvent(new Event('change', { bubbles: true }));
                await waitForFrames(4);
                if (document.documentElement.lang !== 'fr') {
                  localeSmokeFailures.push('mobile menu locale did not update html lang to fr');
                }
                if (document.documentElement.getAttribute('data-locale') !== 'fr') {
                  localeSmokeFailures.push('mobile menu locale did not update root data-locale to fr');
                }
              }
              const settingsButton = findButtonByLabel('Open settings', menuDialog) || findButtonByLabel('Settings', menuDialog);
              if (!settingsButton) throw new Error('Settings action missing in menu');
              settingsButton.click();
            } else {
              await withShortcutOverride('settings-modal', { key: 'F8', ctrl: false, shift: false, alt: false }, async () => {
                dispatchShortcut('F8');
                await waitForFrames(2);
              });
            }
            await waitForFrames(2);
          },
          afterOpen: async (dialog) => {
            if (!dialog.querySelector('.settings-tabs')) {
              modalSmokeFailures.push('settings tabs missing');
            }
            const settingsTabs = ['Analysis', 'AI/Engine', 'Shortcuts', 'General'];
            for (const tabLabel of settingsTabs) {
              const tabButton = findButtonByLabel(tabLabel, dialog);
              if (!tabButton) {
                modalSmokeFailures.push(\`settings \${tabLabel} tab missing\`);
                continue;
              }
              tabButton.click();
              await waitForFrames(2);
              if (${viewport.mobile}) {
                modalSmallTouchTargets.push(...auditSmallTouchTargets(dialog).map((target) => ({ ...target, modal: \`settings \${tabLabel}\` })));
              }
              if (tabLabel === 'General') {
                await runLocalePickerSmoke(dialog);
                await runBoardThemePickerSmoke(dialog);
              }
            }
          },
        });
        await smokeModal({
          name: 'photo board',
          selector: '[aria-labelledby="photo-board-title"]',
          closeLabel: 'Close photo board',
          open: async () => {
            if (${viewport.mobile}) {
              const toolsButton = findButtonByLabel('Tools');
              if (!toolsButton) throw new Error('Tools button missing');
              toolsButton.click();
              const toolsDialog = await waitForSelector('[data-mobile-tools-dialog="true"]');
              if (!toolsDialog) throw new Error('Tools dialog did not open');
              const photoBoardButton = findButtonByLabel('Photo Board', toolsDialog);
              if (!photoBoardButton) throw new Error('Photo Board action missing in tools');
              photoBoardButton.click();
            } else {
              const photoBoardButton = findButtonByLabel('Photo Board');
              if (!photoBoardButton) throw new Error('Photo Board action missing');
              photoBoardButton.click();
            }
            await waitForFrames(2);
          },
          afterOpen: async (dialog) => {
            if (!dialog.querySelector('[data-photo-board-empty-source="true"]')) {
              modalSmokeFailures.push('photo board empty source missing');
            }
            if (${viewport.mobile}) {
              if (!dialog.querySelector('[data-photo-board-mobile-tab="photo"]')) {
                modalSmokeFailures.push('photo board mobile photo tab missing');
              }
              if (!dialog.querySelector('[data-photo-board-mobile-tab="trace"]')) {
                modalSmokeFailures.push('photo board mobile trace tab missing');
              }
            }
          },
        });
        const analyzeButton = Array.from(document.querySelectorAll('button')).find((button) => targetSearchText(button).includes('Toggle analysis mode')) || findButtonByLabel('Analyze');
        if (!analyzeButton) {
          analysisDepthReachable = false;
          analysisDepthFailures.push('analyze control missing');
        } else {
          analyzeButton.click();
          await waitForFrames(4);
          const commandBar = await waitForSelector('[data-analysis-command-bar="true"]');
          const depthButton = commandBar?.querySelector('[data-analysis-live-depth="true"]');
          if (!commandBar || !depthButton) {
            analysisDepthReachable = false;
            if (commandBar) {
              analysisDepthFailures.push('depth control missing');
            } else {
              const visibleButtonLabels = Array.from(document.querySelectorAll('button'))
                .filter(isVisibleTarget)
                .map((button) => targetSearchText(button).slice(0, 64))
                .slice(0, 10)
                .join(' | ');
              analysisDepthFailures.push(\`command bar did not open after \${targetSearchText(analyzeButton).slice(0, 64)}; buttons: \${visibleButtonLabels}\`);
            }
          } else {
            depthButton.click();
            await waitForFrames(2);
            const depthPopover = await waitForSelector('[data-analysis-live-depth-popover="true"]');
            if (!depthPopover) {
              analysisDepthReachable = false;
              analysisDepthFailures.push('depth popover did not open');
            } else {
              const depthPopoverRect = rect(depthPopover);
              if (depthPopoverRect && (depthPopoverRect.left < -1 || depthPopoverRect.right > innerWidth + 1 || depthPopoverRect.top < -1 || depthPopoverRect.bottom > innerHeight + 1)) {
                analysisDepthFailures.push(\`popover escapes viewport \${Math.round(depthPopoverRect.width)}x\${Math.round(depthPopoverRect.height)} at \${Math.round(depthPopoverRect.left)},\${Math.round(depthPopoverRect.top)}-\${Math.round(depthPopoverRect.right)},\${Math.round(depthPopoverRect.bottom)} in \${innerWidth}x\${innerHeight}\`);
              }
              if (depthPopover.querySelectorAll('[data-analysis-live-depth-option]').length < 4) {
                analysisDepthFailures.push('preset options missing');
              }
              if (!depthPopover.querySelector('.analysis-command-bar__depth-help')) {
                analysisDepthFailures.push('depth help missing');
              }
              if (!depthPopover.querySelector('.analysis-command-bar__depth-slider')) {
                analysisDepthFailures.push('depth slider missing');
              }
              if (!depthPopover.querySelector('.analysis-command-bar__depth-input')) {
                analysisDepthFailures.push('exact visits input missing');
              }
              if (${viewport.mobile}) {
                analysisDepthSmallTouchTargets.push(...auditSmallTouchTargets(depthPopover));
              }
              if (!(await closeDialog(depthPopover, 'Close live depth selector'))) {
                analysisDepthFailures.push('close control missing');
              }
            }
          }
        }
        const scoreButton = Array.from(document.querySelectorAll('button')).find((button) => {
          const label = targetLabel(button);
          return label.includes('Score position') || label === 'Score' || label.includes('ScoreShift');
        });
        if (!scoreButton) {
          scorePanelReachable = false;
        } else {
          scoreButton.click();
          await waitForFrames(2);
          const scorePanel = await waitForSelector('.manual-score-panel');
          if (!scorePanel) {
            scorePanelReachable = false;
          } else {
            if (!scorePanel.querySelector('.manual-score-result')) {
              scorePanelFailures.push('result banner missing');
            }
            if (!scorePanel.querySelector('[data-manual-score-status="true"]')) {
              scorePanelFailures.push('status strip missing');
            }
            if (!scorePanel.querySelector('[data-manual-score-help="true"]')) {
              scorePanelFailures.push('dead-stone help missing');
            }
            const scorePanelRect = rect(scorePanel);
            if (scorePanelRect && (scorePanelRect.left < -1 || scorePanelRect.right > innerWidth + 1 || scorePanelRect.top < -1 || scorePanelRect.bottom > innerHeight + 1)) {
              scorePanelFailures.push(\`panel escapes viewport \${Math.round(scorePanelRect.width)}x\${Math.round(scorePanelRect.height)} at \${Math.round(scorePanelRect.left)},\${Math.round(scorePanelRect.top)}-\${Math.round(scorePanelRect.right)},\${Math.round(scorePanelRect.bottom)} in \${innerWidth}x\${innerHeight}\`);
            }
            if (${viewport.mobile}) {
              scorePanelSmallTouchTargets.push(...auditSmallTouchTargets(scorePanel));
            }
            const doneButton = findButtonByLabel('Done scoring', scorePanel) || findButtonByLabel('Done', scorePanel);
            if (!doneButton) {
              scorePanelFailures.push('done control missing');
            } else {
              doneButton.click();
              await waitForFrames(2);
            }
          }
        }
        editToolSmokeFailures = await runEditToolSmoke();
        const navigationSmokeFailures = await runNavigationSmoke();
        const captureSmokeFailures = await runCaptureSmoke();
        const boardInteractionFailures = await runBoardInteractionSmoke();
        const libraryPanel = document.querySelector('[data-layout-panel="library"]') || document.querySelector('.wk-dashboard .library');
        const sidePanel = document.querySelector('[data-layout-panel="side"]') || document.querySelector('.wk-dashboard .sidebar');
        return {
          viewport: '${viewport.width}x${viewport.height}',
          desktop: ${viewport.width >= 1024},
          expectDualDesktopPanels: ${viewport.width === 1024 && viewport.height === 768 && !viewport.mobile} && !dashboard,
          innerWidth,
          innerHeight,
          documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          topBar: topBarRect,
          topControlsOutOfBar,
          topControlsOutOfBarDetails,
          topToggle: rect(topToggle),
          editToolbar: rect(editToolbar),
          board: rect(board),
          libraryPanel: rect(libraryPanel),
          sidePanel: rect(sidePanel),
          libraryPanelVisible: isVisibleBox(libraryPanel),
          sidePanelVisible: isVisibleBox(sidePanel),
          libraryPanelOverlapsBoard: intersects(rect(libraryPanel), rect(board)),
          sidePanelOverlapsBoard: intersects(rect(sidePanel), rect(board)),
          missingFileActions: requiredFileActions.filter((label) => !allButtons.some((button) => button.getAttribute('aria-label') === label)),
          viewMenuReachable: !!Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('View')),
          actionsMenuReachable: !!dashboard || !!Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Actions')),
          toolsReachable: !!Array.from(document.querySelectorAll('button')).find((button) => (button.getAttribute('aria-label') || button.getAttribute('title') || '') === 'Tools'),
          editToolsReachable,
          noteEditorReachable,
          noteEditorKeyboardAware,
          noteEditorLifecycleFailures,
          navigationSmokeFailures,
          captureSmokeFailures,
          fullscreenSmokeFailures,
          pwaBannerFailures: pwaBannerSmoke.failures,
          pwaBannerSmallTouchTargets: pwaBannerSmoke.smallTouchTargets,
          photoBoardTraceImportFailures,
          boardThemeSmokeFailures,
          localeSmokeFailures,
          reviewSmallTouchTargets,
          boardTouchAction,
          smallTouchTargets,
          editModeBoardTouchAction,
          editModeSmallTouchTargets,
          modalSmokeFailures,
          modalSmallTouchTargets,
          clipboardSmokeFailures,
          editToolSmokeFailures,
          scorePanelReachable,
          scorePanelFailures,
          scorePanelSmallTouchTargets,
          analysisDepthReachable,
          analysisDepthFailures,
          analysisDepthSmallTouchTargets,
          boardInteractionFailures,
          commandBarOverlaps,
          topToggleOverTopBar: intersects(rect(topToggle), topBarRect),
          topToggleOverEditToolbar: intersects(rect(topToggle), rect(editToolbar)),
        };
      })()`);
      result.defaultBoard = defaultLayout.board;
      result.defaultDocumentOverflow = defaultLayout.documentOverflow;
      assertViewport(result);
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(
        path.join(screenshotDir, `${viewport.width}x${viewport.height}-qa-state.png`),
        Buffer.from(screenshot.result.data, 'base64')
      );
      results.push(result);
    }
    cdp.close();
    console.log(`Viewport checks passed. Screenshots: ${screenshotDir}`);
    for (const result of results) {
      const board = result.defaultBoard ?? result.board;
      console.log(`${result.viewport}: board ${Math.round(board.width)}x${Math.round(board.height)}`);
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
