import type { LucideIcon } from 'lucide-react';
import { QrCode, Download, Terminal, Info } from 'lucide-react';
import type { NavSectionDefinition, NavSectionId } from '../lib/navigation';

const SECTION_ICONS: Record<NavSectionId, LucideIcon> = {
  connect: QrCode,
  settings: QrCode,
  updates: Download,
  console: Terminal,
  about: Info,
};

interface BottomTabbarProps {
  sections: NavSectionDefinition[];
  activeSection: NavSectionId;
  onSelect: (section: NavSectionId) => void;
  hasUpdateBadge: boolean;
}

interface BottomTabProps {
  section: NavSectionDefinition;
  isActive: boolean;
  hasBadge: boolean;
  onSelect: (id: NavSectionId) => void;
}

function BottomTab({ section, isActive, hasBadge, onSelect }: BottomTabProps) {
  const Icon = SECTION_ICONS[section.id];

  return (
    <button
      onClick={() => onSelect(section.id)}
      aria-label={section.label}
      className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
        isActive ? 'text-velo-indigo' : 'text-velo-text-secondary'
      }`}
    >
      <Icon size={20} />
      <span>{section.label}</span>
      {hasBadge && <span className="absolute right-6 top-1 h-2 w-2 rounded-full bg-velo-emerald" />}
    </button>
  );
}

export function BottomTabbar({ sections, activeSection, onSelect, hasUpdateBadge }: BottomTabbarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-velo-surface bg-velo-background pb-[env(safe-area-inset-bottom)]">
      {sections.map((section) => (
        <BottomTab
          key={section.id}
          section={section}
          isActive={activeSection === section.id}
          hasBadge={hasUpdateBadge && section.id === 'updates'}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}
