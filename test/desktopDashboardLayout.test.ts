import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDashboardLayoutMode } from '../src/utils/dashboardLayout';

describe('desktop dashboard layout', () => {
  it('uses the expected visual layout breakpoints', () => {
    expect(getDashboardLayoutMode(1280)).toBe('wide');
    expect(getDashboardLayoutMode(1200)).toBe('wide');
    expect(getDashboardLayoutMode(1024)).toBe('compact');
    expect(getDashboardLayoutMode(820)).toBe('compact');
    expect(getDashboardLayoutMode(819)).toBe('narrow');
  });

  it('does not reopen persisted panel choices while reacting to viewport changes', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const responsiveStart = source.indexOf('// ---- responsive mode ----');
    const responsiveEnd = source.indexOf('const libDrawer', responsiveStart);
    const responsiveBlock = source.slice(responsiveStart, responsiveEnd);

    expect(responsiveBlock).toContain('const nextMode = getDashboardLayoutMode(window.innerWidth)');
    expect(responsiveBlock).toContain('setLayoutMode(nextMode)');
    expect(responsiveBlock).not.toContain('setLibraryOpen(true');
    expect(responsiveBlock).not.toContain('setSidebarOpen(true');
  });

  it('keeps the board-first Library affordance visibly discoverable', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(dashboardSource).toContain('!libraryOpen && <span className="edge-toggle-label">Library</span>');
    expect(css).toContain('.wk-dashboard .edge-toggle.left:not(.open):has(.edge-toggle-label)');
    expect(css).toContain('writing-mode: vertical-rl;');
  });

  it('keeps first-run actions in a compact, non-overlapping board rail', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(dashboardSource).toContain('data-dashboard-hero="true"');
    expect(dashboardSource).toContain('<div className="hero-title">Start here</div>');
    expect(dashboardSource).not.toContain('className="hero-tips"');
    expect(css).toContain('grid-template-rows: minmax(0, 1fr) auto;');
    expect(css).toContain('min-height: 46px;');
    expect(css).toContain('flex-wrap: nowrap;');
  });

  it('surfaces build metadata from the dashboard view menu', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const menuStart = source.indexOf('const ViewMenu');
    const viewMenu = source.slice(menuStart);

    expect(viewMenu).toContain("item('Coordinates'");
    expect(viewMenu).toContain("item('Library panel'");
    expect(viewMenu).toContain("item('Analysis panel'");
    // Settings and About each already have a dedicated home (the header icon
    // cluster and the Help popover), so the menu does not repeat them.
    expect(viewMenu).not.toContain("item('Settings'");
    expect(viewMenu).not.toContain("item('About'");
    // The build link does belong here: it is the only place build metadata
    // lives now that the header no longer carries a version chip.
    expect(viewMenu).toContain('data-dashboard-build-link');
  });

  it('keeps build identity out of the primary header and in the dashboard menu', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(dashboardSource).not.toContain('data-dashboard-build-chip="true"');
    expect(dashboardSource).toContain('data-dashboard-build-link="true"');
    expect(css).not.toContain('.wk-dashboard .build-chip');
  });

  it('keeps primary desktop header icon targets at the standard 32px size', () => {
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(css).toMatch(/\.wk-dashboard \.iconbtn \{\s*width: 32px; height: 32px;/);
    expect(css).not.toContain('.wk-dashboard .iconcluster .iconbtn { width: 28px; height: 28px; }');
  });

  it('keeps frequent desktop board actions at the standard 32px height', () => {
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(css).toMatch(/\.wk-dashboard \.board-chip \{[^}]*height: 32px;/);
    expect(css).not.toMatch(/\.wk-dashboard \.board-chip \{[^}]*height: 28px;/);
  });

  it('compacts play actions before the standard desktop command bar wraps', () => {
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(css).toContain('@container boardcol (max-width: 919px)');
    expect(css).toContain('.wk-dashboard .playactions .tbtn { padding: 0 9px; }');
  });

  it('mounts the full library manager inside the desktop dashboard library column', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');
    const librarySource = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(dashboardSource).toContain('libraryPanel?: React.ReactNode');
    expect(dashboardSource).toContain("libraryPanel ? ' full-library' : ''");
    expect(dashboardSource).toContain('libraryPanel ?? (');
    expect(layoutSource).toContain('libraryPanel={');
    expect(layoutSource).toContain('showCloseButtonOnDesktop');
    expect(librarySource).toContain('aria-label="Import SGF, ZIP, or board image files"');
  });

  it('lets the dashboard library container own embedded panel width', () => {
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');
    const dashboardLibraryStart = layoutSource.indexOf('libraryPanel={');
    const dashboardLibraryEnd = layoutSource.indexOf('sidebarOpen={showSidebar', dashboardLibraryStart);
    const dashboardLibraryBlock = layoutSource.slice(dashboardLibraryStart, dashboardLibraryEnd);

    expect(layoutSource).toContain('libraryWidth={leftPanelWidth}');
    expect(dashboardLibraryBlock).toContain('<LibraryPanel');
    expect(dashboardLibraryBlock).not.toContain('width={leftPanelWidth}');
  });

  it('keeps Copy SGF access in the desktop dashboard File menu', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(dashboardSource).toContain('onCopySgf: () => void');
    expect(dashboardSource).toContain('aria-label="More file actions"');
    expect(dashboardSource).toContain('<span className="mi-label">Copy SGF</span>');
    expect(dashboardSource).toContain('onClick={() => { closePop(); onCopySgf(); }}');
    expect(layoutSource).toContain('onCopySgf={handleCopySgf}');
  });

  it('does not mount the analysis button bar inside the desktop goban frame', () => {
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');
    const dashboardBoardStart = layoutSource.indexOf('board={');
    const dashboardBoardEnd = layoutSource.indexOf('boardControls={', dashboardBoardStart);
    const dashboardBoardSlot = layoutSource.slice(dashboardBoardStart, dashboardBoardEnd);
    const dashboardControlsEnd = layoutSource.indexOf('blackName={blackName}', dashboardBoardEnd);
    const dashboardControlsSlot = layoutSource.slice(dashboardBoardEnd, dashboardControlsEnd);

    expect(dashboardBoardSlot).toContain('<GoBoard');
    expect(dashboardBoardSlot).not.toContain('<AnalysisCommandBar');
    expect(dashboardBoardSlot).not.toContain('<EditToolbar');
    expect(dashboardBoardSlot).not.toContain('<ManualScorePanel');
    expect(dashboardBoardSlot).not.toContain('<NotificationToast');
    expect(dashboardControlsSlot).toContain('<EditToolbar');
    expect(dashboardControlsSlot).toContain('<ManualScorePanel');
    expect(dashboardControlsSlot).toContain('docked');
  });

  it('keeps desktop move-number editing keyboard-local and bounded', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const moveCounterStart = dashboardSource.indexOf('<div className="move-counter">');
    const moveCounterEnd = dashboardSource.indexOf('<div className="navgroup">', moveCounterStart);
    const moveCounterBlock = dashboardSource.slice(moveCounterStart, moveCounterEnd);

    expect(moveCounterBlock).toContain('type="number"');
    expect(moveCounterBlock).toContain('aria-label="Move number"');
    expect(moveCounterBlock).toContain('inputMode="numeric"');
    expect(moveCounterBlock).toContain('min={0}');
    expect(moveCounterBlock).toContain('max={totalMoves}');
    expect(moveCounterBlock).toContain("e.key === 'Escape'");
    expect(moveCounterBlock).toContain('e.stopPropagation()');
    expect(moveCounterBlock).toContain('e.preventDefault()');
    expect(moveCounterBlock).toContain('Number.isInteger(n)');
    expect(moveCounterBlock).toContain('e.currentTarget.blur()');
  });

  it('renders desktop branch indices with the shared one-based branch model', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const gameTreeStart = dashboardSource.indexOf('{/* Game tree */}');
    const gameTreeEnd = dashboardSource.indexOf('{/* Analysis */}', gameTreeStart);
    const gameTreeBlock = dashboardSource.slice(gameTreeStart, gameTreeEnd);

    expect(gameTreeBlock).toContain('{branchInfo.currentIndex}/{branchInfo.totalBranches}');
    expect(gameTreeBlock).not.toContain('branchInfo.currentIndex + 1');
  });

  it('labels visible dashboard tree and analysis toolbar controls', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const gameTreeStart = dashboardSource.indexOf('{/* Game tree */}');
    const analysisStart = dashboardSource.indexOf('{/* Analysis */}', gameTreeStart);
    const notesStart = dashboardSource.indexOf('{/* Comment / notes */}', analysisStart);
    const gameTreeBlock = dashboardSource.slice(gameTreeStart, analysisStart);
    const analysisBlock = dashboardSource.slice(analysisStart, notesStart);

    expect(gameTreeBlock).toContain('aria-label="Previous branch"');
    expect(gameTreeBlock).toContain('aria-label="Next branch"');
    expect(gameTreeBlock).toContain('aria-label="Back to branch point"');
    expect(gameTreeBlock).toContain('aria-label="Make current move the main branch"');
    expect(gameTreeBlock).toContain("className={branchInfo.hasBranches ? 'pbtn pico' : 'hidden'}");
    expect(gameTreeBlock).toContain('branchInfo.hasBranches && branchInfo.currentIndex > 1');
    expect(analysisBlock).toContain('aria-label={legend.winrate ? \'Hide win rate graph\' : \'Show win rate graph\'}');
    expect(analysisBlock).toContain('aria-label={legend.score ? \'Hide score graph\' : \'Show score graph\'}');
    expect(analysisBlock).toContain('aria-label={legendOpen ? \'Hide move-quality legend\' : \'Show move-quality legend\'}');
    expect(analysisBlock).toContain('aria-controls="dashboard-analysis-quality-legend"');
    expect(analysisBlock).toContain("overlayBtn('analysisShowHints', 'Top moves', 'layers', settings.analysisShowPolicy)");
    expect(analysisBlock).toContain('aria-label="Run quick graph analysis"');
    expect(analysisBlock).toContain('aria-label={dashboardFastMctsLabel}');
    expect(analysisBlock).toContain('aria-label="Open game report"');
  });

  it('keeps section actions outside the disclosure button', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const helperStart = dashboardSource.indexOf('const sectionHead =');
    const helperEnd = dashboardSource.indexOf('// ---- overlay toggle helper ----', helperStart);
    const helper = dashboardSource.slice(helperStart, helperEnd);

    expect(helper).toContain('className="section-head-toggle"');
    expect(helper).toContain('aria-expanded={sections[key]}');
    expect(helper).toContain('<div className="saction">{actions}</div>');
    expect(helper).not.toContain('role="button"');
  });

  it('exposes View menu toggle state without adding visual clutter', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const viewMenuStart = dashboardSource.indexOf('const ViewMenu:');
    const viewMenu = dashboardSource.slice(viewMenuStart);

    expect(viewMenu).toContain("aria-pressed={typeof on === 'boolean' ? on : undefined}");
  });
});
