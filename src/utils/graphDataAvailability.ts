export function hasFiniteGraphData(values: readonly number[]): boolean {
  return values.some((value) => Number.isFinite(value));
}

export function hasVisibleGraphData(args: {
  showScore: boolean;
  showWinrate: boolean;
  scoreValues: readonly number[];
  winrateValues: readonly number[];
}): boolean {
  return (
    (args.showScore && hasFiniteGraphData(args.scoreValues)) ||
    (args.showWinrate && hasFiniteGraphData(args.winrateValues))
  );
}
