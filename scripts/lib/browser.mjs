import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/**
 * Driving a headless Chrome over CDP, shared by the checks under scripts/.
 *
 * This was all inside check-viewports.mjs, which was fine while it was the only
 * thing that needed a browser. check-responsiveness.mjs needs the same Chrome,
 * the same devtools socket and the same evaluate(), and a second copy of a CDP
 * client is a second thing to fix when a CI runner finds a new way to break it
 * -- every hard-won comment below records one of those.
 */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Where Chrome is.
 *
 * This used to be `google-chrome` on anything but a Mac, which is true of a
 * developer's Debian box and was true of the GitHub runner the day it was
 * written -- but this suite now runs in CI, and a bare binary name that is not
 * on PATH fails as an unhelpful spawn ENOENT partway through a job. Try the
 * usual names in order and say plainly what was tried if none of them exist.
 *
 * CHROME_PATH still wins outright, and CHROME_BIN is consulted because the
 * GitHub runner images set it.
 */
export function chromeCandidates() {
  const candidates = process.platform === 'darwin'
    ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
    : [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ];

  return candidates.map((path) => ({ path, exists: fs.existsSync(path) }));
}

export function resolveChromePath() {
  const explicit = process.env.CHROME_PATH || process.env.CHROME_BIN;
  if (explicit) return explicit;

  const found = chromeCandidates().find((candidate) => candidate.exists);
  if (found) return found.path;

  // Nothing at a known absolute path. Fall back to the name and let PATH
  // decide, which still works on most machines; the 'error' handler on the
  // spawn reports what was tried if it does not.
  return process.platform === 'darwin' ? chromeCandidates()[0].path : 'google-chrome';
}

export const chromePath = resolveChromePath();


/**
 * Viewport metrics and input capability are one setting, not two.
 *
 * `mobile: true` on the metrics override resizes the viewport and does nothing
 * else: Chrome still answers `(pointer: coarse)` with false, so every rule and
 * branch this app keys on a finger ran under the sweep as though a mouse were
 * attached. There are four -- the candidate rows' 44px height and the analysis
 * toggle's (index.css), the tooltip behaviour of the three controls in
 * layout/ui.tsx, and the keyboard instructions NotesPanel hides from a device
 * that has no keys -- and the 44px touch-target assertions below were measuring
 * desktop-height rows because of it.
 *
 * `(hover: none)` was already true here, which is why the rules keyed on that
 * did get exercised; the pointer half is what was missing. Setting both from
 * one place is what keeps them from drifting apart again.
 */
export async function setViewport(cdp, { width, height, mobile }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: !!mobile,
    maxTouchPoints: mobile ? 5 : 1,
  });
}


export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

export async function waitForHttp(url, timeoutMs = 10_000) {
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

export function connectDevtools(webSocketDebuggerUrl) {
  const url = new URL(webSocketDebuggerUrl);
  const socket = net.createConnection(Number(url.port), url.hostname);
  let nextId = 0;
  let ready = false;
  let buffer = Buffer.alloc(0);
  let fragments = [];
  const pending = new Map();
  const listeners = new Set();

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
      return;
    }
    if (message.method) {
      for (const listener of listeners) listener(message);
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
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * `sessionId` addresses a target other than the one this socket is bound
     * to. A browser-level connection can then drive a page or a *service
     * worker* target, which matters because CDP domains are per target: an
     * offline emulation sent to the page leaves the worker's own fetches
     * online, so a service worker keeps loading from the network while the
     * page believes it is offline.
     */
    send(method, params = {}, sessionId) {
      const message = sessionId
        ? { id: ++nextId, method, params, sessionId }
        : { id: ++nextId, method, params };
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

/**
 * Waits for Chrome to open its devtools port and returns the page target's
 * WebSocket URL.
 *
 * The budget was 8s (40 polls, 200ms apart), which is ample for a warm laptop
 * and not always enough for a cold CI runner. Measured: the same commit failed
 * this step with "Timed out waiting for Chrome devtools target" and passed it
 * on re-run four minutes later, with Chrome reporting no exit code either time
 * -- it was still starting, not broken. A wait that is too short turns a slow
 * start into a red main, so the ceiling is generous; polling is every 200ms
 * regardless, so a fast start still returns immediately.
 *
 * The message names the port and the budget it actually spent, because the
 * previous one could not be told apart from Chrome failing to launch at all.
 */
export async function chromeTarget(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  for (;;) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page') ?? targets[0];
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
      lastError = new Error(`no page target yet (${targets.length} target(s))`);
    } catch (err) {
      lastError = err;
    }
    if (Date.now() >= deadline) break;
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for Chrome devtools target on port ${port} after ${timeoutMs}ms`
    + `${lastError ? `; last attempt: ${lastError.message}` : ''}`,
  );
}

// Page.navigate acknowledges the request before the new document commits.
// Match DOMContentLoaded to its loader ID so readiness probes cannot inspect
// the previous board. Subscribe before navigating: events can precede replies.
export async function navigate(cdp, url, timeoutMs = 15000, { acceptBeforeUnload = false } = {}) {
  const loaded = new Set();
  let navigation;
  let complete;
  let fail;
  let blockedByDialog;
  let handlingDialog;
  let timer;
  const ready = new Promise((resolve, reject) => {
    complete = resolve;
    fail = reject;
    timer = setTimeout(() => reject(new Error(`Navigation did not reach DOMContentLoaded: ${url}`)), timeoutMs);
  });
  // Observe a rejection even if Chrome has not yet acknowledged Page.navigate.
  // A deadline reports the failure; it never reloads the page or reruns input.
  ready.catch(() => {});
  const unsubscribe = cdp.on((message) => {
    if (message.method === 'Page.javascriptDialogOpening') {
      // A beforeunload confirmation pauses navigation and renderer evaluation.
      // Keep the page unless the caller explicitly allows discarding its fixture.
      // Other dialogs remain failures even when beforeunload is allowed.
      const type = message.params.type;
      const accept = type === 'beforeunload' && acceptBeforeUnload;
      if (!accept) blockedByDialog = new Error(`Navigation blocked by ${type} dialog`);
      handlingDialog = Promise.resolve().then(async () => {
        const response = await cdp.send('Page.handleJavaScriptDialog', { accept });
        if (response?.error || !response?.result) {
          throw new Error(`Could not handle ${type} dialog: ${JSON.stringify(response)}`);
        }
        if (!accept) throw blockedByDialog;
      });
      handlingDialog.catch(fail);
      return;
    }
    if (message.method !== 'Page.lifecycleEvent' || message.params?.name !== 'DOMContentLoaded') return;
    const key = `${message.params.frameId}:${message.params.loaderId}`;
    loaded.add(key);
    if (navigation && key === `${navigation.frameId}:${navigation.loaderId}`) complete();
  });
  try {
    // Setup can also stall when Chrome is waiting for a dialog. The same
    // deadline covers it, without retrying navigation or replaying page actions.
    await Promise.race([cdp.send('Page.enable'), ready]);
    await Promise.race([cdp.send('Page.setLifecycleEventsEnabled', { enabled: true }), ready]);
    const response = await Promise.race([cdp.send('Page.navigate', { url }), ready]);
    if (blockedByDialog) await Promise.race([handlingDialog, ready]);
    if (response?.error || response?.result?.errorText || !response?.result) {
      throw new Error(`Navigation failed for ${url}: ${JSON.stringify(response)}`);
    }
    navigation = response.result;
    if (navigation.isDownload) throw new Error(`Expected a page, received a download: ${url}`);
    // A fragment navigation stays in the current document and has no loader ID.
    if (!navigation.loaderId || loaded.has(`${navigation.frameId}:${navigation.loaderId}`)) complete();
    await ready;
  } finally {
    clearTimeout(timer);
    unsubscribe();
  }
}

export async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });

  // Expressions can click controls or write data. Replaying an interrupted
  // expression in a fresh, uninitialized document duplicates those actions
  // and can turn a navigation race into misleading missing-control failures.

  // A reply with no `result` means the call itself failed rather than the
  // expression -- almost always because Chrome died. Saying so beats
  // "Cannot read properties of undefined (reading 'exceptionDetails')",
  // which is what a CI runner reported before this existed.
  if (!response || !response.result) {
    throw new Error(
      `Runtime.evaluate failed; the expression was not retried. Reply: ${JSON.stringify(response)?.slice(0, 300)}`,
    );
  }
  if (response.result.exceptionDetails) {
    const details = response.result.exceptionDetails;
    throw new Error(details.exception?.description ?? details.text ?? 'Runtime evaluation failed');
  }
  return response.result.result.value;
}

// Serialized into browser probes that mount real components. Reuse the page's
// optimized React instance: a hardcoded .vite path can load a second runtime
// when the server has an isolated cache, breaking hooks in the mounted dialog.
export function loadedModuleUrl(pathSuffix, allowFirstImport = false) {
  const resource = performance.getEntriesByType('resource').findLast((entry) =>
    new URL(entry.name).pathname.endsWith(pathSuffix) && !(entry.responseStatus >= 400));
  if (!resource && allowFirstImport) {
    return new URL(pathSuffix.replace(/^\/+/, ''), document.baseURI).href;
  }
  if (!resource) throw new Error(`Loaded module was not recorded: ${pathSuffix}`);
  return resource.name;
}

/**
 * Polls a page expression until it returns something truthy.
 *
 * The library checks each carried their own copy of this loop, with the ceiling
 * and the message written out three times. This is that loop, once.
 *
 * The ceiling was raised from 15s to 45s on the theory that a cold CI runner
 * needed longer. **That theory was wrong**: the library-tags check then timed
 * out at 45s on the same viewport, so the budget was never what it was short
 * of. It is left at 45s because a wait that is going to succeed is unaffected
 * -- polling is 100ms either way -- but do not read the number as evidence
 * that anything was measured to need it.
 *
 * What is real, and still unexplained: `library-tags-check` fails
 * intermittently at **1280x800 only** (the desktop branch, and the first of
 * its three viewports) on CI, never locally, waiting for an imported SGF to
 * reach IndexedDB. The two narrow viewports pass in the same run, and a re-run
 * passes. Ruled out so far: the wait budget, and a race between the import and
 * first-run seeding of the bundled games -- every library operation goes
 * through `createSerialTaskQueue`, so those cannot interleave.
 *
 * The message names the budget it spent, which is what showed the first theory
 * to be wrong; keep it that way.
 */
export async function waitForExpression(
  cdp,
  expression,
  { label = 'Wait', timeoutMs = 45_000, intervalMs = 100, diagnose } = {},
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    if (Date.now() >= deadline) break;
    await sleep(intervalMs);
  }
  // A CI-only intermittent is worth one extra round trip: the run that fails
  // is usually the only chance to see the state that failed.
  let state = '';
  if (diagnose) {
    try {
      state = ` | state: ${JSON.stringify(await evaluate(cdp, diagnose))}`;
    } catch (error) {
      state = ` | diagnosis failed: ${error.message}`;
    }
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms: ${expression}${state}`);
}

