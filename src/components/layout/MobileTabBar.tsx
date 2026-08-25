import React from 'react';
import {
  FaBook,
  FaInfoCircle,
  FaProjectDiagram,
  FaThLarge,
} from 'react-icons/fa';

export type MobileTab = 'board' | 'tree' | 'info' | 'library';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  commentBadge?: number;
  hasControlBarAbove?: boolean;
}

interface TabConfig {
  id: MobileTab;
  label: string;
  icon: React.ReactNode;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  activeTab,
  onTabChange,
  commentBadge,
  hasControlBarAbove,
}) => {
  const [pointerFocusedTab, setPointerFocusedTab] = React.useState<MobileTab | null>(null);
  const tabs: TabConfig[] = [
    {
      id: 'board',
      label: 'Board',
      icon: <FaThLarge size={18} />,
    },
    {
      id: 'tree',
      label: 'Tree',
      icon: <FaProjectDiagram size={18} />,
    },
    {
      id: 'info',
      label: 'Review',
      icon: <FaInfoCircle size={18} />,
    },
  ];

  tabs.push({
    id: 'library',
    label: 'Library',
    icon: <FaBook size={18} />,
  });

  const columns = tabs.length;

  return (
    <nav
      className={[
        'w-full mobile-tabbar transition-colors',
        hasControlBarAbove ? 'bg-transparent' : 'ui-bar border-t border-[var(--ui-border)]'
      ].filter(Boolean).join(' ')}
      role="tablist"
      aria-label="Main sections"
    >
      <div
        className="grid mobile-tabbar-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onPointerDown={() => setPointerFocusedTab(tab.id)}
              onPointerCancel={() => setPointerFocusedTab(null)}
              onKeyDown={() => setPointerFocusedTab(null)}
              onBlur={() => setPointerFocusedTab((focusedTab) => focusedTab === tab.id ? null : focusedTab)}
              onClick={(event) => {
                setPointerFocusedTab(event.detail === 0 ? null : tab.id);
                onTabChange(tab.id);
              }}
              className={[
                'py-2.5 sm:py-3 px-2 flex flex-col items-center justify-center gap-1 sm:gap-1.5 text-[0.6875rem] sm:text-xs font-medium leading-tight transition-all touch-manipulation',
                isActive
                  ? 'text-[var(--ui-accent)] border-t-2 border-[var(--ui-accent)]'
                  : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] border-t-2 border-transparent',
                pointerFocusedTab === tab.id ? 'mobile-tab-pointer-focus' : '',
              ].join(' ')}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              data-mobile-tab-focus-origin={pointerFocusedTab === tab.id ? 'pointer' : 'keyboard'}
            >
              <span className="relative">
                {tab.icon}
                {tab.id === 'info' && commentBadge != null && commentBadge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] px-1 h-4 rounded-full text-[0.625rem] flex items-center justify-center bg-rose-500 text-white font-semibold shadow-sm">
                    {commentBadge > 9 ? '9+' : commentBadge}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full mobile-tabbar-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

MobileTabBar.displayName = 'MobileTabBar';
