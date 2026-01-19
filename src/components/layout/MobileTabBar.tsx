import React from 'react';
import {
  FaBook,
  FaChartLine,
  FaInfoCircle,
  FaProjectDiagram,
  FaThLarge,
} from 'react-icons/fa';

export type MobileTab = 'board' | 'tree' | 'info' | 'analysis' | 'library';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  showAnalysis?: boolean;
  commentBadge?: number;
}

interface TabConfig {
  id: MobileTab;
  label: string;
  icon: React.ReactNode;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  activeTab,
  onTabChange,
  showAnalysis = true,
  commentBadge,
}) => {
  const tabs: TabConfig[] = [
    {
      id: 'board',
      label: 'Board',
      icon: <FaThLarge size={18} />,
    },
    {
      id: 'info',
      label: 'Info',
      icon: <FaInfoCircle size={18} />,
    },
    {
      id: 'tree',
      label: 'Tree',
      icon: <FaProjectDiagram size={18} />,
    },
  ];

  if (showAnalysis) {
    tabs.push({
      id: 'analysis',
      label: 'Analysis',
      icon: <FaChartLine size={18} />,
    });
  }

  tabs.push({
    id: 'library',
    label: 'Library',
    icon: <FaBook size={18} />,
  });

  const columns = tabs.length;

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 ui-bar border-t backdrop-blur-sm shadow-xl shadow-black/30"
      role="tablist"
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={[
                'py-3 px-2 flex flex-col items-center justify-center gap-1.5 text-xs font-medium transition-all',
                isActive
                  ? 'text-[var(--ui-accent)] bg-[var(--ui-accent-soft)] border-t-2 border-[var(--ui-accent)] shadow-inner'
                  : 'text-[var(--ui-text-muted)] hover:text-white hover:bg-[var(--ui-surface-2)] border-t-2 border-transparent',
              ].join(' ')}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
            >
              <span className="relative">
                {tab.icon}
                {tab.id === 'info' && commentBadge && commentBadge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] px-1 h-4 rounded-full text-[10px] flex items-center justify-center bg-rose-500 text-white font-semibold shadow-sm">
                    {commentBadge > 9 ? '9+' : commentBadge}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

MobileTabBar.displayName = 'MobileTabBar';
