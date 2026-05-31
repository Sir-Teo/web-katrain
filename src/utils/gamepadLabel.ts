export function formatGamepadLabel(name: string | null | undefined, maxLength = 24): string {
  const normalized = (name ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Gamepad';
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
