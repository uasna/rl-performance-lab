import type { GameMode, ImprovementState, PlayerProfile, RocketLeagueSettings } from '../../types/rocketLeague';
import type { NavigationItemId } from './navigation';
import { getNavigationItem } from './navigation';
import { BrandBlock } from './Sidebar';

export type ModeFilter = Extract<GameMode, '1v1' | '2v2' | '3v3'> | 'ALL';

interface TopBarProps {
  activeView: NavigationItemId;
  profile: PlayerProfile;
  settings: RocketLeagueSettings;
  improvementState: ImprovementState;
  modeFilter: ModeFilter;
  rankedOnly: boolean;
  onModeFilterChange: (mode: ModeFilter) => void;
  onRankedOnlyChange: (rankedOnly: boolean) => void;
}

const MODES: Array<Extract<GameMode, '1v1' | '2v2' | '3v3'>> = ['1v1', '2v2', '3v3'];

function improvementLabel(state: ImprovementState) {
  if (state === 'declining') return 'Alert';
  return 'Ready';
}

export function TopBar({
  activeView,
  profile,
  settings,
  improvementState,
  modeFilter,
  rankedOnly,
  onModeFilterChange,
  onRankedOnlyChange,
}: TopBarProps) {
  const account = settings.epicAccount;
  const accountName = account?.displayName?.trim() || profile.playerName || 'JACKAL';
  const rankInitial = (profile.rank.tier || 'RL').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'RL';
  const rankText = `${profile.rank.tier || 'Unranked'} ${profile.rank.division || ''}`.trim();

  return (
    <header className="analyzer-topbar pdf-topbar">
      <div className="analyzer-topbar__left">
        <div className="xl:hidden"><BrandBlock compact /></div>
        <h1 className="analyzer-topbar__title">{getNavigationItem(activeView).label}</h1>

        <div className="analyzer-mode-bar" aria-label="Filtros globales">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onModeFilterChange(mode)}
              className={`analyzer-mode-btn${modeFilter === mode ? ' is-active' : ''}`}
              aria-pressed={modeFilter === mode}
            >
              <span className="mode-icon">♙</span>{mode}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onModeFilterChange('ALL')}
            className={`analyzer-mode-btn${modeFilter === 'ALL' ? ' is-active' : ''}`}
            aria-pressed={modeFilter === 'ALL'}
          >
            <span className="mode-icon">☰</span>ALL
          </button>
          <button
            type="button"
            onClick={() => onRankedOnlyChange(!rankedOnly)}
            className={`analyzer-mode-btn is-ranked${rankedOnly ? ' is-active' : ''}`}
            aria-pressed={rankedOnly}
          >
            <span className="mode-icon">♜</span>RANKED
          </button>
          <span className="analyzer-ready-dot"><i /> {improvementLabel(improvementState)}</span>
        </div>
      </div>

      <div className="analyzer-topbar__right">
        <button type="button" className="report-bug-button">⚙ REPORT BUG</button>
        <span className="auto-batch-pill"><i /> Auto batch: On</span>
        <div className="analyzer-player-badge rla-account-pill">
          <div className="analyzer-player-badge__avatar">{rankInitial}</div>
          <div>
            <div className="analyzer-player-badge__name">{accountName}</div>
            <div className="analyzer-player-badge__rank">{rankText}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
