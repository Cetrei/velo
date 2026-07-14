import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { QrCode, Settings, Download, Terminal, Info, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { VeloIcon } from './VeloIcon';
import type { NavSectionDefinition, NavSectionId } from '../lib/navigation';

const SECTION_ICONS: Record<NavSectionId, LucideIcon> = {
  connect: QrCode,
  settings: Settings,
  updates: Download,
  console: Terminal,
  about: Info,
};

interface SidebarProps {
  sections: NavSectionDefinition[];
  activeSection: NavSectionId;
  onSelect: (section: NavSectionId) => void;
  hasUpdateBadge: boolean;
}

interface SidebarItemProps {
  section: NavSectionDefinition;
  isActive: boolean;
  hasBadge: boolean;
  isCollapsed: boolean;
  onSelect: (id: NavSectionId) => void;
}

function SidebarItem({ section, isActive, hasBadge, isCollapsed, onSelect }: SidebarItemProps) {
  const Icon = SECTION_ICONS[section.id];

  return (
    <button
      onClick={() => onSelect(section.id)}
      aria-label={section.label}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
        isActive ? 'bg-velo-indigo/20 text-velo-text-primary' : 'text-velo-text-secondary hover:text-velo-text-primary'
      }`}
    >
      <Icon size={18} />
      {!isCollapsed && <span>{section.label}</span>}
      {hasBadge && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-velo-emerald" />}
    </button>
  );
}

function SidebarBrand({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-2 px-1">
      <VeloIcon size={28} />
      {!isCollapsed && <span className="text-sm font-semibold text-velo-text-primary">Velo</span>}
    </div>
  );
}

export function Sidebar({ sections, activeSection, onSelect, hasUpdateBadge }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <nav
      className={`flex h-screen flex-col gap-1 border-r border-velo-surface bg-velo-background px-2 py-4 transition-all ${
        isCollapsed ? 'w-16' : 'w-52'
      }`}
    >
      <SidebarBrand isCollapsed={isCollapsed} />
      {sections.map((section) => (
        <SidebarItem
          key={section.id}
          section={section}
          isActive={activeSection === section.id}
          hasBadge={hasUpdateBadge && section.id === 'updates'}
          isCollapsed={isCollapsed}
          onSelect={onSelect}
        />
      ))}
      <button
        onClick={() => setIsCollapsed((value) => !value)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="mt-auto flex items-center justify-center rounded-xl px-3 py-2 text-velo-text-secondary hover:text-velo-text-primary"
      >
        {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>
    </nav>
  );
}
