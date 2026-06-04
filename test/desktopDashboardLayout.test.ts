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

  it('surfaces build metadata from the dashboard view menu', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');

    expect(source).toContain('APP_BUILD_LABEL');
    expect(source).toContain('APP_COMMIT_URL');
    expect(source).toContain('data-dashboard-build-link="true"');
    expect(source).toContain('Open build commit');
  });

  it('keeps a compact build identity visible in the dashboard header', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(dashboardSource).toContain('APP_INFO');
    expect(dashboardSource).toContain('data-dashboard-build-chip="true"');
    expect(dashboardSource).toContain('v{APP_INFO.version}');
    expect(css).toContain('.wk-dashboard .build-chip');
    expect(css).toContain('max-width: 84px;');
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
    const dashboardLibraryEnd = layoutSource.indexOf('sidebarOpen={showSidebar}', dashboardLibraryStart);
    const dashboardLibraryBlock = layoutSource.slice(dashboardLibraryStart, dashboardLibraryEnd);

    expect(layoutSource).toContain('libraryWidth={leftPanelWidth}');
    expect(dashboardLibraryBlock).toContain('<LibraryPanel');
    expect(dashboardLibraryBlock).not.toContain('width={leftPanelWidth}');
  });

  it('keeps direct Copy SGF access in the desktop dashboard header', () => {
    const dashboardSource = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(dashboardSource).toContain('onCopySgf: () => void');
    expect(dashboardSource).toContain('aria-label="Copy SGF"');
    expect(dashboardSource).toContain('onClick={onCopySgf}');
    expect(layoutSource).toContain('onCopySgf={handleCopySgf}');
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
    expect(analysisBlock).toContain('aria-label={legend.winrate ? \'Hide win rate graph\' : \'Show win rate graph\'}');
    expect(analysisBlock).toContain('aria-label={legend.score ? \'Hide score graph\' : \'Show score graph\'}');
    expect(analysisBlock).toContain('aria-label={legendOpen ? \'Hide move-quality legend\' : \'Show move-quality legend\'}');
    expect(analysisBlock).toContain('aria-controls="dashboard-analysis-quality-legend"');
    expect(analysisBlock).toContain("overlayBtn('analysisShowHints', 'Top moves', 'layers', settings.analysisShowPolicy)");
    expect(analysisBlock).toContain('aria-label="Run quick graph analysis"');
    expect(analysisBlock).toContain('aria-label={dashboardFastMctsLabel}');
    expect(analysisBlock).toContain('aria-label="Open game report"');
  });
});
