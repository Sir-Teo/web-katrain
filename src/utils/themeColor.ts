/**
 * Keeps <meta name="theme-color"> on the theme the app is actually wearing.
 *
 * The tag shipped a fixed #101827, which is the background of none of the four
 * themes -- so Android Chrome's address bar and the task-switcher card sat in a
 * navy that belonged to nothing, and under the Light theme a near-white app ran
 * beneath a dark bar.
 *
 * It follows --ui-bar rather than --ui-bg because the browser's chrome abuts
 * the app's top bar, and matching that is what closes the seam. The value is
 * read back out of the cascade instead of being listed here, so a theme can be
 * added or retuned in one place.
 */
export function syncThemeColorMeta(doc: Document = document): void {
  const root = doc.documentElement;
  // defaultView rather than the global getComputedStyle: the document owns the
  // styles being read, and a detached one has no view to read them from.
  const view = doc.defaultView;
  if (!root || !view) return;
  const color = view.getComputedStyle(root).getPropertyValue('--ui-bar').trim();
  // An empty string is what a stylesheet that has not landed yet gives back;
  // leaving the shipped value alone beats writing an empty content attribute.
  if (!color) return;
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.appendChild(meta);
  }
  if (meta.content !== color) meta.content = color;
}
