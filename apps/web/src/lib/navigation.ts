export type NavSectionId = 'connect' | 'settings' | 'updates' | 'console' | 'about';

export interface NavSectionDefinition {
  id: NavSectionId;
  label: string;
}

const CONNECT_SECTION: NavSectionDefinition = { id: 'connect', label: 'Connect' };
const SETTINGS_SECTION: NavSectionDefinition = { id: 'settings', label: 'Settings' };
const UPDATES_SECTION: NavSectionDefinition = { id: 'updates', label: 'Updates' };
const CONSOLE_SECTION: NavSectionDefinition = { id: 'console', label: 'Console' };
const ABOUT_SECTION: NavSectionDefinition = { id: 'about', label: 'About' };

export function resolveDesktopSections(devModeEnabled: boolean): NavSectionDefinition[] {
  const sections = [CONNECT_SECTION, SETTINGS_SECTION, UPDATES_SECTION];
  if (devModeEnabled) {
    sections.push(CONSOLE_SECTION);
  }
  sections.push(ABOUT_SECTION);
  return sections;
}

export function resolveMobileSections(devModeEnabled: boolean): NavSectionDefinition[] {
  const sections = [CONNECT_SECTION, UPDATES_SECTION];
  if (devModeEnabled) {
    sections.push(CONSOLE_SECTION);
  }
  sections.push(ABOUT_SECTION);
  return sections;
}
