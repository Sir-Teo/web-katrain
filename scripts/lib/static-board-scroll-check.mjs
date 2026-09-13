import { evaluate, loadedModuleUrl, setViewport, sleep } from './browser.mjs';

// Send a real touch gesture: programmatically setting scrollTop would pass even
// when touch-action:none makes the preview impossible to scroll with a finger.
export async function assertStaticBoardScroll(cdp) {
  for (const viewport of [
    { width: 320, height: 568, mobile: true },
    { width: 568, height: 320, mobile: true },
  ]) {
    await setViewport(cdp, viewport);
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
        }));
        for (let i = 0; i < 100 && !host.querySelector('svg'); i++) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!host.querySelector('svg')) throw new Error('Preview board did not mount');
        const rect = host.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.bottom - 30 };
      })()`);
      await sleep(100);
      await cdp.send('Input.synthesizeScrollGesture', {
        ...point, yDistance: -100, gestureSourceType: 'touch', speed: 400,
      });
      await sleep(200);
      const scrollTop = await evaluate(cdp,
        `document.querySelector('[data-static-board-scroll-check]').scrollTop`);
      if (scrollTop < 30) throw new Error(`Preview blocks touch scrolling at ${viewport.width}x${viewport.height}: ${scrollTop}px`);
    } finally {
      await evaluate(cdp, `(() => {
        window.__cleanupStaticBoardScrollCheck?.();
        delete window.__cleanupStaticBoardScrollCheck;
      })()`);
    }
  }
}
