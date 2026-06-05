import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_ISSUE_REPORT_URL } from '../src/utils/appInfo';

describe('DesktopDashboard', () => {
  it('keeps the primary desktop shell wired to issue reporting', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const icons = readFileSync('src/components/dashboard/icons.tsx', 'utf8');

    expect(source).toContain('APP_ISSUE_REPORT_URL');
    expect(source).toContain('data-dashboard-report-issue="true"');
    expect(source).toContain('aria-label="Report an issue on GitHub"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain('<Icon name="bug" />');
    expect(icons).toContain('bug:');
    expect(APP_ISSUE_REPORT_URL).toBe('https://github.com/Sir-Teo/web-katrain/issues/new/choose');
  });

  it('keeps the language switcher on the wide desktop dashboard header', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(source).toContain("import { LanguageSwitcher } from '../layout/LanguageSwitcher';");
    expect(source).toContain('className="dashboard-language-switcher"');
    expect(source).toContain('onLocaleChange={(appLocale) => updateSettings({ appLocale })}');
    expect(css).toContain('.wk-dashboard .dashboard-language-switcher');
    expect(css).toContain('.wk-dashboard[data-layout="compact"] .dashboard-language-switcher');
  });
});
