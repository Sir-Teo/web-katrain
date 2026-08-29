import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every workflow in this repo has to set up the same Node major.
 *
 * They did not. `ci.yml` used 20 and `deploy-pages.yml` used 24, so a pull
 * request was verified on one major while the thing that actually ships was
 * built on another — a change that works on 20 and breaks on 24 passes review
 * and fails the deploy, and one that merely *behaves* differently ships
 * silently. The README's advice to use Node 24 locally matched the deploy and
 * not the check.
 *
 * Nothing else would catch this: each workflow is valid on its own, and the two
 * are never read side by side.
 */
const workflowDir = path.resolve(__dirname, '..', '.github', 'workflows');

function nodeVersionsIn(source: string): string[] {
  return [...source.matchAll(/node-version:\s*["']?([\d.]+)["']?/g)].map((match) => match[1]!);
}

describe('workflow Node versions', () => {
  const files = fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name));

  it('finds workflows to check', () => {
    expect(files.length).toBeGreaterThan(1);
  });

  it('sets up the same Node major everywhere', () => {
    const byFile = files.map((name) => ({
      name,
      versions: nodeVersionsIn(fs.readFileSync(path.join(workflowDir, name), 'utf8')),
    }));

    const majors = new Set(
      byFile.flatMap((entry) => entry.versions.map((version) => version.split('.')[0]))
    );

    expect(
      [...majors],
      `workflows disagree: ${byFile.map((e) => `${e.name}=${e.versions.join(',') || 'none'}`).join(' ')}`
    ).toHaveLength(1);
  });

  it('matches the version the README tells a reader to use', () => {
    const readme = fs.readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8');
    const claimed = readme.match(/Use Node\.js (\d+)/);
    expect(claimed, 'the README no longer states a Node version').toBeTruthy();

    const workflowMajor = nodeVersionsIn(
      fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8')
    )[0]?.split('.')[0];
    expect(claimed![1]).toBe(workflowMajor);
  });
});
