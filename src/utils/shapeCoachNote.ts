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

export function appendShapeCoachNoteBlock(note: string, block: string): string {
  const trimmedBlock = block.trim();
  if (!trimmedBlock) return note;
  if (note.includes(trimmedBlock)) return note;

  const trimmedNote = note.trimEnd();
  return trimmedNote ? `${trimmedNote}\n\n${trimmedBlock}` : trimmedBlock;
}
