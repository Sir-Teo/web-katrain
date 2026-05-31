export function smoothAnalysisGraphValues(values: readonly number[]): number[] {
  return values.map((value, index) => {
    const previous = index > 0 ? values[index - 1] : undefined;
    if (!Number.isFinite(value) || typeof previous !== 'number' || !Number.isFinite(previous)) return value;
    return (previous + value) / 2;
  });
}
