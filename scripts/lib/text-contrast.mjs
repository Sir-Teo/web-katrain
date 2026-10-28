// Serialized into browser checks. Keep the function self-contained so every
// caller measures computed text, including opacity, against its real surface.
export function auditTextContrast(skipSelector, scope) {
  const parseColor = value => {
    let match = value?.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    }
    match = value?.match(/color\(srgb\s+([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a: parts[3] ?? 1 };
  };
  const over = (fg, bg) => {
    const alpha = fg.a + bg.a * (1 - fg.a);
    if (!alpha) return { r: 0, g: 0, b: 0, a: 0 };
    const channel = key => (fg[key] * fg.a + bg[key] * bg.a * (1 - fg.a)) / alpha;
    return { r: channel('r'), g: channel('g'), b: channel('b'), a: alpha };
  };
  const luminance = color => {
    const channel = value => {
      const v = value / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  };
  const failures = [];
  const seen = new Set();
  for (const el of (scope ?? document).querySelectorAll('*')) {
    if (el.children.length) continue;
    const text = el.textContent?.trim() ?? '';
    if (text.length < 2) continue;
    if (el.closest('[data-board-snapshot="true"],canvas,svg')) continue;
    // Inactive controls and their associated labels are exempt from WCAG text
    // contrast. Other explanatory copy still has to be readable.
    if (el.closest(':disabled,[aria-disabled="true"]')) continue;
    if (el.closest('label')?.control?.matches(':disabled,[aria-disabled="true"]')) continue;
    if (skipSelector && el.closest(skipSelector)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    let foreground = parseColor(style.color);
    if (!foreground) continue;
    let background = { r: 0, g: 0, b: 0, a: 0 };
    let opacity = 1;
    // Compose the text pixel and a neighboring background pixel separately.
    // Opacity on an ancestor applies to the whole group, including its surface.
    for (let node = el; node; node = node.parentElement) {
      const current = getComputedStyle(node);
      const surface = parseColor(current.backgroundColor);
      if (surface) {
        foreground = over(foreground, surface);
        background = over(background, surface);
      }
      const layerOpacity = Number(current.opacity);
      opacity *= layerOpacity;
      foreground.a *= layerOpacity;
      background.a *= layerOpacity;
    }
    if (opacity === 0) continue;
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const first = luminance(over(foreground, white));
    const second = luminance(over(background, white));
    const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    const size = Number.parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const required = large ? 3 : 4.5;
    if (ratio + 0.05 >= required) continue;
    const key = `${String(el.className?.baseVal ?? el.className)}|${style.color}|${opacity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push(`${text.slice(0, 24)} ${ratio.toFixed(2)}:1 (needs ${required}:1)`);
  }
  return failures;
}
