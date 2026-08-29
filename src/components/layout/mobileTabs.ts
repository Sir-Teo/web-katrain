/**
 * The mobile tab bar's shared vocabulary: which tabs exist, and which element
 * each one reveals.
 *
 * This lives apart from `MobileTabBar.tsx` because the panels are in three
 * different components -- `Layout` wraps the board, `RightPanel` holds tree and
 * review, `LibraryPanel` holds the library -- and all of them need these ids.
 * Importing them from the component file put constants alongside a component
 * export, which breaks fast refresh; the lint rule that says so is right, and
 * the sibling repos keep their shared helpers in their own modules too.
 *
 * A tab whose `aria-controls` points at nothing is worse than a tab with none:
 * it promises a destination that does not exist. One file, one source of truth.
 */

export type MobileTab = 'board' | 'tree' | 'info' | 'library';

/**
 * Tree and Review share one container on purpose. Two tabs may name the same
 * panel; what matters is that the panel names whichever tab is currently
 * active back, which is what `aria-labelledby` does at each site.
 */
export const MOBILE_TAB_PANEL_IDS: Record<MobileTab, string> = {
    board: 'mobile-panel-board',
    tree: 'mobile-panel-side',
    info: 'mobile-panel-side',
    library: 'mobile-panel-library',
};

export const mobileTabId = (tab: MobileTab): string => `mobile-tab-${tab}`;

/**
 * Panels that exist only while their own tab is active.
 *
 * `LibraryPanel` is mounted on entry and unmounted on the way out, so for three
 * of the four tab states `mobile-panel-library` is simply not in the document.
 * A tab that keeps pointing at it the whole time is making a promise it cannot
 * keep, which is the one outcome worse than having no `aria-controls` at all --
 * so `tabPanelId` withholds the attribute rather than letting it dangle.
 *
 * This is a fact about how the panel is rendered, not about the library, so it
 * lives here as data: if another panel becomes lazy, or this one stops being
 * lazy, the set is the only thing that changes.
 */
export const LAZILY_MOUNTED_TABS: ReadonlySet<MobileTab> = new Set<MobileTab>(['library']);

/** The panel a tab may claim to control, given whether it is the active one. */
export function tabPanelId(tab: MobileTab, isActive: boolean): string | undefined {
    if (!isActive && LAZILY_MOUNTED_TABS.has(tab)) return undefined;
    return MOBILE_TAB_PANEL_IDS[tab];
}
