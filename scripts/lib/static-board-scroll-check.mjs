import { evaluate, loadedModuleUrl, setViewport, sleep } from './browser.mjs';

// Send a real touch gesture: programmatically setting scrollTop would pass even
// when touch-action:none makes the preview impossible to scroll with a finger.
export async function assertStaticBoardScroll(cdp) {
  for (const viewport of [
    { width: 320, height: 568, mobile: true },
    { width: 568, height: 320, mobile: true },
  ]) {
    await setViewport(cdp, viewport);
    for (const interactive of [true, false]) {
      try {
        const point = await evaluate(cdp, `(async () => {
          const moduleUrl = ${loadedModuleUrl.toString()};
          const { default: React } = await import(moduleUrl('/deps/react.js'));
          const { default: ReactDOM } = await import(moduleUrl('/deps/react-dom_client.js'));
          const { StaticBoard } = await import(moduleUrl('/src/components/StaticBoard.tsx', true));
          const host = document.createElement('div');
          host.dataset.staticBoardScrollCheck = 'true';
          host.style.cssText = 'position:fixed;z-index:9999;top:20px;left:20px;width:280px;height:200px;overflow-y:auto;background:white';
          document.body.append(host);
          const root = ReactDOM.createRoot(host);
          window.__cleanupStaticBoardScrollCheck = () => { root.unmount(); host.remove(); };
          root.render(React.createElement(StaticBoard, {
            board: Array.from({ length: 19 }, () => Array(19).fill(null)),
            onPointClick: ${interactive ? '() => {}' : 'undefined'},
          }));
          for (let i = 0; i < 100 && !host.querySelector('svg'); i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          if (!host.querySelector('svg')) throw new Error('Preview board did not mount');
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const rect = host.getBoundingClientRect();
          const point = { x: rect.left + rect.width / 2, y: rect.bottom - 30 };
          if (host.scrollHeight - host.clientHeight < 30) throw new Error('Preview fixture is not scrollable');
          if (!host.querySelector('svg').contains(document.elementFromPoint(point.x, point.y))) {
            throw new Error('Preview touch target is covered');
          }
          return point;
        })()`);
        await sleep(100);
        // Dispatch the complete finger sequence; the synthetic scroll command
        // reported completion without moving this fixture on Linux Chrome.
        const touch = async (type, touchPoints) => {
          const reply = await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
          if (reply.error) throw new Error(`Preview touch input failed: ${JSON.stringify(reply.error)}`);
        };
        await touch('touchStart', [{ ...point, id: 1 }]);
        for (let step = 1; step <= 10; step++) {
          await touch('touchMove', [{ ...point, y: point.y - step * 10, id: 1 }]);
          await sleep(25);
        }
        await touch('touchEnd', []);
        await sleep(200);
        const result = await evaluate(cdp, `(() => {
          const host = document.querySelector('[data-static-board-scroll-check]');
          return { scrollTop: host.scrollTop, scrollHeight: host.scrollHeight,
            clientHeight: host.clientHeight, touchAction: getComputedStyle(host.querySelector('svg')).touchAction };
        })()`);
        if (interactive ? result.scrollTop > 1 : result.scrollTop < 30) {
          throw new Error(`${interactive ? 'Interactive' : 'Read-only'} preview touch scrolling at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
        }
      } finally {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await evaluate(cdp, `(() => {
          window.__cleanupStaticBoardScrollCheck?.();
          delete window.__cleanupStaticBoardScrollCheck;
        })()`);
      }
    }
    console.log(`Preview touch scrolling at ${viewport.width}x${viewport.height}: read-only scroll and interactive control passed.`);
  }
}
