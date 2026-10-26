import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertZipPathLimits(cdp, appUrl, runDir, screenshotDir) {
  const folders = Array.from({ length: 180 }, (_, i) => ({
    id: `zip-folder-${i}`, name: '😀'.repeat(96), type: 'folder',
    parentId: i ? `zip-folder-${i - 1}` : null, createdAt: 1, updatedAt: 1,
  }));
  const items = [...folders, {
    id: 'zip-leaf', name: 'Leaf', type: 'file', parentId: 'zip-folder-179',
    createdAt: 1, updatedAt: 1, sgf: '(;SZ[9];B[dd])',
  }];
  const fixture = path.join(runDir, 'long-zip-paths.json');
  fs.writeFileSync(fixture, JSON.stringify({ app: 'web-katrain', version: 2, items }));
  const reports = [];
  const wait = (expression) => waitForExpression(cdp, expression, { label: 'Long ZIP path export' });
  for (const width of [1440, 390]) {
    const mobile = width === 390;
    const point = (selector, text) => wait(`(() => {
      const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.trim()===${JSON.stringify(text)}`:'true'});
      if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});
      const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    const click = async (selector, text, right = false) => {
      const p = await point(selector, text);
      if (mobile && !right) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await cdp.send('Input.dispatchMouseEvent', { type, ...p, button: right ? 'right' : 'left', clickCount: 1 });
        }
      }
    };
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');
    `});
    try {
      await setViewport(cdp, { width, height: mobile ? 844 : 900, mobile });
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier });
    }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if (mobile) await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const node = (await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId, selector: 'input[type=file][accept=".json,application/json"]',
    })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: node, files: [fixture] });
    await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');
    await click('[aria-labelledby="library-confirm-dialog-title"] button.danger');
    await wait(`document.querySelector('.notification-toast-message')?.title==='Restored 181 library items.'
      && document.querySelector('[data-library-row=folder]')?.getAttribute('data-library-row-name')===${JSON.stringify(folders[0].name)}`);
    await evaluate(cdp,`(()=>{
      window.zipExportOriginalClick=HTMLAnchorElement.prototype.click;window.zipExportOriginalUrl=URL.createObjectURL;
      window.zipExportDownloads=[];window.zipExportBlobs=new Map();
      URL.createObjectURL=function(blob){const url=zipExportOriginalUrl.call(URL,blob);zipExportBlobs.set(url,blob);return url};
      HTMLAnchorElement.prototype.click=function(){zipExportDownloads.push({name:this.download,url:this.href})};return true;
    })()`);
    try {
      const rejected = async () => {
        await wait("document.querySelector('.notification-toast-message')?.title.includes('Some paths are too long for ZIP.')");
        assert.equal(await evaluate(cdp, 'zipExportDownloads.length'), 0, 'No corrupt ZIP may be offered for download');
        assert.ok(await evaluate(cdp,"document.querySelector('.notification-toast-message').title.includes('JSON library backup')"));
      };
      await click('[aria-label="More library actions"]');
      await click('[role=menuitem]', 'Export library as ZIP');
      await rejected();
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `zip-path-limit-${width}.png`), Buffer.from(screenshot.result.data, 'base64'));
      await click('[aria-label="Dismiss notification"]');
      if (mobile) await click('[data-library-row=folder] button[aria-label^="More actions"]');
      else await click('[data-library-row=folder]',undefined,true);
      await click('[role=menuitem]', 'Export folder as ZIP');
      await rejected();
      await click('[aria-label="Dismiss notification"]');
      await click('[aria-label="Select all"]');
      await click('[aria-label="Export selected as ZIP"]');
      await rejected();
      await click('[aria-label="Dismiss notification"]');
      await click('[aria-label="More library actions"]');
      await click('[role=menuitem]', 'Download backup');
      await wait('zipExportDownloads.length===1');
      const backup = await evaluate(cdp, `(async () => {
        const download=zipExportDownloads[0];const parsed=JSON.parse(await zipExportBlobs.get(download.url).text());
        return{name:download.name,folders:parsed.items.filter(item=>item.type==='folder').length,files:parsed.items.filter(item=>item.type==='file').map(item=>({parentId:item.parentId,sgf:item.sgf}))};
      })()`);
      assert.ok(backup.name.endsWith('.json'));
      assert.equal(backup.folders, 180);
      assert.deepEqual(backup.files, [{ parentId: 'zip-folder-179', sgf: '(;SZ[9];B[dd])' }]);
      reports.push({
        width, libraryFolderSelectionExportsBlocked: true, corruptDownloads: 0,
        jsonFolders: backup.folders, jsonFiles: backup.files.length,
      });
    } finally {
      await evaluate(cdp,'(()=>{HTMLAnchorElement.prototype.click=zipExportOriginalClick;URL.createObjectURL=zipExportOriginalUrl;return true})()');
    }
  }
  fs.writeFileSync(path.join(screenshotDir, 'zip-path-limits.json'), JSON.stringify(reports, null, 2));
  console.log('ZIP path limits: desktop/phone library, folder, and selection exports refuse corrupt archives; JSON backups preserve all folders and SGF.');
}
