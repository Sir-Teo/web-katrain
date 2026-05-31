type PrintableTarget = {
  print?: () => void;
};

export function printWindow(target?: PrintableTarget | null): boolean {
  try {
    const source = target ?? (typeof window !== 'undefined' ? window : null);
    const print = source?.print;
    if (typeof print !== 'function') return false;
    print.call(source);
    return true;
  } catch {
    return false;
  }
}
