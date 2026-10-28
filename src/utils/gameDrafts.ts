/** Requests recovery persistence after a pending game edit is committed. */
export const GAME_DRAFT_COMMITTED_EVENT = 'web-katrain:game-draft-committed';

export const GAME_DRAFT_COMMIT_REQUEST_EVENT = 'web-katrain:commit-game-drafts';

/** Finish open editors before a user-requested save or export takes its snapshot. */
export function commitPendingGameDrafts(): void {
  window.dispatchEvent(new Event(GAME_DRAFT_COMMIT_REQUEST_EVENT));
}
