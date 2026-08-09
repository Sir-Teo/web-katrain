export const APP_REPOSITORY_URL = 'https://github.com/Sir-Teo/web-katrain';

export interface VersionMetadata {
  name: string;
  version: string;
  gitHash: string;
  commitDate: string;
  buildDate: string;
  repository: string;
}

export function createVersionMetadata({
  version,
  commit,
  commitDate,
  buildDate,
}: {
  version: string;
  commit: string;
  commitDate: string;
  buildDate: string;
}): VersionMetadata {
  return {
    name: 'Web KaTrain',
    version,
    gitHash: commit,
    commitDate,
    buildDate,
    repository: APP_REPOSITORY_URL,
  };
}
