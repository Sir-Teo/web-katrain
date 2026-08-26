import { describe, expect, it } from 'vitest';
import { describeHumanProfile } from '../src/utils/humanProfileLabel';

// KataGo's humanSLProfile ids are for the engine, not for people: `rank_5k`,
// `preaz_1d`, `proyear_1950`. The settings and report show these instead.
describe('describeHumanProfile', () => {
  it('reads ranks as words', () => {
    expect(describeHumanProfile('rank_5k')).toBe('5 kyu');
    expect(describeHumanProfile('rank_1d')).toBe('1 dan');
    expect(describeHumanProfile('rank_20k')).toBe('20 kyu');
  });

  it('marks the pre-AlphaGo profiles', () => {
    expect(describeHumanProfile('preaz_9d')).toBe('9 dan (pre-AlphaGo style)');
  });

  it('reads the historical pro profiles by year', () => {
    expect(describeHumanProfile('proyear_1900')).toBe('Pro, 1900');
    expect(describeHumanProfile('proyear_2020')).toBe('Pro, 2020');
  });

  it('handles the asymmetric two-rank form', () => {
    expect(describeHumanProfile('rank_3d_5k')).toBe('3 dan vs 5 kyu');
  });

  it('leaves anything it does not recognise alone', () => {
    expect(describeHumanProfile('something_else')).toBe('something_else');
    expect(describeHumanProfile('rank_weird')).toBe('weird');
  });
});
