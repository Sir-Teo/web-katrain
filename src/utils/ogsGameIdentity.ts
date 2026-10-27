export const OGS_SYNC_GAME_ID_MARKER = /\(ogs-(\d+)\)/;

const validId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Prefer retained source identity; accept old synced filenames for migration. */
export const getOgsGameId = (item: { name: string; ogsGameId?: unknown }): number | undefined => {
  if (validId(item.ogsGameId)) return item.ogsGameId;
  const match = OGS_SYNC_GAME_ID_MARKER.exec(item.name);
  const legacyId = match ? Number(match[1]) : undefined;
  return validId(legacyId) ? legacyId : undefined;
};
