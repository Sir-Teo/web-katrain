import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { assertScoreQuizRequests } from './lib/score-quiz-check.mjs';
import { assertStaticBoardScroll } from './lib/static-board-scroll-check.mjs';
// The CDP client, the Chrome lookup and evaluate() live in lib/browser.mjs so
// check-responsiveness.mjs drives the same browser rather than carrying a
// second copy of all of it.
import {
  chromePath,
  chromeTarget,
  connectDevtools,
  evaluate,
  freePort,
  navigate,
  setViewport,
  sleep,
} from './lib/browser.mjs';

/**
 * The desktop-vs-mobile bounds, read from the source that defines them rather
 * than copied. They were duplicated here as literals, and a duplicate of a
 * breakpoint is a breakpoint that will eventually disagree with itself — the
 * comment below already records one round of that, where checking width alone
 * aimed desktop assertions at the mobile shell.
 */
function readDesktopLayoutBounds() {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, '../src/utils/layoutBreakpoints.ts'),
    'utf8',
  );
  const width = /DESKTOP_LAYOUT_MIN_WIDTH\s*=\s*(\d+)/.exec(source);
  const height = /DESKTOP_LAYOUT_MIN_HEIGHT\s*=\s*(\d+)/.exec(source);
  if (!width || !height) {
    throw new Error(
      'Could not read DESKTOP_LAYOUT_MIN_WIDTH/HEIGHT from src/utils/layoutBreakpoints.ts. '
      + 'If they were renamed, update this reader rather than hardcoding the numbers again.',
    );
  }
  return { minWidth: Number(width[1]), minHeight: Number(height[1]) };
}

const { minWidth: DESKTOP_MIN_WIDTH, minHeight: DESKTOP_MIN_HEIGHT } = readDesktopLayoutBounds();

const isDesktopViewport = (viewport) =>
  viewport.width >= DESKTOP_MIN_WIDTH && viewport.height >= DESKTOP_MIN_HEIGHT;

const VIEWPORTS = [
  { width: 1280, height: 800, mobile: false },
  { width: 1024, height: 768, mobile: false },
  { width: 1024, height: 500, mobile: false },
  { width: 768, height: 1024, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 360, height: 800, mobile: true },
  // 320px is the width WCAG 2.2 SC 1.4.10 asks content to reflow into, and
  // index.css reasons about it in eight places -- but the sweep stopped at
  // 360, so none of that reasoning had ever been measured.
  { width: 320, height: 568, mobile: true },
  { width: 844, height: 390, mobile: true },
  { width: 568, height: 320, mobile: true },
  // Wide but short: still the mobile shell, and previously uncovered.
  { width: 1280, height: 460, mobile: true },
  // Wide desktop with both panels open: the board column lands near 722px,
  // where the nav rail used to wrap onto a second row.
  { width: 1440, height: 900, mobile: false },
];

/**
 * Text the reader cannot finish and cannot recover.
 *
 * Clipped by its own box, with no title to show it on hover. The library's game
 * names read like this -- 139px of box for a name that lays out at 487, so
 * two-thirds of a tournament title was off the end. Every row carried the full
 * name in its aria-label, which is why this looked covered: assistive tech was
 * fine and the mouse the panel is built for had nothing.
 */
const TRUNCATION_AUDIT = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    if (String(el.className || '').includes('sr-only')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // A scroller is not clipping anything: the reader can reach it.
    const overflow = style.overflow + style.overflowX + style.overflowY;
    if (overflow.includes('auto') || overflow.includes('scroll')) continue;
    const lost = el.scrollWidth - el.clientWidth;
    if (lost <= 2) continue;
    // A title anywhere up the tree shows on hover over this text, and an
    // aria-label on the element itself names this text. An aria-label on an
    // ANCESTOR does neither for a mouse -- it is the row's name, not this
    // element's, and it is exactly what made the library's clipped game names
    // look covered while a sighted reader had no way to finish them.
    if (el.getAttribute('title') || el.getAttribute('aria-label')) continue;
    if (el.closest('[title]')) continue;
    out.push(text.slice(0, 36) + ' (needs ' + lost + 'px more than ' + el.clientWidth + 'px)');
  }
  return out.slice(0, 6);
})()`;

/**
 * A form control nobody can name.
 *
 * `visibleLabelInName` checks that a button's accessible name contains the
 * words printed on it; nothing checked that an input has a name at all. A
 * `<select>` with no label is announced as "combobox" and nothing else, and the
 * only way to know what it sets is to see the text beside it.
 *
 * A wrapping `<label>` counts, which is how most of this app's controls are
 * labelled and why a source grep for aria-label reports twelve false hits.
 */
const UNNAMED_CONTROL_AUDIT = `(() => {
  const named = (el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
    if (el.closest('label')) return true;
    if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return true;
    if (el.getAttribute('title')) return true;
    return false;
  };
  const out = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden') continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (named(el)) continue;
    out.push(el.tagName.toLowerCase() + (type ? '[' + type + ']' : '') + ' in ' +
      (el.closest('[data-layout-panel],[role="dialog"],[data-dashboard-popover]')?.getAttribute('data-layout-panel')
        || el.closest('[role="dialog"]')?.getAttribute('aria-label') || 'the shell'));
  }
  return out.slice(0, 6);
})()`;

const screenshotDir = process.env.VIEWPORT_SCREENSHOT_DIR || '/tmp/web-katrain-viewport-check';

/**
 * The board rendering is not the same thing as the app being usable.
 *
 * At mobile widths this app opens over a full-screen home overlay, and the
 * sweep dismisses it by clicking "Open board" and then waiting a flat 300ms.
 * That is a guess about how long a render takes, and it is wrong on a loaded
 * machine: the overlay is still up when the checks start, so the board
 * measures as missing, mobile triggers are unreachable, and every dialog
 * "did not open" at once. It failed exactly that way on a CI runner at
 * 768x1024 -- the first mobile viewport -- and reproduces locally under 6x CPU
 * throttling.
 *
 * Waiting for the overlay to actually be gone, and for the board to have a
 * non-zero box, says what was meant and costs nothing when the machine is fast.
 */
async function waitForShellReady(cdp, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  for (;;) {
    state = await evaluate(cdp, `(() => {
      const home = document.querySelector('[aria-labelledby="mobile-home-title"]');
      const board = document.querySelector('[data-board-snapshot="true"]');
      const rect = board ? board.getBoundingClientRect() : null;
      return {
        homeOverlayOpen: Boolean(home),
        boardVisible: Boolean(rect) && rect.width > 0 && rect.height > 0,
      };
    })()`);
    if (!state.homeOverlayOpen && state.boardVisible) {
      // The condition replaces a flat 300ms wait, but not the settle it also
      // provided. On desktop there is no overlay, so the condition is true
      // immediately and returning here would be *faster* than the code this
      // replaced -- which promptly moved the failure from the mobile viewport
      // to the desktop one. Keep both: wait for the shell, then let it settle.
      await sleep(300);
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`App shell not ready after ${timeoutMs}ms: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }
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
  const boardBox = result.defaultBoard;
  if (!boardBox || boardBox.width < 100 || boardBox.height < 100) {
    failures.push(
      `board collapsed to ${Math.round(boardBox?.width ?? 0)}x${Math.round(boardBox?.height ?? 0)}px`
    );
  }
  if (result.boardCoverageFailures?.length > 0) {
    failures.push(...result.boardCoverageFailures);
  }
  if (result.moveTreeEmptyStateFailures?.length > 0) {
    failures.push(...result.moveTreeEmptyStateFailures);
  }
  if (result.notificationMessage === 'Edit mode off.' && result.mobileNotificationTooWide) {
    failures.push(`short mobile notification is too wide (${Math.round(result.notificationToast?.width ?? 0)}px)`);
  }
  if (result.desktop && result.notificationOverlapsSidePanel) {
    failures.push('desktop notification overlaps the analysis sidebar');
  }
  // An error toast on the desktop dashboard is placed below the game strip on
  // purpose (see the note beside .notification-toast-region--desktop-dashboard
  // in index.css): the board column has no gap wide enough to hold it beside
  // the board — 192px between the board's right edge and the sidebar at 1280 —
  // so clipping the board's top edge is the chosen trade against covering the
  // save badge and the clock. Info and success toasts sit in the header's quiet
  // middle and must still clear the board completely, and the game-strip check
  // below is what actually holds the error toast in place.
  if (result.desktop && result.notificationOverlapsBoard && result.notificationType !== 'error') {
    failures.push('desktop notification overlaps the board');
  }
  if (result.desktop && result.notificationOverlapsGameStripControl) {
    failures.push('desktop notification overlaps game status controls');
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
  if (result.duplicateIds?.length > 0) {
    // getElementById and label/aria targeting resolve to the first match, so a
    // duplicate id silently points half the references at the wrong element.
    failures.push(`duplicate element ids: ${result.duplicateIds.slice(0, 6).join(', ')}`);
  }
  if (result.pageErrors?.length > 0) {
    failures.push(`page errors: ${result.pageErrors.slice(0, 6).join(' | ')}`);
  }
  if (result.deadAriaRefs?.length > 0) {
    // aria-controls/-labelledby naming an element that is not in the DOM is
    // silent: nothing renders differently and only assistive tech loses the
    // relationship. Conditionally rendered panels are the usual cause.
    failures.push(`dead ARIA references: ${result.deadAriaRefs.map((r) => `${r.attr}="${r.id}" on ${r.on}`).join(', ')}`);
  }
  // A library that rendered no names makes its audit pass on nothing.
  if (result.navbarWithLibrary && !(result.navbarWithLibrary.libraryNames > 0)) {
    failures.push('library docked but rendered no names to check');
  }
  if (result.unnamedControls?.length > 0) {
    failures.push(`form controls with no accessible name: ${result.unnamedControls.join(' | ')}`);
  }
  const clipped = [...(result.truncationFailures ?? []), ...(result.navbarWithLibrary?.truncation ?? [])];
  if (clipped.length > 0) {
    failures.push(`text clipped with no title: ${clipped.join(' | ')}`);
  }
  if (result.documentOverflow > 1) failures.push(`document overflows by ${result.documentOverflow}px`);
  // The check above runs after the QA interactions have opened and closed
  // things. This one is the pristine first load, which is what a reader
  // actually sees before touching anything; it was measured but discarded.
  if (result.defaultDocumentOverflow > 1) {
    failures.push(`first load overflows horizontally by ${result.defaultDocumentOverflow}px`);
  }
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
    if (result.dashboardHeaderSmallTargets.length > 0) {
      const summary = result.dashboardHeaderSmallTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.dashboardHeaderSmallTargets.length} desktop header target(s) below 32px: ${summary}`);
    }
    if (result.dashboardBoardActionSmallTargets.length > 0) {
      const summary = result.dashboardBoardActionSmallTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.dashboardBoardActionSmallTargets.length} desktop board action target(s) below 32px: ${summary}`);
    }
    // WCAG 2.2 SC 2.5.8 (AA) floors every target at 24x24 CSS px. The header and
    // board-action checks above hold their own zones to this app's denser 32px,
    // but nothing covered the side rail or the game strip, where a 23px "Learn
    // more" and a 20px clock button had drifted under the floor. The edge-toggle
    // slivers pass on their short side at exactly 24px, so they need no carve-out.
    if (result.dashboardSubMinimumTargets.length > 0) {
      const summary = result.dashboardSubMinimumTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.dashboardSubMinimumTargets.length} desktop target(s) below the 24px WCAG minimum: ${summary}`);
    }
    // Same floor, for every dialog the smoke flows open. This lives in the
    // desktop branch on purpose: the 44px audit above it is the mobile
    // counterpart, and a copy left in that branch would never run.
    if (result.modalSubMinimumTargets.length > 0) {
      const summary = result.modalSubMinimumTargets
        .slice(0, 8)
        .map((target) => `${target.modal}: ${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.modalSubMinimumTargets.length} modal target(s) below the 24px WCAG minimum: ${summary}`);
    }
    if (result.dashboardGameStripWrapped) {
      failures.push('desktop game status strip wrapped onto multiple rows');
    }
    if (result.dashboardNavbarWrapped) {
      failures.push('desktop command bar wraps primary play actions onto a second row');
    }
    // Same rail, with the library docked. The 590px floor is deliberate: the
    // wide layout starts docking at a 1200px viewport, which leaves a 540px
    // column, and closing that last 50px would mean taking controls off the
    // rail rather than tightening it. See the max-width: 700px tier in
    // dashboard.css.
    // The one surviving intent of the old dual-panel block: the board has to
    // stay playable while both panels hold their columns.
    if (result.navbarWithLibrary && result.navbarWithLibrary.boardWidth != null && result.navbarWithLibrary.boardWidth < 300) {
      failures.push(`board too small with the library docked (${Math.round(result.navbarWithLibrary.boardWidth)}px)`);
    }
    if (result.navbarWithLibrary?.stillOpen) {
      failures.push('library stayed docked after the nav bar probe closed it');
    }
    if (result.navbarWithLibrary?.wrapped && result.navbarWithLibrary.columnWidth > 590) {
      failures.push(
        `desktop command bar wraps with the library docked (${Math.round(result.navbarWithLibrary.columnWidth)}px column, ${Math.round(result.navbarWithLibrary.navbarHeight ?? 0)}px tall)`
      );
    }
    if (result.dashboardCommandbarHeight > 40) {
      failures.push(`desktop metric rail is too tall (${Math.round(result.dashboardCommandbarHeight)}px)`);
    }
    if (result.dashboardMetricClipping.length > 0) {
      failures.push(`desktop metrics clip visible content: ${result.dashboardMetricClipping.join(', ')}`);
    }
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
    if (result.noteEditorLifecycleFailures.length > 0) {
      failures.push(`mobile note editor lifecycle failures: ${result.noteEditorLifecycleFailures.join(', ')}`);
    }
    if (result.mobileTabKeyboardFailures.length > 0) {
      failures.push(`mobile tab bar keyboard failures: ${result.mobileTabKeyboardFailures.join(', ')}`);
    }
    if (result.mobileTabPanelFailures.length > 0) {
      failures.push(`mobile tab/panel wiring failures: ${result.mobileTabPanelFailures.join(', ')}`);
    }
    if (!result.boardTouchAction.includes('pinch-zoom') && result.boardTouchAction !== 'manipulation') {
      failures.push(`play-mode board touch-action does not allow pinch zoom (${result.boardTouchAction})`);
    }
    if (result.editModeBoardTouchAction !== 'none') {
      failures.push(`edit-mode board touch-action should be none (${result.editModeBoardTouchAction})`);
    }
    if (result.innerHeight > result.innerWidth) {
      if (result.defaultBoardContainerAlign !== 'center') {
        failures.push(`portrait board wrapper should center the board (${result.defaultBoardContainerAlign || 'missing'})`);
      }
      if (
        result.defaultBoardCanvasTopInset == null ||
        result.defaultBoardCanvasBottomInset == null ||
        Math.abs(result.defaultBoardCanvasTopInset - result.defaultBoardCanvasBottomInset) > 2
      ) {
        failures.push(
          `portrait board is not vertically balanced (${Math.round(result.defaultBoardCanvasTopInset ?? -1)}px top, ${Math.round(result.defaultBoardCanvasBottomInset ?? -1)}px bottom)`
        );
      }
      if (result.defaultIdleAnalysisSlotHeight > 1) {
        failures.push(`idle analysis slot reserves ${Math.round(result.defaultIdleAnalysisSlotHeight)}px above the mobile board`);
      }
    }
    if (result.smallTouchTargets.length > 0) {
      const summary = result.smallTouchTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.smallTouchTargets.length} mobile touch target(s) below 44px: ${summary}`);
    }
    if (result.mobileBottomControlOverlaps.length > 0) {
      const summary = result.mobileBottomControlOverlaps
        .slice(0, 6)
        .map((overlap) => `${overlap.first} / ${overlap.second} (${Math.round(overlap.width)}px)`)
        .join(', ');
      failures.push(`${result.mobileBottomControlOverlaps.length} overlapping mobile bottom-control pair(s): ${summary}`);
    }
    if (!result.mobileTurnIndicator || result.mobileTurnIndicator.width < 13 || result.mobileTurnIndicator.height < 13) {
      failures.push(`mobile turn indicator is too small (${Math.round(result.mobileTurnIndicator?.width ?? 0)}x${Math.round(result.mobileTurnIndicator?.height ?? 0)}px)`);
    }
    if (result.mobileTurnIndicator?.isBlack && result.mobileTurnIndicator.borderWidth < 1) {
      failures.push('black mobile turn indicator has no contrasting outline');
    }
    if (!result.postMoveMobileStatus.turnVisible) {
      failures.push('mobile turn indicator disappears after a move');
    }
    if (result.innerWidth <= 380 && result.postMoveMobileStatus.saveVisible) {
      failures.push('secondary mobile save badge remains visible on the narrowest phone layout');
    }
    if (result.innerWidth > 380 && !result.postMoveMobileStatus.saveVisible) {
      failures.push('mobile save feedback is missing where it fits beside the turn indicator');
    }
    if (result.postMoveMobileStatus.overlaps.length > 0) {
      const summary = result.postMoveMobileStatus.overlaps
        .slice(0, 6)
        .map((overlap) => `${overlap.first} / ${overlap.second} (${Math.round(overlap.width)}px)`)
        .join(', ');
      failures.push(`${result.postMoveMobileStatus.overlaps.length} post-move mobile control overlap(s): ${summary}`);
    }
    if (result.innerWidth <= 640 && result.innerHeight > 520 && !result.analysisPrimaryMetricsFullyVisible) {
      failures.push('primary analysis metrics are clipped in the phone summary rail');
    }
    if (result.bottomMoreSheetFailures.length > 0) {
      failures.push(`mobile More Controls sheet failures: ${result.bottomMoreSheetFailures.join(', ')}`);
    }
    if (result.bottomMoreSheetSmallTouchTargets.length > 0) {
      const summary = result.bottomMoreSheetSmallTouchTargets
        .slice(0, 6)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.bottomMoreSheetSmallTouchTargets.length} More Controls touch target(s) below 44px: ${summary}`);
    }
    if (result.editModeSmallTouchTargets.length > 0) {
      const summary = result.editModeSmallTouchTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.editModeSmallTouchTargets.length} edit-mode touch target(s) below 44px: ${summary}`);
    }
    if (result.engineStatusClipped) {
      failures.push(`engine status text is clipped: ${result.engineStatusClipped}`);
    }
    if (result.treeSmallTouchTargets.length > 0) {
      const summary = result.treeSmallTouchTargets
        .slice(0, 8)
        .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
        .join(', ');
      failures.push(`${result.treeSmallTouchTargets.length} tree-tab touch target(s) below 44px: ${summary}`);
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
  /**
   * A budget, not a zero.
   *
   * Every box can be the right size and in the right place by the time the
   * measurements above run, and the page can still have thrown its content
   * around getting there -- which is what someone reaching for a control
   * actually experiences. Measured in this window, with the shell up and
   * nothing clicked, the app sits at 0.0000 on every viewport here; 0.05 is
   * well inside the 0.1 that counts as good and leaves room for a browser that
   * rounds differently, while still catching anything that moves a panel.
   *
   * `hadRecentInput` entries are dropped by the observer, so a shift the app
   * makes in answer to a click is not counted -- only what moves on its own.
   */
  if (result.layoutShift && result.layoutShift.total > 0.05) {
    failures.push(
      `layout shifts after the shell settled: ${result.layoutShift.total.toFixed(4)}`
      + ` (${result.layoutShift.worst.join('; ')})`
    );
  }
  // Text contrast is a property of the theme and the type scale, not of the
  // shell, and auditContrast() already runs at every viewport — but the report
  // sat in the mobile branch, so desktop text had never been checked.
  if (result.contrastFailures?.length > 0) {
    failures.push(`${result.contrastFailures.length} text contrast failure(s): ${result.contrastFailures.slice(0, 6).join('; ')}`);
  }
  if (result.modalContrastFailures?.length > 0) {
    failures.push(
      `${result.modalContrastFailures.length} dialog text contrast failure(s): `
      + result.modalContrastFailures.slice(0, 6).join('; ')
    );
  }
  if (result.modalSpillFailures?.length > 0) {
    failures.push(
      `${result.modalSpillFailures.length} dialog element(s) painting off-screen: `
      + result.modalSpillFailures.slice(0, 6).join('; ')
    );
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
  if (result.desktopEditPanelOverlaps.length > 0) {
    failures.push(`desktop edit panel covers the game strip: ${result.desktopEditPanelOverlaps.join(', ')}`);
  }
  if (!result.scorePanelReachable) failures.push('score panel not reachable');
  if (result.scorePanelFailures.length > 0) {
    failures.push(`score panel failures: ${result.scorePanelFailures.join(', ')}`);
  }
  if (result.scorePanelSubMinimumTargets.length > 0) {
    const summary = result.scorePanelSubMinimumTargets
      .slice(0, 8)
      .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
      .join(', ');
    failures.push(`${result.scorePanelSubMinimumTargets.length} score panel target(s) below the 24px WCAG minimum: ${summary}`);
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
  if (result.pwaBannerSubMinimumTargets?.length > 0) {
    const summary = result.pwaBannerSubMinimumTargets
      .slice(0, 8)
      .map((target) => `${target.label} ${Math.round(target.width)}x${Math.round(target.height)}`)
      .join(', ');
    failures.push(`${result.pwaBannerSubMinimumTargets.length} PWA banner target(s) below the 24px WCAG minimum: ${summary}`);
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

/**
 * The shell variant decides roughly fifty class usages across the app. A
 * custom variant Tailwind cannot read as a media query still compiles without
 * complaint and simply emits no rule at all, so every one of those classes
 * silently stops applying while the source keeps looking correct.
 *
 * Check the rule by its effect on both sides of the threshold. Asserting the
 * text of the declaration cannot catch this — that is exactly what the test
 * guarding it used to do, while the variant sat inert.
 */
/**
 * The truncation audit only ever saw short text.
 *
 * It runs on whatever game is loaded, and that is a fresh board whose players
 * are "Black" and "White" -- so a clipped-name bug could not fail it. Loading a
 * record whose players and event are as long as real ones get, and auditing
 * that, is what the audit was written to do. It found the two player names in
 * the game info panel clipping with no title, beside a panel title that had one.
 *
 * Desktop only: every surface this exercises is in the dashboard sidebar, and
 * the phone reaches the same component through RightPanel.
 */
/**
 * The PWA cards, in the states no viewport run ever enters.
 *
 * The per-viewport sweep measures a board with no card up, because
 * `beforeinstallprompt` never fires in headless Chrome and the two service
 * worker notices are dispatched by code that does not run here. So the one
 * overlay that floats over the board column was the one thing never audited
 * over it -- and it had already put the install card on 14 intersections once
 * (1fcf5f5).
 *
 * All three are reachable by hand: the install prompt is a plain event with a
 * `prompt` method, and the other two are the app's own custom events. Firing
 * each and re-running the coverage audit found the update card covering 171
 * intersections at 568x320 and shoving the board up under the top bar.
 */
/**
 * The recovery prompt, the other state no viewport run ever enters.
 *
 * Every viewport pass deletes the auto-save key before it measures anything,
 * and deliberately: a debounced save from the previous pass landing mid-run
 * opens this modal over the whole app and reads as a flood of unrelated
 * failures. The cost is that the modal a returning user meets first is the one
 * dialog the sweep never sees -- and it is not in the trigger list above
 * either, because no button opens it.
 *
 * Seeding the key and navigating puts it on screen. It is checked for the same
 * thing every other dialog is: no button off-screen with nothing able to scroll
 * it back.
 */
async function assertAutoSaveRecoveryFits(cdp, appUrl) {
  const seeded = JSON.stringify({
    version: 1,
    savedAt: Date.now() - 90_000,
    sgf: '(;GM[1]FF[4]SZ[19]KM[6.5];B[pd];W[dp];B[pp];W[dd];B[fq])',
  });
  const failures = [];

  for (const [width, height] of [[568, 320], [320, 480], [740, 360], [390, 844], [1440, 900]]) {
    await setViewport(cdp, { width, height, mobile: width < 768 });
    await evaluate(cdp, `(() => {
      localStorage.setItem('web-katrain:auto_saved_game:v1', ${JSON.stringify(seeded)});
      return 1;
    })()`);
    await navigate(cdp, appUrl);
    await waitForBoard(cdp);
    await sleep(900);

    const stranded = await evaluate(cdp, STRANDED_BUTTONS_PROBE);
    if (stranded === 'NO_MODAL') {
      // Without this the check is vacuous: it would pass on every viewport by
      // never finding the dialog it is supposed to be measuring.
      failures.push(`${width}x${height}: the recovery prompt did not open, so nothing was measured`);
    } else if (stranded !== '[]') {
      failures.push(`${width}x${height} strands ${stranded}`);
    } else {
      // The other way to pass on nothing: an empty list also describes a dialog
      // with no buttons in it. This one offers Restore and Discard.
      const choices = await evaluate(cdp, `(() => {
        const d = document.querySelector('[role="dialog"][aria-modal="true"]');
        return d ? [...d.querySelectorAll('button')].filter((b) => b.getClientRects().length).length : 0;
      })()`);
      if (choices < 2) {
        failures.push(`${width}x${height}: the recovery prompt showed ${choices} button(s), so "nothing stranded" means nothing`);
      }
    }

    await evaluate(cdp, `(() => {
      const d = document.querySelector('[role="dialog"][aria-modal="true"]');
      const button = d && [...d.querySelectorAll('button')].find((b) =>
        /discard/i.test((b.textContent || '') + (b.getAttribute('aria-label') || '')));
      if (button) button.click();
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      return 1;
    })()`);
    await sleep(300);
  }

  if (failures.length > 0) {
    throw new Error(`auto-save recovery prompt:\n      - ${failures.join('\n      - ')}`);
  }
}

async function assertPwaCardsClearTheBoard(cdp, appUrl) {
  const COVERAGE = `(() => {
    const boardEl = document.querySelector('[data-board-snapshot="true"]');
    if (!boardEl) return ['board missing'];
    const size = Number(boardEl.getAttribute('data-board-size'));
    const cellSize = Number(boardEl.getAttribute('data-board-cell-size'));
    const originX = Number(boardEl.getAttribute('data-board-origin-x'));
    const originY = Number(boardEl.getAttribute('data-board-origin-y'));
    const r = boardEl.getBoundingClientRect();
    const blockers = new Map();
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const px = r.left + originX + x * cellSize;
        const py = r.top + originY + y * cellSize;
        if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) continue;
        const hit = document.elementFromPoint(px, py);
        if (!hit || hit === boardEl || boardEl.contains(hit) || hit.contains(boardEl)) continue;
        const label = (hit.getAttribute('aria-label') || hit.getAttribute('title') ||
          (hit.className || '').toString() || hit.tagName).toString().trim().slice(0, 36);
        blockers.set(label, (blockers.get(label) || 0) + 1);
      }
    }
    return [...blockers].map(([label, n]) => n + ' x ' + label);
  })()`;

  const BANNERS = ['install', 'offline-ready', 'update-ready'];
  const failures = [];

  // Short screens are where the board runs out of room to give; the tall ones
  // are here so a rule that hides too much fails too.
  for (const viewport of [
    { width: 568, height: 320, mobile: true },
    { width: 740, height: 360, mobile: true },
    { width: 844, height: 390, mobile: true },
    { width: 1280, height: 460, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 1440, height: 900, mobile: false },
  ]) {
    await setViewport(cdp, viewport);
    const label = `${viewport.width}x${viewport.height}`;
    for (const banner of BANNERS) {
      // A fresh load per card: `shouldReplacePwaBanner` refuses to let anything
      // displace an `update-ready`, so testing three types in one page would
      // measure the first one three times. Navigating rather than calling
      // `location.reload()` from inside the page, which drops the execution
      // context `evaluate` is speaking to.
      await evaluate(cdp, `(() => { localStorage.removeItem('web-katrain:auto_saved_game:v1'); return 1; })()`)
        .catch(() => {});
      await navigate(cdp, appUrl);
      await waitForBoard(cdp);
      await evaluate(cdp, `(() => {
        // Phone shells open over the home overlay; the board is behind it.
        const button = [...document.querySelectorAll('button')].find((b) =>
          /open board|continue|resume/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')));
        if (button) button.click();
        return !!button;
      })()`);
      await sleep(400);
      const shown = await evaluate(cdp, `(async () => {
        if (${JSON.stringify(banner)} === 'install') {
          const event = new Event('beforeinstallprompt');
          event.prompt = () => Promise.resolve();
          event.userChoice = Promise.resolve({ outcome: 'dismissed' });
          window.dispatchEvent(event);
        } else {
          window.dispatchEvent(new Event('web-katrain:pwa-' + ${JSON.stringify(banner)}));
        }
        await new Promise((resolve) => setTimeout(resolve, 600));
        const card = document.querySelector('.pwa-install-banner');
        return !!card && getComputedStyle(card).display !== 'none';
      })()`);

      const covered = await evaluate(cdp, COVERAGE);
      if (covered.length > 0) {
        failures.push(`${label} with the ${banner} card: ${covered.join(', ')}`);
      }
      // A card that shows on a tall screen is the other half of the contract:
      // the short-screen rule must not have swallowed every one of them.
      if (viewport.height >= 500 && !shown && banner === 'update-ready') {
        failures.push(`${label}: the ${banner} card never appeared, so nothing was audited`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`pwa card over the board:\n      - ${failures.join('\n      - ')}`);
  }
}

async function assertLongMetadataStaysRecoverable(cdp) {
  const LONG_NAME = 'Bartholomew Wolfeschlegelsteinhausenbergerdorff-Featherstonehaugh';
  const LONG_EVENT =
    'The Twenty-Ninth Annual International Championship of Baduk and Weiqi Invitational, Sponsored Division';
  const sgf =
    `(;GM[1]FF[4]SZ[19]KM[7.5]RU[Chinese]PB[${LONG_NAME}]BR[5d]PW[${LONG_NAME} II]WR[7d]` +
    `DT[2019-07-04]EV[${LONG_EVENT}]RO[Quarter-final, upper bracket, second leg]` +
    `PC[Seoul, Republic of Korea]GN[${LONG_EVENT}]RE[B+2.5]TM[3600]` +
    `OT[5x30 byo-yomi with a 30 second delay];B[dd];W[pp])`;

  await setViewport(cdp, { width: 1440, height: 900, mobile: false });
  const loaded = await evaluate(cdp, `(async () => {
    const [store, sgfUtil] = await Promise.all([
      import('/src/store/gameStore.ts'),
      import('/src/utils/sgf.ts'),
    ]);
    store.useGameStore.getState().loadGame(sgfUtil.parseSgf(${JSON.stringify(sgf)}));
    await new Promise((resolve) => setTimeout(resolve, 600));
    // Every collapsed section, so nothing escapes the audit by being closed.
    for (const head of document.querySelectorAll('.section-head-toggle')) {
      if (head.getAttribute('aria-expanded') !== 'true') head.click();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    return document.body.innerText.includes('Wolfeschlegel');
  })()`);
  if (!loaded) throw new Error('long metadata: the record did not load, so nothing was audited');

  const clipped = await evaluate(cdp, TRUNCATION_AUDIT);
  if (clipped.length > 0) {
    throw new Error(`long metadata: unrecoverable truncation:\n      - ${clipped.join('\n      - ')}`);
  }
}

async function assertShellVariantApplies(cdp) {
  const probe = `(() => {
    const el = document.createElement('div');
    el.className = 'desktop-shell:hidden';
    document.body.appendChild(el);
    const display = getComputedStyle(el).display;
    el.remove();
    return display;
  })()`;
  const failures = [];

  await setViewport(cdp, { width: 1280, height: 800, mobile: false });
  const desktop = await evaluate(cdp, probe);
  if (desktop !== 'none') {
    failures.push(`desktop-shell: emits no rule at 1280x800 (display was "${desktop}", expected "none")`);
  }

  await setViewport(cdp, { width: 390, height: 844, mobile: true });
  const mobile = await evaluate(cdp, probe);
  if (mobile === 'none') {
    failures.push('desktop-shell: applies at 390x844, so it is not gated on the desktop shell');
  }

  if (failures.length > 0) {
    throw new Error(`shell variant: ${failures.join('; ')}`);
  }
}

/**
 * Buttons in the open modal that sit off-screen with nothing able to scroll
 * them back. Returns 'NO_MODAL' when nothing is open, so a caller can tell
 * "nothing to check" from "checked and clean".
 */
const STRANDED_BUTTONS_PROBE = `(() => {
  const d = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (!d) return 'NO_MODAL';
  const vh = window.innerHeight;
  const scrollableAncestor = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/auto|scroll/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
  };
  const stranded = [...d.querySelectorAll('button')]
    .filter((b) => b.getClientRects().length)
    .filter((b) => {
      const r = b.getBoundingClientRect();
      return (r.bottom > vh + 0.5 || r.top < -0.5) && !scrollableAncestor(b);
    })
    .map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24));
  return JSON.stringify(stranded);
})()`;

/**
 * Every dialog's controls must stay reachable on a short screen.
 *
 * These overlays are `fixed inset-0` flex containers that centre their panel, and
 * a centred flex item taller than its container overflows *both* edges of a fixed
 * overlay that nothing can scroll -- so a confirm dialog that grows past the
 * viewport strands its own Cancel and Confirm buttons with no way to reach them.
 * Several of these dialogs neither cap their height nor scroll, which is fine
 * only for as long as their content stays short.
 *
 * A control is stranded when it sits outside the viewport AND no ancestor can
 * scroll it back into view; the second half matters, because the dialogs that do
 * cap themselves legitimately keep most of their content below the fold.
 *
 * Measured clean across 568x320, 320x480 and 740x360 when this was written.
 */
async function assertDialogsFitShortViewports(cdp) {
  const DIALOGS = [
    { name: 'Settings', trigger: '/^Settings/i', wait: 1500 },
    { name: 'Keyboard shortcuts', trigger: '/Keyboard shortcuts/i', wait: 1100 },
    { name: 'Paste SGF', trigger: '/Paste SGF/i', wait: 1100 },
    { name: 'Save copy to Library', trigger: '/Save copy to Library/i', wait: 1100 },
    { name: 'New game', trigger: '/^New game/i', wait: 1300 },
  ];
  const SHORT = [[568, 320], [320, 480], [740, 360]];
  const failures = [];
  const strandedProbe = STRANDED_BUTTONS_PROBE;

  for (const [width, height] of SHORT) {
    await setViewport(cdp, { width, height, mobile: width < 768 });
    await sleep(600);
    for (const dialog of DIALOGS) {
      const opened = await evaluate(cdp, `(() => {
        const b = [...document.querySelectorAll('button')].find((x) =>
          ${dialog.trigger}.test((x.getAttribute('aria-label') || '') + '|' + (x.textContent || '')));
        if (!b) return 'no-trigger';
        b.click();
        return 'ok';
      })()`);
      // A dialog whose trigger this layout does not offer is not a failure.
      if (opened !== 'ok') continue;
      await sleep(dialog.wait);
      const stranded = await evaluate(cdp, strandedProbe);
      if (stranded !== 'NO_MODAL' && stranded !== '[]') {
        failures.push(`${dialog.name} at ${width}x${height} strands ${stranded}`);
      }
      await evaluate(cdp, `(() => {
        const d = document.querySelector('[role="dialog"][aria-modal="true"]');
        if (!d) return;
        const c = [...d.querySelectorAll('button')].find((b) =>
          /cancel|close|keep|not now|dismiss/i.test((b.textContent || '') + (b.getAttribute('aria-label') || '')));
        if (c) c.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      })()`);
      await sleep(500);
    }
  }

  if (failures.length > 0) {
    throw new Error(`dialogs on short viewports: ${failures.join('; ')}`);
  }
}

async function main() {
  fs.rmSync(screenshotDir, { recursive: true, force: true });
  fs.mkdirSync(screenshotDir, { recursive: true });

  const appPort = await freePort();
  const devtoolsPort = await freePort();
  // A warm developer cache hid first-use worker dependency reloads in CI.
  // Keep every run cold and independent of other dev servers and Chrome tabs.
  // node_modules also keeps transformed dependency code out of React's plugin.
  const runDir = fs.mkdtempSync(path.resolve('node_modules/.web-katrain-viewport-'));
  let server;
  let chrome;
  try {
    server = await createServer({
      cacheDir: path.join(runDir, 'vite'),
      server: { host: '127.0.0.1', port: appPort, strictPort: true },
    });
    await server.listen();

    // --no-sandbox and --disable-dev-shm-usage are the pair headless Chrome
    // needs on a CI runner: the sandbox cannot start in the container, and
    // /dev/shm there is small enough that the renderer dies allocating in it.
    // Without them Chrome exits during the first Runtime.evaluate and the only
    // symptom is a CDP reply with no `result` field. Kept off locally, where
    // the sandbox works and is worth having.
    const ciChromeFlags = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];

    // Chrome's stderr used to go to /dev/null, which is why the CI failure
    // above said nothing about Chrome at all. Keep it and print it if the run
    // fails.
    chrome = spawn(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${path.join(runDir, 'chrome')}`,
      ...ciChromeFlags,
      `--remote-debugging-port=${devtoolsPort}`,
      '--window-size=1280,900',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let chromeStderr = '';
    chrome.stderr?.on('data', (chunk) => { chromeStderr += String(chunk); });
    // A binary that is not there fails with an 'error' event, not a non-zero
    // 'exit'. Without this handler the only symptom was an eight-second wait
    // and "Timed out waiting for Chrome devtools target", which says nothing
    // about the binary.
    chrome.on('error', (err) => {
      process.stderr.write(`Failed to start Chrome at ${chromePath}: ${err.message}\n`);
      process.stderr.write(`Candidates checked: ${JSON.stringify(chromeCandidates())}\n`);
    });
    chrome.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        process.stderr.write(`Chrome exited with code ${code}${signal ? ` (${signal})` : ''}\n`);
        if (chromeStderr) process.stderr.write(chromeStderr.slice(-2000) + '\n');
      }
    });

    const target = await chromeTarget(devtoolsPort);
    const cdp = connectDevtools(target);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    // Headless Chrome has no focused window, so `document.hasFocus()` is false
    // and the page is treated as background: measured here, it is false on a
    // local run too. Focus emulation makes it report as focused, which is what
    // a real browser tab does while someone is looking at it -- the state every
    // assertion below is written about.
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    // Layout shift is the one kind of breakage the measurements below cannot
    // see: every box can be the right size and in the right place by the time
    // they run, and the page can still have thrown its content around getting
    // there. The observer goes in before the app boots so nothing is missed,
    // and `__shifts` is reset once the shell has settled -- what is asserted is
    // the quiet window after that, not the churn of a first paint.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__shifts = [];
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              // A shift within 500ms of a click is the page responding to it.
              if (entry.hadRecentInput) continue;
              window.__shifts.push({
                value: entry.value,
                sources: (entry.sources || []).slice(0, 3).map((source) => {
                  const node = source.node;
                  if (!node || !node.tagName) return '(removed)';
                  const cls = typeof node.className === 'string'
                    ? node.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
                  return node.tagName.toLowerCase() + (cls ? '.' + cls : '')
                    + ' y' + Math.round(source.previousRect.top) + '->' + Math.round(source.currentRect.top);
                }),
              });
            }
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {
          // No layout-shift entries in this build; the check reports nothing.
        }
      `,
    });
    if (process.env.VIEWPORT_CPU_THROTTLE) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.VIEWPORT_CPU_THROTTLE) });
      process.stdout.write(`CPU throttled ${process.env.VIEWPORT_CPU_THROTTLE}x\n`);
    }

    // Console errors and uncaught exceptions are silent in a headless run: the
    // layout assertions below still pass while the page is throwing on every
    // interaction. Collect them so a broken handler fails the check.
    let pageErrors = [];
    cdp.on((message) => {
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params?.exceptionDetails;
        const text = details?.exception?.description ?? details?.text ?? 'unknown exception';
        pageErrors.push(`uncaught: ${String(text).split('\n')[0]}`);
        return;
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        const text = (message.params.args ?? [])
          .map((arg) => arg.description ?? arg.value ?? arg.unserializableValue ?? '')
          .join(' ')
          .trim();
        if (text) pageErrors.push(`console.error: ${text.split('\n')[0]}`);
      }
    });

    const results = [];
    const viewportFailures = [];
    for (const viewport of VIEWPORTS) {
      const appUrl = `http://127.0.0.1:${appPort}/`;
      pageErrors = [];
      await setViewport(cdp, viewport);
      await navigate(cdp, appUrl);
      await waitForBoard(cdp);
      // Each viewport has to start from a clean slate. The previous pass edits
      // the game, so its auto-save debounce can land after we navigate away —
      // and the next load then opens the recovery modal over the whole app,
      // which reads as a flood of unrelated failures (289 board intersections,
      // every smoke flow dead). The suite used to pass only because it beat
      // that timer; adding 700ms anywhere upstream broke it.
      const hadAutoSave = await evaluate(cdp, `(() => {
        const key = 'web-katrain:auto_saved_game:v1';
        const had = localStorage.getItem(key) !== null;
        localStorage.removeItem(key);
        return had;
      })()`);
      if (hadAutoSave) {
        await navigate(cdp, appUrl);
        await waitForBoard(cdp);
      }
      const opensPanels = !viewport.mobile
        && ((viewport.width === 1024 && viewport.height === 768)
          || (viewport.width === 1440 && viewport.height === 900));
      if (opensPanels) {
        await evaluate(cdp, `(() => {
          localStorage.setItem('web-katrain:library_open:v1', 'true');
          localStorage.setItem('web-katrain:sidebar_open:v1', 'true');
        })()`);
        await navigate(cdp, appUrl);
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
      await waitForShellReady(cdp);
      // Start the layout-shift window here: the shell is up and nothing has
      // been clicked, so anything that moves from now on moves on its own.
      await evaluate(cdp, `(() => { window.__shifts = []; return true; })()`);
      const defaultLayout = await evaluate(cdp, `(() => {
        const board = document.querySelector('[data-board-snapshot="true"]');
        if (!board) return { board: null };
        const r = board.getBoundingClientRect();
        const boardCanvas = board.closest('.mobile-board-canvas');
        const boardContainer = board.closest('[data-board-container="true"]');
        const analysisSlot = document.querySelector('.analysis-command-bar-slot');
        const analysisCommandBar = analysisSlot?.querySelector('[data-analysis-command-bar="true"]');
        const boardCanvasRect = boardCanvas?.getBoundingClientRect() ?? null;
        const analysisSlotRect = analysisSlot?.getBoundingClientRect() ?? null;
        return {
          board: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
          boardCanvasTopInset: boardCanvasRect ? r.top - boardCanvasRect.top : null,
          boardCanvasBottomInset: boardCanvasRect ? boardCanvasRect.bottom - r.bottom : null,
          boardContainerAlign: boardContainer ? getComputedStyle(boardContainer).alignItems : null,
          idleAnalysisSlotHeight: analysisSlotRect && !analysisCommandBar ? analysisSlotRect.height : 0,
          documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        };
      })()`);
      const defaultScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(
        path.join(screenshotDir, `${viewport.width}x${viewport.height}.png`),
        Buffer.from(defaultScreenshot.result.data, 'base64')
      );
      // Close the quiet window here: everything below clicks through the app,
      // and a shift that follows a click is the page answering it. The settle
      // is for what arrives on its own -- a library read resolving, an install
      // card mounting, the engine reporting ready.
      await sleep(700);
      const layoutShift = await evaluate(cdp, `(() => {
        const shifts = window.__shifts || [];
        return {
          total: shifts.reduce((sum, entry) => sum + entry.value, 0),
          worst: shifts
            .slice()
            .sort((a, b) => b.value - a.value)
            .slice(0, 3)
            .map((entry) => entry.value.toFixed(4) + ' ' + entry.sources.join(' | ')),
        };
      })()`);
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
        // Paste SGF / OGS and the board-from-photo item live in the header File
        // menu ('More file actions'); the dedicated smoke flows open that menu
        // to reach them.
        //
        // Each entry is one action listed under every name a shell gives it.
        // The dashboard calls the file picker "Open SGF, board photo, or model
        // weights" and the classic top bar still calls it "Load ..."; this
        // sweep measures whether the action is reachable, so it accepts either.
        // Holding the app to one spelling is a copy test's job, not this one's
        // -- encoding a single spelling here just turns a rename into a wall of
        // unrelated failures, which is exactly what it did.
        const requiredFileActions = [
          ['New game'],
          ['Save SGF'],
          ['Open SGF, board photo, or model weights', 'Load SGF, board photo, or model weights'],
          ['More file actions'],
        ];
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
        /**
         * Content inside a dialog that paints outside the viewport.
         *
         * documentOverflow catches a page you can scroll sideways, but an
         * element can spill out of its own container without widening the
         * document at all -- the keyboard help's "Middle-click a candidate"
         * chip is shrink-0 and 189px, so in a 234px row at 320px wide it simply
         * painted 48px outside its row and 5px past the screen. Nothing
         * measured that: the page did not overflow, the text was not clipped by
         * its own box, and the target was well over 44px.
         */
        const auditDialogSpill = (scope) => {
          // Regions that run off the side on purpose, named one at a time.
          // There is no general scrollable-ancestor rule below because both
          // ways of writing one let a real bug through, so a deliberate
          // sideways scroller is exempted here by name and has to earn it: this
          // row is flex-nowrap with overflow-x-auto under lg and flex-wrap
          // above it, which is a chip rail the reader swipes, not content that
          // escaped its box.
          const sidewaysScrollers = '.pro-games-featured';
          const out = [];
          for (const el of scope.querySelectorAll('*')) {
            if (el.closest(sidewaysScrollers)) continue;
            // sr-only clips rather than hides, and is parked off-screen on purpose.
            if (el.classList.contains('sr-only')) continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            const over = Math.round(Math.max(r.right - window.innerWidth, -r.left));
            if (over <= 1) continue;
            if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
            // Report the innermost offender: every ancestor of a spilling element
            // spills too, and only the innermost one names the thing to fix.
            if (Array.from(el.children).some((child) => {
              const b = child.getBoundingClientRect();
              return b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1);
            })) continue;
            // There is deliberately no "but an ancestor scrolls sideways"
            // exemption here. Both ways of writing one are wrong: overflow-x
            // computes to auto whenever the other axis is not visible, so every
            // dialog with a scrolling body looks horizontally scrollable, and
            // scrollWidth > clientWidth is true of the overflow itself, not just
            // of a scroller. Written either way this audit passed a dialog whose
            // chip was hanging 5px off the screen. A dialog that does need a wide
            // scrolling region can be exempted by name when one exists.
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            out.push((text.slice(0, 26) || el.tagName.toLowerCase()) + ' ' + over + 'px past the viewport');
            if (out.length >= 4) break;
          }
          return out;
        };
        // Desktop counterpart to auditSmallTouchTargets: modals were only ever
        // audited under the mobile gate, so no dialog's target sizes had been
        // checked on desktop. 24px is the WCAG 2.2 SC 2.5.8 floor, the same one
        // dashboardSubMinimumTargets holds the shell to.
        const auditSubMinimumTargets = (scope = document) => Array.from(scope.querySelectorAll('button, input:not([type="hidden"]), select, textarea, a[href], [role="button"], [role="tab"]'))
          .filter((el) => !el.closest('[data-board-snapshot="true"], [data-photo-board-trace-grid="true"]'))
          // Not targets: the sr-only inputs that exist only to give a radiogroup
          // a labelable element are aria-hidden, tabindex -1 and clipped to 1x1,
          // but sr-only clips rather than hiding, so checkVisibility still says
          // yes. A pointer can never land on them.
          .filter((el) => el.getAttribute('aria-hidden') !== 'true' && el.tabIndex >= 0 && !el.classList.contains('sr-only'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return false;
            return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
          })
          // A checkbox or radio inside a label is activated by the whole label,
          // so that is the target to measure, not the 16px box.
          .map((el) => {
            const wrapper = /^(checkbox|radio)$/.test(el.type || '') ? el.closest('label') : null;
            return { el, r: (wrapper || el).getBoundingClientRect() };
          })
          .filter(({ r }) => r.width < 24 || r.height < 24)
          .map(({ el, r }) => ({
            label: targetLabel(el),
            tag: el.tagName.toLowerCase(),
            width: r.width,
            height: r.height,
          }));
        const dashboardHeaderSmallTargets = dashboard && topBar
          ? Array.from(topBar.querySelectorAll('button'))
            .filter((element) => {
              const style = getComputedStyle(element);
              const bounds = element.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
            })
            .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
            .filter(({ bounds }) => bounds.width < 32 || bounds.height < 32)
            .map(({ element, bounds }) => ({
              label: targetLabel(element),
              width: bounds.width,
              height: bounds.height,
            }))
          : [];
        const dashboardBoardActionSmallTargets = dashboard
          ? Array.from(dashboard.querySelectorAll('.board-tools .board-chip, .playactions .tbtn'))
            .filter((element) => {
              const style = getComputedStyle(element);
              const bounds = element.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
            })
            .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
            .filter(({ bounds }) => bounds.width < 32 || bounds.height < 32)
            .map(({ element, bounds }) => ({
              label: targetLabel(element),
              width: bounds.width,
              height: bounds.height,
            }))
          : [];
        const dashboardSubMinimumTargets = dashboard
          ? Array.from(dashboard.querySelectorAll('button, [role="button"], [role="tab"], a[href], select, input:not([type="hidden"])'))
            // checkVisibility's opacityProperty walks ancestors, which matters
            // here: the library row actions rest inside an opacity-0, width-0
            // wrapper and only exist as targets once the row is hovered. A
            // display/visibility test alone counted all 4 per row, at the 12px
            // width the collapsed wrapper squeezes them to.
            .filter((element) => {
              const bounds = element.getBoundingClientRect();
              if (bounds.width <= 0 || bounds.height <= 0) return false;
              return element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
            })
            .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
            .filter(({ bounds }) => bounds.width < 24 || bounds.height < 24)
            .map(({ element, bounds }) => ({
              label: targetLabel(element),
              width: bounds.width,
              height: bounds.height,
            }))
          : [];
        const dashboardNavbar = dashboard?.querySelector('.navbar');
        const dashboardPassButton = dashboardNavbar?.querySelector('.pass-btn');
        const dashboardPlayActions = dashboardNavbar?.querySelector('.playactions');
        const dashboardNavbarWrapped = dashboardPassButton && dashboardPlayActions
          ? Math.abs(
              dashboardPassButton.getBoundingClientRect().top + dashboardPassButton.getBoundingClientRect().height / 2 -
              (dashboardPlayActions.getBoundingClientRect().top + dashboardPlayActions.getBoundingClientRect().height / 2)
            ) > 2
          : false;
        const dashboardGameStrip = dashboard?.querySelector('.gamestrip');
        const dashboardGameStripCenters = dashboardGameStrip
          ? Array.from(dashboardGameStrip.children)
            .filter(isVisibleBox)
            .map((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.top + bounds.height / 2;
            })
          : [];
        const dashboardGameStripWrapped = dashboardGameStripCenters.length > 1 &&
          Math.max(...dashboardGameStripCenters) - Math.min(...dashboardGameStripCenters) > 2;
        const mobileTurnIndicatorElement = document.querySelector('.mobile-bottom-stone');
        const mobileTurnIndicatorBounds = mobileTurnIndicatorElement?.getBoundingClientRect() ?? null;
        const mobileTurnIndicatorStyle = mobileTurnIndicatorElement ? getComputedStyle(mobileTurnIndicatorElement) : null;
        const mobileTurnIndicator = mobileTurnIndicatorElement && mobileTurnIndicatorBounds && mobileTurnIndicatorStyle
          ? {
              width: mobileTurnIndicatorBounds.width,
              height: mobileTurnIndicatorBounds.height,
              borderWidth: Number.parseFloat(mobileTurnIndicatorStyle.borderTopWidth) || 0,
              isBlack: mobileTurnIndicatorElement.classList.contains('mobile-bottom-stone-black'),
            }
          : null;
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
        // Text contrast. The palette is entirely token-driven and measured
        // clean at 4.5:1 (3:1 for large text) in all four themes, so anything
        // failing here is a hard-coded colour or a token used off its intended
        // surface. Colours are read computed, never sampled from a screenshot:
        // capture in this setup is not colour-accurate.
        const auditContrast = (skipSelector, scope) => {
          const parseColor = (value) => {
            if (!value) return null;
            // Every backslash here is doubled on purpose: this whole probe is
            // a template literal, so a single one is swallowed before the page
            // ever sees the regex.
            let m = value.match(/rgba?\\(([^)]+)\\)/);
            if (m) {
              const parts = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number);
              return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
            }
            m = value.match(/color\\(srgb\\s+([^)]+)\\)/);
            if (m) {
              const parts = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number);
              return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a: parts.length > 3 ? parts[3] : 1 };
            }
            return null;
          };
          const composite = (fg, bg) => ({
            r: fg.r * fg.a + bg.r * (1 - fg.a),
            g: fg.g * fg.a + bg.g * (1 - fg.a),
            b: fg.b * fg.a + bg.b * (1 - fg.a),
            a: 1,
          });
          const luminance = (c) => {
            const channel = (v) => {
              const n = v / 255;
              return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
            };
            return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
          };
          const contrast = (a, b) => {
            const first = luminance(a);
            const second = luminance(b);
            const hi = Math.max(first, second);
            const lo = Math.min(first, second);
            return (hi + 0.05) / (lo + 0.05);
          };
          const backgroundOf = (el) => {
            let node = el;
            let acc = null;
            while (node) {
              const c = parseColor(getComputedStyle(node).backgroundColor);
              if (c && c.a > 0) {
                acc = acc ? composite(acc, c) : c;
                if (acc.a >= 0.999) return acc;
              }
              node = node.parentElement;
            }
            return acc && acc.a >= 0.999 ? acc : { r: 255, g: 255, b: 255, a: 1 };
          };
          const failures = [];
          const seen = new Set();
          for (const el of (scope || document).querySelectorAll('*')) {
            if (el.children.length > 0) continue;
            const text = (el.textContent || '').trim();
            if (text.length < 2) continue;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (Number(style.opacity) < 0.15) continue;
            const bounds = el.getBoundingClientRect();
            if (bounds.width < 4 || bounds.height < 4) continue;
            if (el.closest('[data-board-snapshot="true"], canvas, svg')) continue;
            if (skipSelector && el.closest(skipSelector)) continue;
            const fg = parseColor(style.color);
            if (!fg) continue;
            const bg = backgroundOf(el);
            const effective = fg.a < 1 ? composite(fg, bg) : fg;
            const ratio = contrast(effective, bg);
            const size = parseFloat(style.fontSize);
            const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
            const required = large ? 3 : 4.5;
            if (ratio + 0.05 >= required) continue;
            const key = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '') + '|' + style.color;
            if (seen.has(key)) continue;
            seen.add(key);
            failures.push(text.slice(0, 24) + ' ' + (Math.round(ratio * 100) / 100) + ':1 (needs ' + required + ':1)');
          }
          return failures;
        };
        // auditContrast reads whatever theme is mounted, which is the default
        // one. The palette it guards is defined per theme in index.css, so a
        // token that only fails under kaya or light would never be seen. Each
        // theme is applied to the root, audited, and the original restored;
        // setting data-ui-theme is the whole mechanism, since the themes are
        // plain :root[data-ui-theme=...] custom-property blocks.
        const auditContrastAllThemes = (scope) => {
          const root = document.documentElement;
          const original = root.dataset.uiTheme;
          // The mounted theme first, with nothing skipped: that is the only pass
          // where every element's colours are the ones the app actually shipped.
          const out = auditContrast(undefined, scope).map((entry) => (original || 'default') + ': ' + entry);
          // The graph's empty overlay picks its palette in JavaScript
          // (scoreWinrateGraphTheme.ts hardcodes bg-[rgb(248,250,252)] on the
          // light branch), so swapping data-ui-theme flips the CSS variables
          // underneath classes React never re-renders. That mismatched pair
          // never occurs in the app, and reported ~2:1 against three themes.
          const jsThemed = '[data-analysis-graph-empty-state="true"]';
          // The restore has to be in a finally: this now runs once for the page
          // and once per open dialog, and a throw anywhere in the loop would
          // otherwise leave a theme mounted that the app never chose -- every
          // measurement after it at that viewport, contrast or not, would be
          // reading the wrong palette.
          try {
            for (const theme of ['noir', 'kaya', 'studio', 'light']) {
              if (theme === original) continue;
              root.dataset.uiTheme = theme;
              // A custom-property swap on the root does not invalidate every
              // descendant's cached computed style on its own, and reading a
              // stale colour against a fresh background invents failures at
              // ~1.2:1. Detach and reattach to force a full recalc.
              root.style.display = 'none';
              void root.offsetHeight;
              root.style.display = '';
              void getComputedStyle(root).getPropertyValue('--ui-text');
              out.push(...auditContrast(jsThemed, scope).map((entry) => theme + ': ' + entry));
            }
          } finally {
            if (original === undefined) delete root.dataset.uiTheme;
            else root.dataset.uiTheme = original;
            root.style.display = 'none';
            void root.offsetHeight;
            root.style.display = '';
            void getComputedStyle(root).getPropertyValue('--ui-text');
          }
          return out;
        };
        const waitForFrames = async (frames = 2) => {
          for (let i = 0; i < frames; i++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
        };
        const runBottomMoreSheetSmoke = async () => {
          const failures = [];
          const trigger = Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'More controls');
          if (!trigger) return { failures: ['trigger missing'], smallTouchTargets: [] };
          trigger.click();
          await waitForFrames(3);

          const sheet = document.querySelector('[data-bottom-more-sheet="true"]');
          if (!sheet) return { failures: ['sheet did not open'], smallTouchTargets: [] };
          if (sheet.getAttribute('aria-modal') !== 'true') failures.push('sheet is not modal');
          // One long label wrapping to a second line used to grow its whole
          // grid row from 48px to 61px, so the sheet read as two rhythms. In
          // portrait every action row is the same height whether its label
          // wraps or not; landscape lays the same buttons out in four columns
          // with its own measured tuning, so it is left alone here.
          if (innerHeight > innerWidth) {
            const grid = sheet.querySelector('[data-bottom-more-grid="true"]');
            const rowHeights = grid
              ? [...new Set(Array.from(grid.querySelectorAll('button'))
                .map((button) => button.getBoundingClientRect())
                .filter((bounds) => bounds.width > 0 && bounds.height > 0)
                .map((bounds) => Math.round(bounds.height)))]
              : [];
            if (rowHeights.length > 1) {
              failures.push('More Controls rows are ragged: ' + rowHeights.sort((a, b) => a - b).join('/') + 'px');
            }
          }
          const smallTouchTargets = auditSmallTouchTargets(sheet);
          const focusableSelector = [
            'a[href]:not([tabindex="-1"])',
            'button:not([disabled]):not([tabindex="-1"])',
            'input:not([disabled]):not([tabindex="-1"])',
            'select:not([disabled]):not([tabindex="-1"])',
            'textarea:not([disabled]):not([tabindex="-1"])',
            '[tabindex]:not([tabindex="-1"])',
          ].join(',');
          const focusableElements = Array.from(sheet.querySelectorAll(focusableSelector))
            .filter((element) => element.getClientRects().length > 0);
          const first = focusableElements[0];
          const last = focusableElements[focusableElements.length - 1];
          const closeButton = sheet.querySelector('[data-bottom-more-close="true"]');
          if (!first || !last || !closeButton) {
            failures.push('focusable controls missing');
          } else {
            first.focus({ preventScroll: true });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
            if (document.activeElement !== last) failures.push('Shift+Tab does not wrap to the last control');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
            if (document.activeElement !== first) failures.push('Tab does not wrap to the first control');
            closeButton.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              detail: 1,
            }));
            await waitForFrames(3);
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (document.querySelector('[data-bottom-more-sheet="true"]')) failures.push('close control did not dismiss the sheet');
            if (document.activeElement !== trigger) failures.push('focus did not return to the More controls trigger');
            if (trigger.closest('[data-bottom-more]')?.getAttribute('data-bottom-more-focus-origin') !== 'pointer') {
              failures.push('pointer dismissal did not mark restored focus as pointer-originated');
            }
            if (getComputedStyle(trigger).outlineStyle !== 'none') {
              failures.push('pointer dismissal left a keyboard focus ring on More controls');
            }

            trigger.focus({ preventScroll: true });
            trigger.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              detail: 1,
            }));
            await waitForFrames(3);
            if (!document.querySelector('[data-bottom-more-sheet="true"]')) {
              failures.push('sheet did not reopen for keyboard dismissal check');
            } else {
              document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
              }));
              await waitForFrames(3);
              await new Promise((resolve) => setTimeout(resolve, 0));
              if (document.querySelector('[data-bottom-more-sheet="true"]')) failures.push('Escape did not dismiss the sheet');
              if (document.activeElement !== trigger) failures.push('Escape dismissal did not return focus to More controls');
              if (trigger.closest('[data-bottom-more]')?.getAttribute('data-bottom-more-focus-origin') !== 'keyboard') {
                failures.push('keyboard dismissal did not preserve keyboard focus feedback');
              }
            }
          }
          return { failures, smallTouchTargets };
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
        // Every intersection must actually be clickable. The smoke test above
        // dispatches straight at the board element, so it cannot see UI painted
        // on top of it — the failure mode that once put the edit palette over 76
        // intersections and the tree controls over the last few moves.
        const auditBoardCoverage = () => {
          const boardEl = document.querySelector('[data-board-snapshot="true"]');
          if (!boardEl) return [];
          const size = Number(boardEl.getAttribute('data-board-size'));
          const cellSize = Number(boardEl.getAttribute('data-board-cell-size'));
          const originX = Number(boardEl.getAttribute('data-board-origin-x'));
          const originY = Number(boardEl.getAttribute('data-board-origin-y'));
          if (!Number.isFinite(size) || !Number.isFinite(cellSize) || !Number.isFinite(originX) || !Number.isFinite(originY)) return [];
          const r = boardEl.getBoundingClientRect();
          const blockers = new Map();
          for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
              const px = r.left + originX + x * cellSize;
              const py = r.top + originY + y * cellSize;
              if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) continue;
              const hit = document.elementFromPoint(px, py);
              if (!hit) continue;
              // The board's own stack is fine, including transparent ancestors.
              if (hit === boardEl || boardEl.contains(hit) || hit.contains(boardEl)) continue;
              const label = (hit.getAttribute('aria-label') || hit.getAttribute('title') ||
                (hit.className || '').toString() || hit.tagName || 'unknown').toString().trim().slice(0, 40);
              blockers.set(label, (blockers.get(label) || 0) + 1);
            }
          }
          return Array.from(blockers.entries()).map(([label, count]) =>
            count + ' board intersection(s) covered by ' + label);
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
          const clientX = r.left + originX + x * cellSize;
          const clientY = r.top + originY + y * cellSize;
          boardEl.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX,
            clientY,
          }));
          boardEl.focus({ preventScroll: true });
          boardEl.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 0,
            clientX,
            clientY,
          }));
          boardEl.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
          }));
          await waitForFrames(4);

          if (boardEl.getAttribute('data-board-input-mode') !== 'pointer') {
            failures.push('pointer focus activated keyboard-only board feedback');
          }
          if (boardEl.querySelector('[data-board-keyboard-cursor="true"]')) {
            failures.push('pointer focus displayed the keyboard cursor');
          }

          // A click focuses the board as well, and the arrows are the app's move
          // navigation, so the board has to leave them alone: an arrow pressed
          // here must reach the global shortcut rather than raise the cursor.
          // See boardKeyboardCursorHandlesKey in boardKeyboardNavigation.ts.
          boardEl.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            bubbles: true,
            cancelable: true,
          }));
          await waitForFrames(2);
          if (boardEl.getAttribute('data-board-input-mode') !== 'pointer') {
            failures.push('an arrow after a board click activated keyboard-only board feedback');
          }
          if (boardEl.querySelector('[data-board-keyboard-cursor="true"]')) {
            failures.push('an arrow after a board click displayed the keyboard cursor');
          }

          // Reaching the board by keyboard is what raises the cursor, which is
          // the distinction this section is really about.
          // React binds onFocus/onBlur to focusin/focusout, and a headless
          // window will not deliver real ones, so drive them the same way this
          // section already drives pointer and key events.
          boardEl.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
          await waitForFrames(1);
          boardEl.focus({ preventScroll: true });
          boardEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
          await waitForFrames(2);
          boardEl.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            bubbles: true,
            cancelable: true,
          }));
          await waitForFrames(2);
          if (boardEl.getAttribute('data-board-input-mode') !== 'keyboard') {
            failures.push('keyboard navigation did not activate board feedback');
          }
          if (!boardEl.querySelector('[data-board-keyboard-cursor="true"]')) {
            failures.push('keyboard navigation did not display the board cursor');
          }

          boardEl.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 2,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX,
            clientY,
          }));
          boardEl.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 2,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 0,
            clientX,
            clientY,
          }));
          await waitForFrames(2);
          if (boardEl.getAttribute('data-board-input-mode') !== 'pointer') {
            failures.push('pointer interaction did not clear keyboard-only board feedback');
          }
          if (boardEl.querySelector('[data-board-keyboard-cursor="true"]')) {
            failures.push('pointer interaction did not clear the keyboard cursor');
          }

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
            const currentCellSize = Number(boardEl.getAttribute('data-board-cell-size'));
            const currentOriginX = Number(boardEl.getAttribute('data-board-origin-x'));
            const currentOriginY = Number(boardEl.getAttribute('data-board-origin-y'));
            boardEl.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: r.left + currentOriginX + x * currentCellSize,
              clientY: r.top + currentOriginY + y * currentCellSize,
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
          const openEditButton = findFreshButton('Open SGF edit tools') || findFreshButton('Edit position');
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
        // Waits on wall-clock time, not on a frame count.
        //
        // This used to poll for 60 frames, which is about a second on an idle
        // machine and an unknown, much shorter slice of work on a busy one --
        // frames stretch exactly when the thing being waited for is slow. Every
        // dialog here is a lazy() import, so opening one costs a chunk fetch
        // plus a render, and on a loaded CI runner that overran the budget:
        // "keyboard shortcuts did not open, paste SGF did not open, game report
        // did not open, settings did not open", all at once, on a machine where
        // all four open fine.
        //
        // A deadline says what is actually meant -- give it ten seconds -- and
        // does not change meaning with load.
        /**
         * Polls until something is true, or a deadline passes.
         *
         * The same reasoning as waitForSelector below, for state that is not an
         * element. waitForFrames(4) is a guess about how long an update takes,
         * and frames stretch exactly when the thing being waited for is slow.
         * The board-theme and locale smokes both asserted straight after four
         * frames, and both failed at 568x320 in a run that passed on the very
         * next attempt -- an intermittently red check is worse than no check,
         * because it teaches everyone to re-run it.
         *
         * Returns whether the condition held, but the callers still assert on
         * the real state afterwards: the point is to stop guessing at the
         * wait, not to soften what is being checked.
         */
        const waitForCondition = async (holds, timeoutMs = 5000) => {
          const deadline = performance.now() + timeoutMs;
          for (;;) {
            try {
              if (holds()) return true;
            } catch {
              // A picker that has not rendered yet reads as not-yet-true.
            }
            if (performance.now() >= deadline) return false;
            await new Promise((resolve) => setTimeout(resolve, 16));
          }
        };
        const waitForSelector = async (selector, timeoutMs = 10000) => {
          const deadline = performance.now() + timeoutMs;
          for (;;) {
            const el = document.querySelector(selector);
            if (el && isVisibleTarget(el)) return el;
            if (performance.now() >= deadline) return null;
            await new Promise((resolve) => setTimeout(resolve, 16));
          }
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
        const modalSubMinimumTargets = [];
        const modalContrastFailures = [];
        const modalSpillFailures = [];
        /**
         * auditContrastAllThemes() runs on whatever is in the DOM when it is
         * called, and it is called after the smoke list has opened and closed
         * every dialog -- so the twenty-nine dialogs' own text had never been
         * measured against any theme. That is where this bug lives: a fixed
         * colour reads fine on the theme it was picked on and goes to 2.28:1 on
         * the light one, which is exactly how two dialogs kept a hard-coded
         * amber through all four.
         *
         * Contrast is a property of the theme and the type scale, so the shell
         * does not change the answer and one viewport of each kind is enough.
         * Both are needed, not either: the desktop shell is where the shortcut
         * chips and category labels render, and the mobile one is where the
         * sheet-style dialogs and the home screen exist at all. Four themes
         * apiece, each with a forced full-page recalc, is too much to spend at
         * all eight.
         */
        const auditsModalContrast = ${(viewport.width === 1280 && viewport.height === 800)
          || (viewport.width === 768 && viewport.height === 1024)};
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
          // The banner renders at every viewport, so measure it on desktop too:
          // the last of the mobile-only audits without a counterpart.
          const subMinimumTargets = [];
          const waitForBanner = async (requireVisible = true) => {
            for (let i = 0; i < 30; i++) {
              const banner = document.querySelector('.pwa-install-banner');
              if (banner && (!requireVisible || isVisibleBox(banner))) return banner;
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

          /**
           * Start from no banner.
           *
           * The offline-ready handler only fills an empty slot -- it keeps
           * whatever is already up rather than replacing it -- and at the
           * mobile viewports something already is. The iPadOS check reads
           * platform === MacIntel together with more than one touch point,
           * which is right on a real iPad and also true of the headless
           * Chrome this sweep runs,
           * because setViewport turns on touch emulation with 5 touch points.
           * So every mobile pass opened on the iOS install card, offline-ready
           * declined to replace it, and the sweep reported the offline banner
           * as missing its own text and root state.
           *
           * Dismissing it is what a person on that iPad would do, and it sets
           * the dismissed flag so it does not come back mid-run.
           */
          // On a fresh desktop profile Chrome can offer installation while
          // the first-game rail hides that promo. It still owns the banner
          // state, so clear it before injecting the offline-ready event too.
          const preexisting = await waitForBanner(false);
          if (preexisting) {
            const dismissPreexisting = findButtonByLabel('Dismiss', preexisting);
            if (dismissPreexisting) {
              dismissPreexisting.click();
              await waitForFrames(4);
            }
            if (document.querySelector('.pwa-install-banner')) {
              failures.push('a banner was already showing and would not dismiss');
              return { failures, smallTouchTargets, subMinimumTargets };
            }
          }

          window.dispatchEvent(new Event('web-katrain:pwa-offline-ready'));
          await waitForFrames(4);
          let banner = await waitForBanner();

          /**
           * Below 500px tall there is meant to be no card at all.
           *
           * The card is fixed and the board reserves its height, and once the
           * board has shrunk as far as it goes the reserve stops holding: with
           * the update card up at 568x320 the board was pushed to top:4 under
           * the top bar and 171 of its intersections came back from
           * elementFromPoint as something else. So every card now hides under
           * a max-height: 499px media rule in index.css, and the smoke flow
           * below -- text, root state, reserved height, fits-in-viewport -- has
           * nothing to inspect. Assert the absence instead; the presence side
           * still runs at every viewport tall enough to have one.
           *
           * (No backticks in here: this comment lives inside the template
           * literal that carries the whole probe, and one would end it.)
           */
          if (innerHeight <= 499) {
            if (banner) failures.push('a card is showing below 500px tall, where the board has no room to give');
            // Not data-pwa-banner: the component still tracks which card it
            // would show, and the dashboard rule keyed on that attribute reads
            // --pwa-banner-height, which falls back to 0px when there is no
            // card to measure. Teaching the component the breakpoint would put
            // the same bound in two places. What must not happen is the board
            // giving up height for a card nobody can see:
            if (getComputedStyle(document.documentElement).getPropertyValue('--pwa-banner-height').trim()) {
              failures.push('board height reserved for a card that is not shown');
            }
            return { failures, smallTouchTargets, subMinimumTargets };
          }

          if (!banner) {
            const card = document.querySelector('.pwa-install-banner');
            failures.push('offline-ready banner missing: ' + JSON.stringify({
              cardPresent: !!card,
              display: card ? getComputedStyle(card).display : null,
              state: document.documentElement.dataset.pwaBanner,
              toasts: Array.from(document.querySelectorAll('.notification-toast')).map((el) => el.textContent),
            }));
            return { failures, smallTouchTargets, subMinimumTargets };
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
          else subMinimumTargets.push(...auditSubMinimumTargets(banner));

          window.dispatchEvent(new Event('web-katrain:pwa-update-ready'));
          await waitForFrames(4);
          banner = await waitForBanner();
          if (!banner) {
            failures.push('update-ready banner missing');
            return { failures, smallTouchTargets, subMinimumTargets };
          }
          if (document.documentElement.getAttribute('data-pwa-banner') !== 'update-ready') {
            failures.push('update-ready did not replace offline-ready banner');
          }
          if (!(banner.textContent || '').includes('Update ready')) {
            failures.push('update-ready banner text missing');
          }
          assertBannerFits(banner, 'update-ready');
          if (${viewport.mobile}) smallTouchTargets.push(...auditSmallTouchTargets(banner));
          else subMinimumTargets.push(...auditSubMinimumTargets(banner));

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
          return { failures, smallTouchTargets, subMinimumTargets };
        };
        const findButtonByLabel = (label, scope = document) => Array.from(scope.querySelectorAll('button')).find((candidate) => {
          const candidateLabel = targetLabel(candidate);
          return candidateLabel === label || candidateLabel.includes(label) || targetSearchText(candidate).includes(label);
        }) || null;
        /**
         * The board-from-photo action, under whichever name the current shell
         * prints on it: the desktop File menu item reads "Board from photo"
         * and the mobile Tools sheet reads "Photo Board".
         */
        const PHOTO_BOARD_LABELS = ['Board from photo', 'Photo Board'];
        const findPhotoBoardButton = (scope = document) => {
          for (const label of PHOTO_BOARD_LABELS) {
            const button = findButtonByLabel(label, scope);
            if (button) return button;
          }
          return null;
        };
        /**
         * Opens the photo-board dialog from whichever shell is on screen.
         *
         * Written once because it was written twice: the trace-import flow and
         * the photo-board dialog smoke had their own copies of this, and when
         * the menu item was renamed both went stale together.
         *
         * The desktop path opens the File menu to reach the item, so it has to
         * close it again when the item is not there. Throwing with the menu
         * still up leaves every later check measuring a shell with something
         * on top of it.
         */
        const openPhotoBoard = async () => {
          if (${viewport.mobile}) {
            const toolsButton = findButtonByLabel('Tools');
            if (!toolsButton) throw new Error('Tools button missing');
            toolsButton.click();
            const toolsDialog = await waitForSelector('[data-mobile-tools-dialog="true"]');
            if (!toolsDialog) throw new Error('Tools dialog did not open');
            const photoBoardButton = findPhotoBoardButton(toolsDialog);
            if (!photoBoardButton) throw new Error('photo board action missing in tools');
            photoBoardButton.click();
            await waitForFrames(2);
            return;
          }
          let photoBoardButton = findPhotoBoardButton();
          if (!photoBoardButton) {
            const moreFileActions = findButtonByLabel('More file actions');
            if (!moreFileActions) throw new Error('photo board action missing (no File menu)');
            moreFileActions.click();
            await waitForFrames(2);
            photoBoardButton = findPhotoBoardButton();
            if (!photoBoardButton) {
              await dismissTransientOverlays();
              throw new Error(
                'photo board action missing from the File menu (looked for '
                + PHOTO_BOARD_LABELS.join(' / ') + ')',
              );
            }
          }
          photoBoardButton.click();
          await waitForFrames(2);
        };
        /**
         * Puts the shell back to a clean state before a dialog check.
         *
         * A flow that throws part-way can leave a disclosure open behind it,
         * and every check after it then measures a shell with a menu on top.
         * One renamed File menu item reported twelve dialogs as "did not
         * open" -- none of which was true, and all of which hid the checks
         * that ran after them.
         *
         * Only popup triggers are dismissed. An aria-expanded="true" match on
         * its own would also catch the accordions and tree rows this sweep is
         * meant to find open, and collapsing those would change what it
         * measures; requiring aria-haspopup alongside it keeps this to menus.
         */
        const dismissTransientOverlays = async () => {
          const open = () => Array.from(document.querySelectorAll('[aria-haspopup][aria-expanded="true"]'));
          if (open().length === 0) return;
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          await waitForFrames(2);
          for (const trigger of open()) {
            trigger.click();
            await waitForFrames(2);
          }
        };
        const closeDialog = async (dialog, closeLabel) => {
          const button = findButtonByLabel(closeLabel, dialog);
          if (!button) return false;
          button.click();
          await waitForFrames(2);
          return true;
        };
        const smokeModal = async ({ name, selector, closeLabel, open, afterOpen }) => {
          try {
            // Whatever ran before this may have left a menu open over the
            // shell; measuring through one produces failures about this
            // dialog that are really about that menu.
            await dismissTransientOverlays();
            // Most of these open by dispatching a keyboard shortcut, which is a
            // fire-and-forget: if the app's handler is not listening yet the
            // key is simply lost, and the only symptom is "did not open".
            // Clicking can be retried and so can this -- try twice with a
            // shorter first wait before giving up, which costs nothing when the
            // first attempt works.
            let dialog = null;
            for (let attempt = 0; attempt < 2 && !dialog; attempt++) {
              await open();
              dialog = await waitForSelector(selector, attempt === 0 ? 4000 : 10000);
            }
            if (!dialog) {
              modalSmokeFailures.push(\`\${name} did not open\`);
              return;
            }
            if (${viewport.mobile}) {
              modalSmallTouchTargets.push(...auditSmallTouchTargets(dialog).map((target) => ({ ...target, modal: name })));
            } else {
              modalSubMinimumTargets.push(...auditSubMinimumTargets(dialog).map((target) => ({ ...target, modal: name })));
            }
            modalSpillFailures.push(...auditDialogSpill(dialog).map((entry) => name + ': ' + entry));
            if (auditsModalContrast) {
              modalContrastFailures.push(...auditContrastAllThemes(dialog).map((entry) => name + ' -- ' + entry));
            }
            if (afterOpen) await afterOpen(dialog);
            if (!(await closeDialog(dialog, closeLabel))) {
              modalSmokeFailures.push(\`\${name} close control missing\`);
            }
          } catch (error) {
            modalSmokeFailures.push(\`\${name}: \${error instanceof Error ? error.message : String(error)}\`);
          }
        };
        const runMobileToolsDialogSmoke = async () => {
          if (!${viewport.mobile}) return;
          const trigger = findButtonByLabel('Tools');
          if (!trigger) {
            modalSmokeFailures.push('mobile tools trigger missing');
            return;
          }
          const pointerActivate = (element, pointerId) => {
            element.dispatchEvent(new PointerEvent('pointerdown', {
              bubbles: true,
              cancelable: true,
              pointerId,
              pointerType: 'mouse',
              isPrimary: true,
              button: 0,
              buttons: 1,
            }));
            element.focus({ preventScroll: true });
            element.dispatchEvent(new PointerEvent('pointerup', {
              bubbles: true,
              cancelable: true,
              pointerId,
              pointerType: 'mouse',
              isPrimary: true,
              button: 0,
              buttons: 0,
            }));
            element.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              detail: 1,
            }));
          };

          try {
            pointerActivate(trigger, 31);
            await waitForFrames(3);
            const dialog = await waitForSelector('[data-mobile-tools-dialog="true"]');
            const panel = dialog?.querySelector('[data-mobile-tools-panel="true"]');
            const backdrop = dialog?.querySelector('[data-mobile-tools-backdrop="true"]');
            if (!dialog || !panel) {
              modalSmokeFailures.push('mobile tools dialog or panel missing');
              return;
            }
            if (!backdrop || backdrop.tagName === 'BUTTON' || backdrop.tabIndex >= 0) {
              modalSmokeFailures.push('mobile tools backdrop is keyboard-focusable');
            }

            const actionTargets = Array.from(panel.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [role="tab"]'))
              .filter((element) => {
                const style = getComputedStyle(element);
                const bounds = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
              })
              .map((element) => ({ element, bounds: element.getBoundingClientRect() }));
            modalSmallTouchTargets.push(...actionTargets
              .filter(({ bounds }) => bounds.width < 44 || bounds.height < 44)
              .map(({ element, bounds }) => ({
                modal: 'mobile tools',
                label: targetLabel(element),
                tag: element.tagName.toLowerCase(),
                width: bounds.width,
                height: bounds.height,
              })));

            const stickyHeader = panel.querySelector('[data-mobile-tools-header="true"]');
            const closeControl = stickyHeader?.querySelector('button[aria-label="Close tools"]');
            if (dialog.getAttribute('data-mobile-tools-focus-origin') !== 'pointer') {
              modalSmokeFailures.push('pointer-opened mobile tools displayed keyboard focus feedback');
            }
            if (document.activeElement !== closeControl) {
              modalSmokeFailures.push('mobile tools did not move focus to its close control');
            }
            if (closeControl && getComputedStyle(closeControl).outlineStyle !== 'none') {
              modalSmokeFailures.push('pointer-opened mobile tools left a keyboard ring on Close tools');
            }
            panel.scrollTop = panel.scrollHeight;
            await waitForFrames(2);
            const panelBounds = panel.getBoundingClientRect();
            const headerBounds = stickyHeader?.getBoundingClientRect();
            const closeBounds = closeControl?.getBoundingClientRect();
            if (!headerBounds || Math.abs(headerBounds.top - panelBounds.top) > 1) {
              modalSmokeFailures.push('mobile tools header does not stay pinned while scrolling');
            }
            if (!closeBounds || closeBounds.bottom <= panelBounds.top || closeBounds.top >= panelBounds.bottom) {
              modalSmokeFailures.push('mobile tools close control is not visible after scrolling');
            }
            panel.scrollTop = 0;
            await waitForFrames(2);

            const focusableSelector = [
              'a[href]:not([tabindex="-1"])',
              'button:not([disabled]):not([tabindex="-1"])',
              'input:not([disabled]):not([tabindex="-1"])',
              'select:not([disabled]):not([tabindex="-1"])',
              'textarea:not([disabled]):not([tabindex="-1"])',
              '[tabindex]:not([tabindex="-1"])',
            ].join(',');
            const focusableElements = Array.from(panel.querySelectorAll(focusableSelector))
              .filter((element) => element.getClientRects().length > 0);
            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];
            if (!first || !last) {
              modalSmokeFailures.push('mobile tools focusable controls missing');
              return;
            }
            first.focus({ preventScroll: true });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
            if (document.activeElement !== last) modalSmokeFailures.push('mobile tools Shift+Tab does not wrap');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
            if (document.activeElement !== first) modalSmokeFailures.push('mobile tools Tab does not wrap');
            first.click();
            await waitForFrames(3);
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (document.querySelector('[data-mobile-tools-dialog="true"]')) {
              modalSmokeFailures.push('mobile tools close control did not dismiss the dialog');
            }
            if (document.activeElement !== trigger) {
              modalSmokeFailures.push('mobile tools focus did not return to trigger');
            }
            if (trigger.closest('[data-mobile-tools-focus-origin]')?.getAttribute('data-mobile-tools-focus-origin') !== 'keyboard') {
              modalSmokeFailures.push('keyboard-closed mobile tools did not preserve keyboard focus feedback');
            }

            pointerActivate(trigger, 32);
            await waitForFrames(3);
            const pointerDialog = await waitForSelector('[data-mobile-tools-dialog="true"]');
            const pointerClose = pointerDialog?.querySelector('button[aria-label="Close tools"]');
            if (!pointerDialog || !pointerClose) {
              modalSmokeFailures.push('mobile tools did not reopen for pointer dismissal check');
              return;
            }
            pointerActivate(pointerClose, 33);
            await waitForFrames(3);
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (document.activeElement !== trigger) {
              modalSmokeFailures.push('pointer-closed mobile tools did not return focus to trigger');
            }
            if (trigger.closest('[data-mobile-tools-focus-origin]')?.getAttribute('data-mobile-tools-focus-origin') !== 'pointer') {
              modalSmokeFailures.push('pointer-closed mobile tools did not preserve pointer focus origin');
            }
            if (getComputedStyle(trigger).outlineStyle !== 'none') {
              modalSmokeFailures.push('pointer-closed mobile tools left a keyboard ring on Tools');
            }
            trigger.blur();
          } catch (error) {
            modalSmokeFailures.push(\`mobile tools: \${error instanceof Error ? error.message : String(error)}\`);
          }
        };
        const runMoveTreeEmptyStateSmoke = async () => {
          const failures = [];
          if (${viewport.mobile}) {
            const treeTab = Array.from(document.querySelectorAll('button[role="tab"]'))
              .find((button) => button.getAttribute('aria-label') === 'Tree');
            if (!treeTab) return ['move tree empty state: Tree tab missing'];
            treeTab.click();
            await waitForFrames(3);
          }

          const emptyState = document.querySelector('[data-move-tree-empty-state="true"]');
          if (!emptyState) {
            failures.push('move tree empty state is missing before the first move');
          } else {
            if (!emptyState.textContent?.includes('No moves yet')) {
              failures.push('move tree empty state title is missing');
            }
            if (!emptyState.textContent?.includes('Play on the board to start the game tree.')) {
              failures.push('move tree empty state guidance is missing');
            }
            const emptyContent = emptyState.querySelector('.move-tree-empty-state-content');
            const clippingParent = emptyState.parentElement;
            if (!emptyContent || !clippingParent) {
              failures.push('move tree empty state content wrapper is missing');
            } else {
              const contentBounds = emptyContent.getBoundingClientRect();
              const stateBounds = emptyState.getBoundingClientRect();
              const clipBounds = clippingParent.getBoundingClientRect();
              const visibleTop = Math.max(stateBounds.top, clipBounds.top);
              const visibleBottom = Math.min(stateBounds.bottom, clipBounds.bottom);
              if (contentBounds.top < visibleTop - 1 || contentBounds.bottom > visibleBottom + 1) {
                failures.push('move tree empty state content is clipped by its compact panel');
              }
            }
          }

          if (${viewport.mobile}) {
            const playFirstMove = emptyState
              ? findButtonByLabel('Play first move', emptyState)
              : null;
            if (!playFirstMove) {
              failures.push('move tree empty state Play first move action is missing');
            } else {
              const bounds = playFirstMove.getBoundingClientRect();
              if (bounds.width < 44 || bounds.height < 44) {
                failures.push('move tree empty action is too small (' + Math.round(bounds.width) + 'x' + Math.round(bounds.height) + 'px)');
              }
              playFirstMove.click();
              await waitForFrames(3);
              const boardTab = Array.from(document.querySelectorAll('button[role="tab"]'))
                .find((button) => button.getAttribute('aria-label') === 'Board');
              if (boardTab?.getAttribute('aria-selected') !== 'true') {
                failures.push('move tree empty action did not return to Board');
              }
            }
          }
          return failures;
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
          await waitForCondition(() => (
            document.querySelector('[data-board-snapshot="true"]')?.getAttribute('data-board-theme') === nextTheme
            && nextChoice.getAttribute('aria-checked') === 'true'
          ));
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
          await waitForCondition(() => (
            selector.value === 'ja'
            && document.documentElement.lang === 'ja'
            && document.documentElement.getAttribute('data-locale') === 'ja'
          ));
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
            // Same retry as smokeModal, and for the same reason: opening this
            // goes through a menu on mobile and a lazily-loaded dialog on both,
            // so a single attempt turns a slow render into "did not open". This
            // was the last thing still failing under CPU throttling once the
            // shell-readiness wait was in place.
            let dialog = null;
            for (let attempt = 0; attempt < 2 && !dialog; attempt++) {
              await openPhotoBoard();
              dialog = await waitForSelector('[aria-labelledby="photo-board-title"]', attempt === 0 ? 4000 : 10000);
            }
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
            const sensitivity = dialog.querySelector('[data-photo-board-auto-trace-sensitivity="true"]');
            if (!sensitivity) {
              failures.push('auto trace sensitivity control missing');
            } else {
              const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              if (valueSetter) valueSetter.call(sensitivity, '75');
              else sensitivity.value = '75';
              sensitivity.dispatchEvent(new Event('input', { bubbles: true }));
              sensitivity.dispatchEvent(new Event('change', { bubbles: true }));
              await waitForFrames(2);
              const displayedSensitivity = dialog.querySelector('[data-photo-board-auto-trace-sensitivity-value="true"]');
              if (sensitivity.value !== '75') failures.push('auto trace sensitivity input did not keep value');
              if (!displayedSensitivity || !(displayedSensitivity.textContent || '').includes('75')) {
                failures.push('auto trace sensitivity value missing');
              }
            }
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
        const scorePanelSubMinimumTargets = [];
        let scorePanelReachable = true;
        const bottomMoreSheetSmoke = ${viewport.mobile}
          ? await runBottomMoreSheetSmoke()
          : { failures: [], smallTouchTargets: [] };
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
          return label.includes('Open SGF edit tools') || label.includes('Edit position');
        }) || null;
        const editToolsReachable = ${viewport.mobile} ? !!editButton : true;
        const smallTouchTargets = ${viewport.mobile} ? auditSmallTouchTargets() : [];
        const auditMobileBottomControlOverlaps = () => {
          const controls = document.querySelector('.mobile-bottom-controls');
          if (!controls) return [];
          const targets = Array.from(controls.querySelectorAll('button'))
            .filter(isVisibleTarget)
            .map((el) => ({ el, r: rect(el) }))
            .sort((a, b) => a.r.left - b.r.left);
          const overlaps = [];
          for (let firstIndex = 0; firstIndex < targets.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < targets.length; secondIndex += 1) {
              const first = targets[firstIndex];
              const second = targets[secondIndex];
              if (!intersects(first.r, second.r)) continue;
              overlaps.push({
                first: targetLabel(first.el),
                second: targetLabel(second.el),
                width: Math.min(first.r.right, second.r.right) - Math.max(first.r.left, second.r.left),
              });
            }
          }
          return overlaps;
        };
        const mobileBottomControlOverlaps = ${viewport.mobile} ? auditMobileBottomControlOverlaps() : [];
        const boardTouchAction = board ? getComputedStyle(board).touchAction : '';
        const moveTreeEmptyStateFailures = await runMoveTreeEmptyStateSmoke();
        let noteEditorReachable = true;
        let noteEditorKeyboardAware = true;
        let noteEditorLifecycleFailures = [];
        // The tree tab drops its back button's label and tightens the padding,
        // which had left that control 36px wide. The empty-state smoke below
        // only measures the empty state's own action, so nothing covered the
        // tab's chrome once the tree had content.
        let treeSmallTouchTargets = [];
        if (${viewport.mobile}) {
          const treeTab = Array.from(document.querySelectorAll('button[role="tab"]')).find((button) => button.getAttribute('aria-label') === 'Tree');
          treeTab?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          treeSmallTouchTargets = auditSmallTouchTargets();
          const backToBoardTab = Array.from(document.querySelectorAll('button[role="tab"]')).find((button) => button.getAttribute('aria-label') === 'Board');
          backToBoardTab?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        let reviewSmallTouchTargets = [];
        if (${viewport.mobile}) {
          const reviewTab = Array.from(document.querySelectorAll('button[role="tab"]')).find((button) => button.getAttribute('aria-label') === 'Review');
          reviewTab?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          reviewSmallTouchTargets = auditSmallTouchTargets();
          // An empty note has no Edit button: the preview area is the affordance
          // there, carrying role="button" and the "Add note" label. This mirrors
          // openEditor() in the lifecycle smoke below, which already handles both.
          (
            document.querySelector('[data-note-edit="true"]') ||
            document.querySelector('[data-note-preview="true"]')
          )?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
        // The tab bar wears role="tablist", which promises one stop in the tab
        // order with the arrows moving inside it. It used to keep all four tabs
        // in the sequence and ignore the arrows entirely -- buttons wearing tab
        // roles. Both halves are checked here because neither works alone: a
        // roving tabIndex with no arrow handler traps focus on one tab.
        let mobileTabKeyboardFailures = [];
        if (${viewport.mobile}) {
          const tabList = document.querySelector('[role="tablist"][aria-label="Main sections"]');
          const readTabs = () => Array.from(tabList?.querySelectorAll('[role="tab"]') ?? []);
          const pressKey = async (key) => {
            document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          };
          const tabButtons = readTabs();
          if (tabButtons.length < 2) {
            mobileTabKeyboardFailures.push('expected a tab list of at least two tabs, saw ' + tabButtons.length);
          } else {
            const inTabOrder = tabButtons.filter((tab) => tab.tabIndex === 0);
            if (inTabOrder.length !== 1) {
              mobileTabKeyboardFailures.push(inTabOrder.length + ' tabs are in the tab order, expected exactly 1');
            } else if (inTabOrder[0].getAttribute('aria-selected') !== 'true') {
              mobileTabKeyboardFailures.push('the tab in the tab order is not the selected one');
            }

            tabButtons[0].focus();
            if (document.activeElement !== tabButtons[0]) {
              mobileTabKeyboardFailures.push('the first tab could not take focus');
            }
            await pressKey('ArrowRight');
            if (document.activeElement !== tabButtons[1]) {
              mobileTabKeyboardFailures.push('ArrowRight did not move focus to the next tab');
            }
            if (tabButtons[1].getAttribute('aria-selected') !== 'true') {
              mobileTabKeyboardFailures.push('ArrowRight moved focus without selecting the tab');
            }
            // Wrapping matters: the practices ask for a cycle, and the last tab
            // is where a keyboard user most easily gets stuck.
            await pressKey('End');
            const lastTab = tabButtons[tabButtons.length - 1];
            if (document.activeElement !== lastTab) {
              mobileTabKeyboardFailures.push('End did not move focus to the last tab');
            }
            await pressKey('ArrowRight');
            if (document.activeElement !== tabButtons[0]) {
              mobileTabKeyboardFailures.push('ArrowRight did not wrap from the last tab to the first');
            }
            await pressKey('Home');
            if (document.activeElement !== tabButtons[0]) {
              mobileTabKeyboardFailures.push('Home did not move focus to the first tab');
            }
          }
          const backToBoard = readTabs().find((tab) => tab.getAttribute('aria-label') === 'Board');
          backToBoard?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        // Each tab has to name a panel that is really there, and that panel has
        // to name the tab back. The invariant is checked in every tab state
        // rather than once, because the library panel is mounted only while its
        // own tab is active -- so a fixed aria-controls on that tab dangles in
        // three states out of four, which is worse for a screen reader than
        // having no aria-controls at all. Counting attributes would have missed
        // that; resolving them does not.
        let mobileTabPanelFailures = [];
        if (${viewport.mobile}) {
          const tabNames = ['Board', 'Tree', 'Review', 'Library'];
          for (const name of tabNames) {
            const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((candidate) => candidate.getAttribute('aria-label') === name);
            if (!tab) { mobileTabPanelFailures.push('tab missing: ' + name); continue; }
            tab.click();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            const allTabs = Array.from(document.querySelectorAll('[role="tab"]'));
            for (const candidate of allTabs) {
              const controls = candidate.getAttribute('aria-controls');
              if (controls && !document.getElementById(controls)) {
                mobileTabPanelFailures.push('with ' + name + ' active, ' + candidate.getAttribute('aria-label') + ' points at missing #' + controls);
              }
            }

            const controlled = tab.getAttribute('aria-controls');
            if (!controlled) {
              mobileTabPanelFailures.push(name + ' is active but controls nothing');
              continue;
            }
            const panel = document.getElementById(controlled);
            if (!panel) {
              mobileTabPanelFailures.push(name + ' controls missing #' + controlled);
              continue;
            }
            if (panel.getAttribute('role') !== 'tabpanel') {
              mobileTabPanelFailures.push(name + ' controls #' + controlled + ' which is not a tabpanel');
            }
            if (panel.getAttribute('aria-labelledby') !== tab.id) {
              mobileTabPanelFailures.push(name + ' panel is labelled by ' + panel.getAttribute('aria-labelledby') + ', expected ' + tab.id);
            }
          }
          const returnToBoard = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) => tab.getAttribute('aria-label') === 'Board');
          returnToBoard?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        let editModeSmallTouchTargets = [];
        let editModeBoardTouchAction = 'none';
        if (${viewport.mobile} && editButton) {
          const currentEditButton = Array.from(document.querySelectorAll('button')).find((button) => {
            const label = targetSearchText(button);
            return label.includes('Open SGF edit tools') || label.includes('Edit position');
          });
          currentEditButton?.click();
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
        // The block above only runs on mobile, so desktop edit mode had never
        // been entered here — and its fixed-position rail was clearing the 50px
        // header but not the game strip under it, hiding both player entries for
        // as long as edit mode stayed open.
        let desktopEditPanelOverlaps = [];
        if (!${viewport.mobile} && editButton) {
          const openEdit = Array.from(document.querySelectorAll('button')).find((button) => {
            const label = targetSearchText(button);
            return label.includes('Open SGF edit tools') || label.includes('Edit position');
          });
          openEdit?.click();
          await waitForFrames(2);
          const editPanel = document.querySelector('.edit-toolbar-panel');
          const gameStrip = document.querySelector('.gamestrip');
          const panelRect = rect(editPanel);
          if (panelRect && gameStrip && intersects(panelRect, rect(gameStrip))) {
            const covered = Array.from(gameStrip.querySelectorAll('.gs-player, .gs-fact, .gs-file, .gs-save'))
              .filter((el) => intersects(panelRect, rect(el)))
              .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24));
            desktopEditPanelOverlaps = covered.length > 0 ? covered : ['game strip'];
          }
          const closeEdit = Array.from(document.querySelectorAll('button')).find((button) =>
            targetSearchText(button).includes('Close edit mode'));
          closeEdit?.click();
          await waitForFrames(2);
        }
        await runMobileToolsDialogSmoke();
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
        // The two most-opened dialogs in the app after the report, and neither
        // was in this list: the suite has never checked that they open, that
        // they carry a close control, or that their targets clear 44px. Both
        // are read-only, so a smoke pass leaves the game exactly as it found
        // it -- which is why New game is still not here, Ctrl+N being a
        // question about the game on the board.
        await smokeModal({
          name: 'command palette',
          selector: '[aria-labelledby="command-palette-title"]',
          closeLabel: 'Close command palette',
          open: async () => {
            dispatchShortcut('k', { ctrlKey: true });
            await waitForFrames(2);
          },
        });
        await smokeModal({
          name: 'game re-analysis',
          selector: '[aria-labelledby="game-analysis-title"]',
          closeLabel: 'Close game analysis',
          open: async () => {
            dispatchShortcut('F2');
            await waitForFrames(2);
          },
        });
        // Most of the app's dialogs have no shortcut of their own, which is why
        // this list stayed at ten of twenty-nine. The palette is how a user
        // reaches them, and it is smoke-tested just above, so it opens them
        // here too. A missing command simply opens nothing, which smokeModal
        // already reports as "did not open".
        const openViaPalette = (commandId) => async () => {
          dispatchShortcut('k', { ctrlKey: true });
          await waitForFrames(2);
          document.querySelector('[data-command-palette-item="' + commandId + '"]')?.click();
          await waitForFrames(2);
        };
        // Three read-only dialogs: they render, they do not touch the game, and
        // a smoke pass leaves the board exactly as it found it.
        await smokeModal({
          name: 'about',
          selector: '[aria-labelledby="about-title"]',
          closeLabel: 'Close about dialog',
          open: openViaPalette('about'),
        });
        await smokeModal({
          name: 'lessons',
          selector: '[aria-labelledby="lessons-title"]',
          closeLabel: 'Close lessons',
          open: openViaPalette('lessons'),
          afterOpen: async (dialog) => {
            const capture = Array.from(dialog.querySelectorAll('.lessons-list button'))
              .find((button) => button.textContent.includes('Capturing a stone'));
            if (!capture) throw new Error('capture lesson missing');
            capture.click();
            await waitForFrames(2);
            const next = Array.from(dialog.querySelectorAll('.lessons-footer button'))
              .find((button) => button.textContent.trim() === 'Next');
            if (!next) throw new Error('capture lesson Next control missing');
            next.focus();
            next.click();
            await waitForFrames(2);
            if (!dialog.contains(document.activeElement)) {
              throw new Error('advancing to the exercise lost keyboard focus outside the lesson');
            }
            const answer = dialog.querySelector('.lessons-board circle[fill="transparent"][cx="4.7"][cy="4.7"]');
            if (!answer) throw new Error('capture lesson answer missing');
            answer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await waitForFrames(2);
            if (dialog.querySelectorAll('.lessons-board circle[fill="url(#sb-white)"]').length !== 0 ||
                dialog.querySelectorAll('.lessons-board circle[fill="url(#sb-black)"]').length !== 4) {
              throw new Error('correct answer did not place Black and remove the captured White stone');
            }
            if (!dialog.querySelector('[role="status"]')?.textContent.includes('Captured')) {
              throw new Error('capture result is not announced');
            }
            if (auditsModalContrast) {
              modalContrastFailures.push(...auditContrastAllThemes(dialog).map((entry) => 'solved lesson -- ' + entry));
            }
          },
        });
        await smokeModal({
          name: 'pro games',
          selector: '[aria-labelledby="pro-games-title"]',
          closeLabel: 'Close pro game library',
          open: openViaPalette('pro-games'),
        });
        // Two more that only act on submit, so opening and closing one changes
        // nothing: the print preview renders the kifu it would print, and the
        // save dialog writes to the library only when its form is submitted.
        await smokeModal({
          name: 'kifu print',
          selector: '[aria-labelledby="kifu-print-title"]',
          closeLabel: 'Close kifu print',
          open: openViaPalette('print-kifu'),
        });
        await smokeModal({
          name: 'save to library',
          selector: '[aria-labelledby="save-to-library-title"]',
          closeLabel: 'Close save to Library',
          open: openViaPalette('save-library'),
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
            } else {
              modalSubMinimumTargets.push(...auditSubMinimumTargets(guideDialog).map((target) => ({ ...target, modal: 'report guide' })));
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
              menuButton.focus({ preventScroll: true });
              menuButton.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                detail: 1,
              }));
              let menuDialog = await waitForSelector('[aria-labelledby="menu-title"]');
              if (!menuDialog) throw new Error('Menu drawer did not open');
              await waitForFrames(3);
              const menuCloseButton = findButtonByLabel('Close menu', menuDialog);
              if (!menuCloseButton) {
                modalSmokeFailures.push('menu drawer close control missing');
              } else {
                if (menuDialog.getAttribute('data-menu-focus-origin') !== 'pointer') {
                  modalSmokeFailures.push('pointer-opened menu drawer displayed keyboard focus feedback');
                }
                if (document.activeElement !== menuCloseButton) {
                  modalSmokeFailures.push('menu drawer did not move focus to its close control');
                }
                if (getComputedStyle(menuCloseButton).outlineStyle !== 'none') {
                  modalSmokeFailures.push('pointer-opened menu drawer left a keyboard ring on its close control');
                }
                menuCloseButton.dispatchEvent(new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  detail: 1,
                }));
                await waitForFrames(3);
                await new Promise((resolve) => setTimeout(resolve, 0));
                if (document.activeElement !== menuButton) {
                  modalSmokeFailures.push('menu drawer did not restore focus to Menu');
                }
                if (menuButton.getAttribute('data-menu-restored-focus-origin') !== 'pointer') {
                  modalSmokeFailures.push('pointer-closed menu drawer did not preserve pointer focus origin');
                }
                if (getComputedStyle(menuButton).outlineStyle !== 'none') {
                  modalSmokeFailures.push('pointer-closed menu drawer left a keyboard ring on Menu');
                }
                menuButton.dispatchEvent(new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  detail: 1,
                }));
                menuDialog = await waitForSelector('[aria-labelledby="menu-title"]');
                if (!menuDialog) throw new Error('Menu drawer did not reopen');
                await waitForFrames(3);
              }
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
              } else {
                modalSubMinimumTargets.push(...auditSubMinimumTargets(dialog).map((target) => ({ ...target, modal: \`settings \${tabLabel}\` })));
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
          open: openPhotoBoard,
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
        if (${viewport.mobile}) {
          const shortLandscape = innerHeight <= 520 && innerWidth > innerHeight;
          if (shortLandscape) {
            const toolsButton = findButtonByLabel('Tools');
            toolsButton?.click();
            await waitForFrames(2);
            const toolsDialog = await waitForSelector('[data-mobile-tools-dialog="true"]');
            const settingsButton = toolsDialog ? findButtonByLabel('Settings', toolsDialog) : null;
            settingsButton?.click();
            await waitForFrames(2);
            const settingsDialog = await waitForSelector('[aria-labelledby="settings-title"]');
            const aiTab = settingsDialog ? findButtonByLabel('AI/Engine', settingsDialog) : null;
            aiTab?.click();
            await waitForFrames(2);
            if (!settingsDialog?.querySelector('#settings-katago-visits')) {
              analysisDepthReachable = false;
              analysisDepthFailures.push('landscape depth setting not reachable');
            }
            if (settingsDialog && !(await closeDialog(settingsDialog, 'Close settings'))) {
              analysisDepthFailures.push('settings close control missing');
            }
          } else {
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
                analysisDepthFailures.push(commandBar ? 'depth control missing' : 'analysis command bar did not open');
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
                  if (depthPopover.querySelectorAll('[data-analysis-live-depth-option]').length < 4) analysisDepthFailures.push('preset options missing');
                  if (!depthPopover.querySelector('.analysis-command-bar__depth-help')) analysisDepthFailures.push('depth help missing');
                  if (!depthPopover.querySelector('.analysis-command-bar__depth-slider')) analysisDepthFailures.push('depth slider missing');
                  if (!depthPopover.querySelector('.analysis-command-bar__depth-input')) analysisDepthFailures.push('exact visits input missing');
                  analysisDepthSmallTouchTargets.push(...auditSmallTouchTargets(depthPopover));
                  if (!(await closeDialog(depthPopover, 'Close live depth selector'))) analysisDepthFailures.push('close control missing');
                }
              }
            }
          }
        } else {
          const engineButton = document.querySelector('#wk-engine-pill');
          if (!engineButton) {
            analysisDepthReachable = false;
            analysisDepthFailures.push('engine control missing');
          } else {
            engineButton.click();
            await waitForFrames(2);
            const depthPresets = await waitForSelector('[data-analysis-live-visit-presets="true"]');
            if (!depthPresets) {
              analysisDepthReachable = false;
              analysisDepthFailures.push('desktop depth presets did not open');
            } else if (depthPresets.querySelectorAll('[data-analysis-live-depth-option]').length < 4) {
              analysisDepthFailures.push('desktop preset options missing');
            }
            document.querySelector('.scrim')?.click();
            await waitForFrames(2);
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
            // The panel is opened at every viewport, but only its mobile
            // targets were ever measured — the last of the mobile-only audits
            // with no desktop counterpart.
            if (${viewport.mobile}) {
              scorePanelSmallTouchTargets.push(...auditSmallTouchTargets(scorePanel));
            } else {
              scorePanelSubMinimumTargets.push(...auditSubMinimumTargets(scorePanel));
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
        const boardCoverageFailures = auditBoardCoverage();
        const postMoveMobileStatus = ${viewport.mobile}
          ? {
              turnVisible: isVisibleBox(document.querySelector('[data-mobile-turn-chip="true"]')),
              saveVisible: isVisibleBox(document.querySelector('[data-mobile-save-status="true"]')),
              overlaps: auditMobileBottomControlOverlaps(),
            }
          : { turnVisible: true, saveVisible: false, overlaps: [] };
        const libraryPanel = document.querySelector('[data-layout-panel="library"]') || document.querySelector('.wk-dashboard .library');
        const sidePanel = document.querySelector('[data-layout-panel="side"]') || document.querySelector('.wk-dashboard .sidebar');
        // Every notification assertion below used to read an empty slot. Info
        // and success toasts clear themselves after 2500ms, and by the time
        // this block ran the flows that raise them were long past — so
        // notificationToast was null, intersects(null, ...) was false, and all
        // four checks passed no matter what the app did. Raise one here
        // instead. Ctrl+C is the right trigger: the clipboard is unavailable
        // headless, so it produces an *error* toast, and errors are the one
        // type that never auto-dismisses. It also moves nothing on screen,
        // unlike entering edit mode, which shifts the board into its rail.
        dispatchShortcut('c', { ctrlKey: true });
        await waitForFrames(3);
        const notificationToast = document.querySelector('.notification-toast');
        const notificationToastRect = rect(notificationToast);
        const notificationMessage = notificationToast?.querySelector('.notification-toast-message')?.textContent?.trim() || '';
        const notificationType = notificationToast?.getAttribute('data-notification-type') || '';
        const dashboardGameStripTargets = Array.from(document.querySelectorAll('.wk-dashboard .gamestrip > *'))
          .filter(isVisibleTarget);
        const dashboardMetricClipping = dashboard ? Array.from(dashboard.querySelectorAll('.cb-metric'))
          .filter((metric) => Array.from(metric.children).some((child) => {
            const style = getComputedStyle(child);
            return style.display !== 'none' && child.scrollWidth > child.clientWidth + 1;
          }))
          .map((metric) => metric.innerText.replace(/\s+/g, ' ').trim()) : [];
        const analysisMetrics = document.querySelector('.analysis-command-bar__metrics');
        const analysisMetricsRect = rect(analysisMetrics);
        const analysisPrimaryMetricsFullyVisible = !analysisMetricsRect || Array.from(
          analysisMetrics.querySelectorAll('.analysis-command-bar__metric')
        ).slice(0, 2).every((metric) => {
          const metricRect = rect(metric);
          return metricRect && metricRect.left >= analysisMetricsRect.left - 1 && metricRect.right <= analysisMetricsRect.right + 1;
        });
        return {
          viewport: '${viewport.width}x${viewport.height}',
          // isDesktopLayoutSize, with its bounds read from the source rather
          // than copied: the app needs width AND height, so a wide but short
          // window is still the mobile shell. Checking width alone aimed
          // desktop assertions at it.
          desktop: ${isDesktopViewport(viewport)},
          innerWidth,
          innerHeight,
          documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          topBar: topBarRect,
          topControlsOutOfBar,
          topControlsOutOfBarDetails,
          dashboardHeaderSmallTargets,
          dashboardBoardActionSmallTargets,
          dashboardSubMinimumTargets,
          dashboardNavbarWrapped,
          dashboardGameStripWrapped,
          dashboardCommandbarHeight: rect(dashboard?.querySelector('.commandbar'))?.height ?? 0,
          dashboardMetricClipping,
          mobileTurnIndicator,
          postMoveMobileStatus,
          analysisPrimaryMetricsFullyVisible,
          topToggle: rect(topToggle),
          editToolbar: rect(editToolbar),
          board: rect(board),
          libraryPanel: rect(libraryPanel),
          sidePanel: rect(sidePanel),
          notificationToast: notificationToastRect,
          notificationMessage,
          notificationType,
          mobileNotificationTooWide: ${viewport.mobile} && notificationMessage === 'Edit mode off.' && (notificationToastRect?.width ?? 0) > Math.min(320, innerWidth - 24),
          notificationOverlapsSidePanel: intersects(notificationToastRect, rect(sidePanel)),
          notificationOverlapsBoard: intersects(notificationToastRect, rect(board)),
          notificationOverlapsGameStripControl: dashboardGameStripTargets.some((target) => intersects(notificationToastRect, rect(target))),
          missingFileActions: requiredFileActions
            .filter((names) => !names.some((label) => allButtons.some((button) => button.getAttribute('aria-label') === label)))
            .map((names) => names[0]),
          viewMenuReachable: !!Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('View')),
          actionsMenuReachable: !!dashboard || !!Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Actions')),
          toolsReachable: !!Array.from(document.querySelectorAll('button')).find((button) => (button.getAttribute('aria-label') || button.getAttribute('title') || '') === 'Tools'),
          editToolsReachable,
          noteEditorReachable,
          noteEditorKeyboardAware,
          noteEditorLifecycleFailures,
          mobileTabKeyboardFailures,
          mobileTabPanelFailures,
          navigationSmokeFailures,
          captureSmokeFailures,
          fullscreenSmokeFailures,
          pwaBannerFailures: pwaBannerSmoke.failures,
          pwaBannerSmallTouchTargets: pwaBannerSmoke.smallTouchTargets,
          pwaBannerSubMinimumTargets: pwaBannerSmoke.subMinimumTargets,
          photoBoardTraceImportFailures,
          boardThemeSmokeFailures,
          localeSmokeFailures,
          // The state word is the whole point of the pill; the backend detail
          // is already dropped below 640px. Truncating "Loading" to "Load..."
          // reads as breakage, so the pill has to fit the word it is showing.
          engineStatusClipped: (() => {
            const text = document.querySelector('.analysis-command-bar__status-text');
            if (!text) return null;
            if (text.scrollWidth <= text.clientWidth + 1) return null;
            return (text.textContent || '').trim().slice(0, 24) + ' needs ' + Math.round(text.scrollWidth) + 'px in ' + Math.round(text.clientWidth) + 'px';
          })(),
          truncationFailures: ${TRUNCATION_AUDIT},
          unnamedControls: ${UNNAMED_CONTROL_AUDIT},
          contrastFailures: auditContrastAllThemes(),
          modalContrastFailures,
          modalSpillFailures,
          treeSmallTouchTargets,
          reviewSmallTouchTargets,
          boardTouchAction,
          smallTouchTargets,
          mobileBottomControlOverlaps,
          bottomMoreSheetFailures: bottomMoreSheetSmoke.failures,
          bottomMoreSheetSmallTouchTargets: bottomMoreSheetSmoke.smallTouchTargets,
          editModeBoardTouchAction,
          editModeSmallTouchTargets,
          modalSmokeFailures,
          modalSmallTouchTargets,
          modalSubMinimumTargets,
          clipboardSmokeFailures,
          editToolSmokeFailures,
          desktopEditPanelOverlaps,
          scorePanelReachable,
          scorePanelFailures,
          scorePanelSmallTouchTargets,
          scorePanelSubMinimumTargets,
          analysisDepthReachable,
          analysisDepthFailures,
          analysisDepthSmallTouchTargets,
          boardInteractionFailures,
          boardCoverageFailures,
          moveTreeEmptyStateFailures,
          commandBarOverlaps,
          topToggleOverTopBar: intersects(rect(topToggle), topBarRect),
          topToggleOverEditToolbar: intersects(rect(topToggle), rect(editToolbar)),
        };
      })()`);
      result.defaultBoard = defaultLayout.board;
      result.defaultBoardCanvasTopInset = defaultLayout.boardCanvasTopInset;
      result.defaultBoardCanvasBottomInset = defaultLayout.boardCanvasBottomInset;
      result.defaultBoardContainerAlign = defaultLayout.boardContainerAlign;
      result.defaultIdleAnalysisSlotHeight = defaultLayout.idleAnalysisSlotHeight;
      result.defaultDocumentOverflow = defaultLayout.documentOverflow;
      result.deadAriaRefs = await evaluate(cdp, `(() => {
        const out = [];
        for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns']) {
          for (const el of document.querySelectorAll('[' + attr + ']')) {
            const raw = (el.getAttribute(attr) || '').trim();
            if (!raw) continue;
            for (const id of raw.split(/\\s+/)) {
              if (!document.getElementById(id)) {
                out.push({ attr, id, on: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30) });
              }
            }
          }
        }
        return out;
      })()`);
      result.duplicateIds = await evaluate(cdp, `(() => {
        const seen = new Map();
        for (const el of document.querySelectorAll('[id]')) {
          const id = el.id;
          if (!id) continue;
          seen.set(id, (seen.get(id) || 0) + 1);
        }
        return [...seen].filter(([, n]) => n > 1).map(([id, n]) => id + ' x' + n);
      })()`);
      // The nav bar's density tiers key on the board column, and docking the
      // library takes 300px off that column without moving the viewport — so
      // the wrap check above only ever ran in the configuration that fits.
      // Dock the library, measure, put it back.
      if (result.desktop) {
        result.navbarWithLibrary = await evaluate(cdp, `(async () => {
          const dashboard = document.querySelector('.wk-dashboard');
          // Only the wide layout docks the library into its own column; below
          // that it is a drawer over the board, which squeezes nothing and
          // leaves a scrim the rest of this run would have to click through.
          if (dashboard?.dataset.layout !== 'wide') return null;
          const key = 'web-katrain:library_open:v1';
          const restore = localStorage.getItem(key);
          const findButton = (label) => Array.from(document.querySelectorAll('button'))
            .find((button) => (button.getAttribute('aria-label') || '') === label);
          // Measure whatever state we find: if an earlier step already docked
          // the library, toggling it here would close the very thing we came
          // to measure and the probe would report nothing.
          const alreadyOpen = dashboard.dataset.library === 'open';
          const show = alreadyOpen ? null : findButton('Show library');
          if (!alreadyOpen && !show) return null;
          if (show) show.click();
          await new Promise((resolve) => setTimeout(resolve, 400));
          const navbar = document.querySelector('.wk-dashboard .navbar');
          const pass = navbar?.querySelector('.pass-btn');
          const play = navbar?.querySelector('.playactions');
          const column = document.querySelector('.wk-dashboard .board-col');
          const boardWithLibrary = document.querySelector('[data-board-snapshot="true"]');
          const out = {
            columnWidth: column ? column.getBoundingClientRect().width : null,
            navbarHeight: navbar ? navbar.getBoundingClientRect().height : null,
            boardWidth: boardWithLibrary ? boardWithLibrary.getBoundingClientRect().width : null,
            wrapped: pass && play
              ? Math.abs(pass.getBoundingClientRect().top - play.getBoundingClientRect().top) > 2
              : false,
          };
          // The panel is a lazy chunk, and the 400ms above is enough for the
          // column to have a width and not enough for a row to exist. Waiting
          // on the name elements themselves rather than on any row: a row
          // appears one render before the name inside it, and auditing between
          // the two passes on nothing.
          for (let i = 0; i < 40 && !document.querySelector('.library-tree-node-name'); i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          out.libraryNames = document.querySelectorAll('.library-tree-node-name').length;
          out.truncation = ${TRUNCATION_AUDIT};
          if (!alreadyOpen) {
            const hide = findButton('Hide library');
            if (hide) hide.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
          // The open state is persisted, so leaving it set would carry the
          // drawer — and its scrim — into the next viewport's whole run.
          out.stillOpen = !alreadyOpen && document.querySelector('.wk-dashboard')?.dataset.library === 'open';
          if (restore === null) localStorage.removeItem(key); else localStorage.setItem(key, restore);
          return out;
        })()`);
      }
      result.layoutShift = layoutShift;
      result.pageErrors = [...new Set(pageErrors)];
      /**
       * Every viewport gets measured, even after one of them fails.
       *
       * This used to throw straight out of the loop, so the first bad
       * viewport was the only one anyone ever saw -- and since each fix
       * routinely uncovers a failure that was already there behind it, a
       * red sweep took as many full runs to clear as it had problems.
       * Viewports do not share state (each one re-navigates and clears the
       * auto-save key above), so there is nothing to protect by stopping.
       */
      try {
        assertViewport(result);
      } catch (error) {
        viewportFailures.push(error.message);
      }
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(
        path.join(screenshotDir, `${viewport.width}x${viewport.height}-qa-state.png`),
        Buffer.from(screenshot.result.data, 'base64')
      );
      results.push(result);
    }
    if (viewportFailures.length > 0) {
      cdp.close();
      throw new Error(
        `${viewportFailures.length} viewport(s) failed:\n  - ${viewportFailures.join('\n  - ')}`,
      );
    }
    await assertShellVariantApplies(cdp);
    await assertDialogsFitShortViewports(cdp);
    await assertLongMetadataStaysRecoverable(cdp);
    await assertPwaCardsClearTheBoard(cdp, `http://127.0.0.1:${appPort}/`);
    await assertAutoSaveRecoveryFits(cdp, `http://127.0.0.1:${appPort}/`);
    await assertScoreQuizRequests(cdp);
    await assertStaticBoardScroll(cdp);
    cdp.close();
    console.log(`Viewport checks passed. Screenshots: ${screenshotDir}`);
    for (const result of results) {
      const board = result.defaultBoard ?? result.board;
      console.log(`${result.viewport}: board ${Math.round(board.width)}x${Math.round(board.height)}`);
    }
  } finally {
    if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
      const closed = new Promise((resolve) => chrome.once('exit', resolve));
      chrome.kill('SIGTERM');
      await closed;
    }
    await server?.close();
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
