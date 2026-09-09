export const APP_NAME = 'Web KaTrain';

/** Longest a name may be before the title elides it. Browsers truncate a tab
    to a few words anyway; the point is to keep the app name from being pushed
    out of a title bar by an SGF that carries a paragraph in PB. */
const MAX_SUBJECT = 60;

const clean = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const elide = (value: string): string =>
  value.length <= MAX_SUBJECT ? value : `${value.slice(0, MAX_SUBJECT - 1).trimEnd()}…`;

/**
 * What the browser tab should say.
 *
 * It said "Web KaTrain" and nothing else, for every game and every tab. This
 * app invites having several open -- a game under review, a bot game, a
 * position being drilled -- and they were indistinguishable in the tab strip.
 *
 * The open file names the tab when there is one, players name it otherwise,
 * and a leading dot marks unsaved work the way an editor does.
 */
export function buildDocumentTitle(game: {
  fileName?: string | null;
  blackName?: string | null;
  whiteName?: string | null;
  dirty?: boolean;
}): string {
  const fileName = clean(game.fileName);
  const black = clean(game.blackName);
  const white = clean(game.whiteName);

  // Players only when at least one is named: "Black vs White" is what an empty
  // board already looks like, and says less than the app's own name.
  const players = black || white ? `${black || 'Black'} vs ${white || 'White'}` : '';
  const subject = elide(fileName || players);
  if (!subject) return APP_NAME;
  return `${game.dirty ? '• ' : ''}${subject} — ${APP_NAME}`;
}
