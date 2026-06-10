import { isSkillNavigationItem, navigationItems, type NavigationItemId } from './navigation';
import type { PlayerProfile, RocketLeagueSettings } from '../../types/rocketLeague';

const navIcon: Record<string, string> = {
  dashboard: '▦',
  partidas: '▱',
  habilidades: '◎',
  movement: '↝',
  boost: '♨',
  offence: '✚',
  defence: '⬡',
  rotation: '⟳',
  positioning: '⌖',
  ajustes: '⚙',
};

function isRouteActive(activeView: NavigationItemId, itemId: NavigationItemId) {
  if (itemId === 'habilidades' && activeView === 'habilidades') return true;
  return activeView === itemId;
}

export function Sidebar({
  activeView,
  onChangeView,
  profile,
  settings,
}: {
  activeView: NavigationItemId;
  onChangeView: (view: NavigationItemId) => void;
  profile: PlayerProfile;
  settings: RocketLeagueSettings;
}) {
  const hasPlayer = Boolean(settings.epicAccount?.displayName?.trim() || profile.playerName?.trim());
  const mainItems = navigationItems.filter((item) => item.sidebarGroup === 'main');
  const analysisItems = navigationItems.filter((item) => item.sidebarGroup === 'analysis');
  const settingsItem = navigationItems.find((item) => item.id === 'ajustes');

  return (
    <aside className="analyzer-sidebar hidden xl:flex" aria-label="RL Analyser navigation">
      <div className="analyzer-sidebar__brand">
        <span className="analyzer-sidebar__brand-dot" aria-hidden="true" />
        <div>
          <div className="analyzer-sidebar__appname">RL Analyser</div>
        </div>
      </div>

      <nav className="analyzer-sidebar__nav" aria-label="Navegación principal">
        <div className="analyzer-sidebar__main-group">
          {mainItems.map((item) => (
            <NavItem
              key={item.id}
              label={item.label}
              icon={navIcon[item.id] ?? '•'}
              active={isRouteActive(activeView, item.id)}
              dot={item.id === 'partidas'}
              onClick={() => onChangeView(item.id)}
            />
          ))}
        </div>

        <div className="analyzer-sidebar__section-label">Analysis</div>
        {analysisItems.map((item) => (
          <NavItem
            key={item.id}
            label={item.label}
            icon={navIcon[item.id] ?? '•'}
            active={isRouteActive(activeView, item.id)}
            dot={item.id === 'habilidades' || isSkillNavigationItem(item.id)}
            onClick={() => onChangeView(item.id)}
          />
        ))}
      </nav>

      <div className="analyzer-sidebar__footer">
        {settingsItem ? (
          <button type="button" className="analyzer-settings-link" onClick={() => onChangeView(settingsItem.id)}>
            <span>{navIcon.ajustes}</span>
            <b>{settingsItem.label}</b>
          </button>
        ) : null}
        <div className="analyzer-sidebar__status-line">
          <span>548 games</span>
          <em><i /> {hasPlayer ? 'Online' : 'Local'}</em>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  label,
  icon,
  active,
  dot,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  dot: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`analyzer-nav-item${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="analyzer-nav-item__icon">{icon}</span>
      <span className="analyzer-nav-item__label">{label}</span>
      {dot ? <span className="analyzer-nav-item__dot" aria-hidden="true" /> : null}
    </button>
  );
}

export function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-block" data-compact={compact ? 'true' : 'false'}>
      <span className="analyzer-sidebar__brand-dot" aria-hidden="true" />
      <strong>RL Analyser</strong>
    </div>
  );
}
