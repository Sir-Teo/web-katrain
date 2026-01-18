const DEFAULT_SELECTOR = '[data-board-snapshot="true"]';

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const parseBackgroundImageUrl = (value: string): string | null => {
  if (!value || value === 'none') return null;
  const match = /url\(["']?(.+?)["']?\)/.exec(value);
  return match ? match[1] ?? null : null;
};

export async function captureBoardSnapshot(selector = DEFAULT_SELECTOR): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const board = document.querySelector<HTMLElement>(selector);
  if (!board) return null;

  const rect = board.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width <= 0 || height <= 0) return null;

  const canvas = document.createElement('canvas');
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);

  const style = window.getComputedStyle(board);
  const bgColor = style.backgroundColor || '#d1b17c';
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const bgUrl = parseBackgroundImageUrl(style.backgroundImage);
  if (bgUrl) {
    try {
      const img = await loadImage(bgUrl);
      ctx.drawImage(img, 0, 0, width, height);
    } catch {
      // Ignore texture load errors.
    }
  }

  const boardRect = rect;
  const layers = Array.from(board.querySelectorAll('canvas')).map((layer) => {
    const layerStyle = window.getComputedStyle(layer);
    const zIndex = Number.parseInt(layerStyle.zIndex || '0', 10) || 0;
    return { layer, zIndex };
  });

  layers.sort((a, b) => a.zIndex - b.zIndex);

  for (const { layer } of layers) {
    const layerRect = layer.getBoundingClientRect();
    const x = layerRect.left - boardRect.left;
    const y = layerRect.top - boardRect.top;
    const w = layerRect.width;
    const h = layerRect.height;
    if (w <= 0 || h <= 0) continue;
    try {
      ctx.drawImage(layer, x, y, w, h);
    } catch {
      // Ignore draw errors (e.g. tainted canvas).
    }
  }

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
