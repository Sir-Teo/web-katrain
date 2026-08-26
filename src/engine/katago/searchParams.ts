// Mirrors KataGo analysis defaults (see cpp/configs/analysis_example.cfg).
export const ROOT_POLICY_OPTIMISM = 0.2;
export const POLICY_OPTIMISM = 1.0;

/** KataGo humanSLProfile values this app offers, in the order they are shown. */
export const KATAGO_HUMAN_PROFILES: string[] = [
  'rank_20k', 'rank_15k', 'rank_10k', 'rank_8k', 'rank_5k', 'rank_3k', 'rank_1k',
  'rank_1d', 'rank_3d', 'rank_5d', 'rank_7d', 'rank_9d',
  'preaz_5k', 'preaz_1d', 'preaz_9d',
  'proyear_1900', 'proyear_1950', 'proyear_1980', 'proyear_2000', 'proyear_2020',
];
export const KATAGO_HUMAN_PROFILE_DEFAULT = 'rank_5k';
