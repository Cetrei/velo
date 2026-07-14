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
  isBusy?: boolean;
  busyLabel?: string;
  children: ReactNode;
}

const CENTERED_SECTIONS: NavSectionId[] = ['connect'];

function resolveMainAlignment(activeSection: NavSectionId): string {
  if (CENTERED_SECTIONS.includes(activeSection)) {
    return 'items-center justify-center';
  }
  return 'items-stretch justify-start';
}

function BusyOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-velo-background/80 backdrop-blur-sm">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-velo-indigo border-t-transparent" />
      <p className="text-sm text-velo-text-secondary">{label}</p>
    </div>
  );
}

function SidebarShell({
  sections,
  activeSection,
  onSelectSection,
  hasUpdateBadge,
  isBusy,
  busyLabel,
  children,
}: Omit<AppShellProps, 'layout'>) {
  return (
    <div className="relative flex min-h-screen bg-velo-background text-velo-text-primary">
      <Sidebar sections={sections} activeSection={activeSection} onSelect={onSelectSection} hasUpdateBadge={hasUpdateBadge} />
      <main className={`flex flex-1 flex-col gap-6 overflow-y-auto p-6 ${resolveMainAlignment(activeSection)}`}>
        <div className="mx-auto w-full max-w-2xl">{children}</div>
      </main>
      {isBusy && <BusyOverlay label={busyLabel ?? 'Working\u2026'} />}
    </div>
  );
}

function TabbarShell({
  sections,
  activeSection,
  onSelectSection,
  hasUpdateBadge,
  isBusy,
  busyLabel,
  children,
}: Omit<AppShellProps, 'layout'>) {
  return (
    <div className="relative flex min-h-screen flex-col bg-velo-background text-velo-text-primary">
      <main className={`flex flex-1 flex-col gap-4 overflow-y-auto p-4 pb-24 ${resolveMainAlignment(activeSection)}`}>
        <div className="mx-auto w-full max-w-2xl">{children}</div>
      </main>
      <BottomTabbar sections={sections} activeSection={activeSection} onSelect={onSelectSection} hasUpdateBadge={hasUpdateBadge} />
      {isBusy && <BusyOverlay label={busyLabel ?? 'Working\u2026'} />}
    </div>
  );
}

export function AppShell({ layout, ...rest }: AppShellProps) {
  if (layout === 'sidebar') {
    return <SidebarShell {...rest} />;
  }
  return <TabbarShell {...rest} />;
}
