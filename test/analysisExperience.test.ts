import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('analysis experience disclosure', () => {
  it('shares one persisted Coach and Pro choice across desktop and mobile shells', () => {
    const toggle = readFileSync('src/components/AnalysisExperienceToggle.tsx', 'utf8');
    const desktop = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const mobile = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');
    const store = readFileSync('src/store/gameStore.ts', 'utf8');

    expect(toggle).toContain("updateSettings({ analysisExperience: 'coach' })");
    expect(toggle).toContain("updateSettings({ analysisExperience: 'pro' })");
    expect(toggle).toContain('aria-label="Analysis detail"');
    expect(desktop).toContain('<AnalysisExperienceToggle />');
    expect(mobile).toContain('actions: <AnalysisExperienceToggle />');
    expect(store).toContain("analysisExperience: 'coach'");
  });

  it('rejects corrupt stored disclosure values', () => {
    const store = readFileSync('src/store/gameStore.ts', 'utf8');
    expect(store).toContain("experience !== 'coach' && experience !== 'pro'");
  });
});
