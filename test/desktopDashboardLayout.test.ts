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
});
