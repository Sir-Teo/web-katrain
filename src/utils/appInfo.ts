import { APP_REPOSITORY_URL } from './versionMetadata';

export { APP_REPOSITORY_URL };
export const APP_ISSUE_REPORT_URL = `${APP_REPOSITORY_URL}/issues/new/choose`;

export const APP_INFO = {
  name: 'web-KaTrain',
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  commitDate: __APP_COMMIT_DATE__,
};

export function buildCommitUrl(commit: string): string | null {
  return /^[0-9a-f]{7,40}$/i.test(commit) ? `${APP_REPOSITORY_URL}/commit/${commit}` : null;
}

export const APP_BUILD_LABEL = `v${APP_INFO.version} · ${APP_INFO.commit}${
  APP_INFO.commitDate ? ` · ${APP_INFO.commitDate}` : ''
}`;
export const APP_COMMIT_URL = buildCommitUrl(APP_INFO.commit);
