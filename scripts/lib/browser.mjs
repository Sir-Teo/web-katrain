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

export async function chromeTarget(port) {
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

/**
 * `Inspected target navigated or closed` is CDP telling us the execution
 * context was torn down underneath the call -- a navigation that had not
 * finished settling when the next evaluate went out. It is transient by
 * definition: the page is on its way to a new context, not broken.
 *
 * This never fires on a developer machine, where navigation completes long
 * before the next poll. It failed a CI run at evaluation 56 of a viewport
 * sweep that does eight navigations. Retrying briefly is the fix; failing on
 * it is not, and neither is ignoring a reply with no result, which is what a
 * dead browser looks like and must still be fatal.
 */
const TRANSIENT_CDP_MESSAGE = 'Inspected target navigated or closed';

export async function evaluate(cdp, expression, attempt = 0) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });

  if (response?.error?.message?.includes(TRANSIENT_CDP_MESSAGE) && attempt < 10) {
    await sleep(250);
    return evaluate(cdp, expression, attempt + 1);
  }

  // A reply with no `result` means the call itself failed rather than the
  // expression -- almost always because Chrome died. Saying so beats
  // "Cannot read properties of undefined (reading 'exceptionDetails')",
  // which is what a CI runner reported before this existed.
  if (!response || !response.result) {
    throw new Error(
      `Runtime.evaluate returned no result (Chrome likely exited). Reply: ${JSON.stringify(response)?.slice(0, 300)}`,
    );
  }
  if (response.result.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text ?? 'Runtime evaluation failed');
  }
  return response.result.result.value;
}
