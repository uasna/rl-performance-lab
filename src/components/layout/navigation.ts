export const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', description: 'Cockpit competitivo', sidebarGroup: 'main' },
  { id: 'partidas', label: 'Match History', shortLabel: 'Matches', description: 'Historial y análisis de partidas', sidebarGroup: 'main' },
  { id: 'habilidades', label: 'Overview', shortLabel: 'Overview', description: 'Resumen general por tendencias', sidebarGroup: 'analysis' },
  { id: 'movement', label: 'Movement', shortLabel: 'Move', description: 'Velocidad, recoveries y coasting', sidebarGroup: 'analysis' },
  { id: 'boost', label: 'Boost', shortLabel: 'Boost', description: 'Gestión de boost y pads', sidebarGroup: 'analysis' },
  { id: 'offence', label: 'Offence', shortLabel: 'Offence', description: 'Presión, tiros y threat', sidebarGroup: 'analysis' },
  { id: 'defence', label: 'Defence', shortLabel: 'Defence', description: 'Saves, pressure y prevention', sidebarGroup: 'analysis' },
  { id: 'rotation', label: 'Rotation', shortLabel: 'Rotate', description: 'Spacing y replay táctico', sidebarGroup: 'analysis' },
  { id: 'positioning', label: 'Positioning', shortLabel: 'Position', description: 'Expected positioning', sidebarGroup: 'analysis' },
  { id: 'entrenamiento', label: 'Training', shortLabel: 'Train', description: 'Bloques, foco y timer', sidebarGroup: 'tools' },
  { id: 'replays', label: 'Replays', shortLabel: 'Replays', description: 'Watcher local y análisis', sidebarGroup: 'tools' },
  { id: 'errores', label: 'Errors', shortLabel: 'Errors', description: 'Patrones y acciones', sidebarGroup: 'tools' },
  { id: 'progreso', label: 'Progress', shortLabel: 'Progress', description: 'MMR, constancia y actividad', sidebarGroup: 'tools' },
  { id: 'ajustes', label: 'Settings', shortLabel: 'Settings', description: 'Datos locales y configuración', sidebarGroup: 'settings' },
] as const;

export type NavigationItemId = (typeof navigationItems)[number]['id'];

export const skillNavigationIds = ['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'] as const;
export type SkillNavigationItemId = (typeof skillNavigationIds)[number];

export function isSkillNavigationItem(id: NavigationItemId): id is SkillNavigationItemId {
  return (skillNavigationIds as readonly string[]).includes(id);
}

export function getNavigationItem(id: NavigationItemId) {
  return navigationItems.find((item) => item.id === id) ?? navigationItems[0];
}
