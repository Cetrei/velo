import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomTabbar } from './BottomTabbar';
import type { NavSectionDefinition, NavSectionId } from '../lib/navigation';

export type AppShellLayout = 'sidebar' | 'tabbar';

interface AppShellProps {
  layout: AppShellLayout;
  sections: NavSectionDefinition[];
  activeSection: NavSectionId;
  onSelectSection: (section: NavSectionId) => void;
  hasUpdateBadge: boolean;
  children: ReactNode;
}

function SidebarShell({ sections, activeSection, onSelectSection, hasUpdateBadge, children }: Omit<AppShellProps, 'layout'>) {
  return (
    <div className="flex min-h-screen bg-velo-background text-velo-text-primary">
      <Sidebar sections={sections} activeSection={activeSection} onSelect={onSelectSection} hasUpdateBadge={hasUpdateBadge} />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

function TabbarShell({ sections, activeSection, onSelectSection, hasUpdateBadge, children }: Omit<AppShellProps, 'layout'>) {
  return (
    <div className="flex min-h-screen flex-col bg-velo-background text-velo-text-primary">
      <main className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-4 pb-24">{children}</main>
      <BottomTabbar sections={sections} activeSection={activeSection} onSelect={onSelectSection} hasUpdateBadge={hasUpdateBadge} />
    </div>
  );
}

export function AppShell({ layout, ...rest }: AppShellProps) {
  if (layout === 'sidebar') {
    return <SidebarShell {...rest} />;
  }
  return <TabbarShell {...rest} />;
}
