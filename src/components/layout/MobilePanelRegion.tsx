import type { ReactNode } from 'react';

/** Tab panels need a named landmark when they cover the board's main landmark. */
export function MobilePanelRegion({ isMobile, visible = true, label, children }: {
  isMobile: boolean;
  visible?: boolean;
  label: string;
  children: ReactNode;
}) {
  return isMobile
    ? <section aria-label={label} className={visible ? 'fixed inset-0 z-40 flex min-h-0 flex-col' : 'hidden'}>{children}</section>
    : children;
}
