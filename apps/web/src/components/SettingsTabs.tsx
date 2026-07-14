import { useState, type ReactNode } from 'react';

export type SettingsTabId = 'user' | 'updates' | 'system';

interface SettingsTabDefinition {
  id: SettingsTabId;
  label: string;
}

interface SettingsTabsProps {
  isSystemTabVisible: boolean;
  initialTab?: SettingsTabId;
  renderUserTab: () => ReactNode;
  renderUpdatesTab: () => ReactNode;
  renderSystemTab: () => ReactNode;
}

const BASE_TABS: SettingsTabDefinition[] = [
  { id: 'user', label: 'User' },
  { id: 'updates', label: 'Updates' },
];

const SYSTEM_TAB: SettingsTabDefinition = { id: 'system', label: 'System' };

function resolveVisibleTabs(isSystemTabVisible: boolean): SettingsTabDefinition[] {
  if (!isSystemTabVisible) return BASE_TABS;
  return [...BASE_TABS, SYSTEM_TAB];
}

export function SettingsTabs({
  isSystemTabVisible,
  initialTab = 'user',
  renderUserTab,
  renderUpdatesTab,
  renderSystemTab,
}: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const visibleTabs = resolveVisibleTabs(isSystemTabVisible);

  function renderActiveTabContent(): ReactNode {
    if (activeTab === 'user') return renderUserTab();
    if (activeTab === 'updates') return renderUpdatesTab();
    return renderSystemTab();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-velo-surface p-4">
      <div className="flex gap-1 border-b border-velo-background pb-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-t-lg px-3 py-1 text-sm ${
              activeTab === tab.id
                ? 'bg-velo-background text-velo-text-primary'
                : 'text-velo-text-secondary hover:text-velo-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {renderActiveTabContent()}
    </div>
  );
}
