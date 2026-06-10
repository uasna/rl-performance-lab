import { useEffect, type ReactNode } from 'react';
import type { PlayerProfile, ImprovementState, GameMode, RocketLeagueSettings } from '../../types/rocketLeague';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { TopBar } from './TopBar';
import type { NavigationItemId } from './navigation';
import { listenReplayFileDetected, listenReplayWatcherError, type DesktopReplayFile } from '../../lib/electronBridge';

type ModeFilter = Extract<GameMode, '1v1' | '2v2' | '3v3'> | 'ALL';

interface AppShellProps {
  children: ReactNode;
  activeView: NavigationItemId;
  onChangeView: (view: NavigationItemId) => void;
  profile: PlayerProfile;
  settings: RocketLeagueSettings;
  improvementState: ImprovementState;
  modeFilter: ModeFilter;
  rankedOnly: boolean;
  onModeFilterChange: (mode: ModeFilter) => void;
  onRankedOnlyChange: (rankedOnly: boolean) => void;
  onAppBootAutomation?: () => void;
  onDesktopReplayDetected?: (file: DesktopReplayFile) => void;
  onDesktopWatcherError?: (message: string) => void;
}

function rankThemeClass(rankTier: string): string {
  const v = rankTier.toLowerCase();
  if (v.includes('bronze'))                          return 'rank-theme-bronze';
  if (v.includes('silver'))                          return 'rank-theme-silver';
  if (v.includes('gold'))                            return 'rank-theme-gold';
  if (v.includes('platinum'))                        return 'rank-theme-platinum';
  if (v.includes('diamond'))                         return 'rank-theme-diamond';
  if (v.includes('champion') && !v.includes('grand')) return 'rank-theme-champion';
  if (v.includes('grand'))                           return 'rank-theme-grand';
  if (v.includes('supersonic') || v.includes('ssl')) return 'rank-theme-ssl';
  return 'rank-theme-champion';
}

export function AppShell({
  children,
  activeView,
  onChangeView,
  profile,
  settings,
  improvementState,
  modeFilter,
  rankedOnly,
  onModeFilterChange,
  onRankedOnlyChange,
  onAppBootAutomation,
  onDesktopReplayDetected,
  onDesktopWatcherError,
}: AppShellProps) {
  useEffect(() => {
    onAppBootAutomation?.();
    // Solo se ejecuta al montar el shell. El callback interno tiene guardas contra StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unlistenDetected = onDesktopReplayDetected ? listenReplayFileDetected(onDesktopReplayDetected) : () => undefined;
    const unlistenError = onDesktopWatcherError ? listenReplayWatcherError((payload) => onDesktopWatcherError(payload.message)) : () => undefined;

    return () => {
      unlistenDetected();
      unlistenError();
    };
  }, [onDesktopReplayDetected, onDesktopWatcherError]);
  return (
    <div className={rankThemeClass(profile.rank.tier)} style={{ minHeight: '100dvh', background: 'var(--s-bg)', color: 'var(--fg-base)' }}>

      {/* Sidebar — fixed, compact width, xl+ only */}
      <Sidebar activeView={activeView} onChangeView={onChangeView} profile={profile} settings={settings} />

      {/* Main content area — offset by sidebar width on xl */}
      <div className="xl:ml-[148px]" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <TopBar
          activeView={activeView}
          profile={profile}
          settings={settings}
          improvementState={improvementState}
          modeFilter={modeFilter}
          rankedOnly={rankedOnly}
          onModeFilterChange={onModeFilterChange}
          onRankedOnlyChange={onRankedOnlyChange}
        />
        <main
          style={{
            flex: 1,
            padding: '10px 14px 80px',
            /* xl: reduce bottom padding since no mobile nav */
          }}
          className="xl:pb-6"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav activeView={activeView} onChangeView={onChangeView} />
    </div>
  );
}
