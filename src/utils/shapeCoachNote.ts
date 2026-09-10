import type { MoveInsight, MoveInsightCoach } from './moveInsight';

export function formatShapeCoachNoteBlock(insight: MoveInsight, coach: MoveInsightCoach): string {
  const lines = [
    `### Shape coach: ${insight.label}`,
    `- Beginner: ${coach.beginner}`,
    `- Pro: ${coach.pro}`,
    `- Checks: ${coach.checks.join(', ')}`,
  ];

  if (insight.learnMoreUrl) {
    lines.push(`- Learn: [${insight.label}](${insight.learnMoreUrl})`);
  }

  return lines.join('\n');
}

/**
 * Add a generated block to a note, once. Not specific to the shape coach —
 * the board diagram uses it too, which is why it is no longer named for one
 * of its callers.
 */
export function appendNoteBlock(note: string, block: string): string {
  const trimmedBlock = block.trim();
  if (!trimmedBlock) return note;
  if (note.includes(trimmedBlock)) return note;

  const trimmedNote = note.trimEnd();
  return trimmedNote ? `${trimmedNote}\n\n${trimmedBlock}` : trimmedBlock;
}
