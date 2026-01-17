export function getEngineModelLabel(
  engineModelName: string | null | undefined,
  modelUrl: string | null | undefined
): string | null {
  if (engineModelName?.trim()) return engineModelName.trim();
  const rawUrl = modelUrl?.trim();
  if (!rawUrl) return null;
  const cleanUrl = rawUrl.split('#')[0]?.split('?')[0] ?? rawUrl;
  const base = cleanUrl.split('/').pop();
  if (!base) return null;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}
