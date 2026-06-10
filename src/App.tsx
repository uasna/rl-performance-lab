import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { isSkillNavigationItem, type NavigationItemId, type SkillNavigationItemId } from './components/layout/navigation';
import { GameAnalysisPanel } from './components/rocket-league/GameAnalysisPanel';
import { MatchHistory, defaultMatchHistoryFilters, type MatchHistoryFiltersState } from './components/rocket-league/MatchHistory';
import { SkillAreasLab } from './components/rocket-league/SkillAreasLab';
import { ErrorTracker } from './components/rocket-league/ErrorTracker';
import { TrainingLab } from './components/rocket-league/TrainingLab';
import { ReplayConnector } from './components/rocket-league/ReplayConnector';
import { RegisterMatchForm } from './components/forms/RegisterMatchForm';
import { RegisterTrainingForm } from './components/forms/RegisterTrainingForm';
import { ProgressDashboard } from './components/rocket-league/ProgressDashboard';
import { SettingsHub } from './components/rocket-league/SettingsHub';
import { SessionCoachPanel } from './components/rocket-league/SessionCoachPanel';
import { useRocketLeagueStats } from './hooks/useRocketLeagueStats';
import { analyzeReplayPreview, isElectronRuntime, startReplayWatcher, type DesktopReplayFile } from './lib/electronBridge';
import { buildMatchFromReplayAnalysis } from './lib/replayMatchMapper';
import { getTrackerAutomationSettings, syncLocalMmrSnapshot } from './components/rocket-league/trackerNetworkAutoSync';
import { calculateDerivedMetrics } from './lib/calculations';
import {
  formatMMR,
  formatPercent,
  formatRecord,
  formatSignedNumber,
} from './lib/formatters';
import type { RocketLeagueDataStore, RocketLeagueMatch, DerivedRocketLeagueMetrics, SkillArea, SkillAreaId, GameMode, RocketLeagueSettings } from './types/rocketLeague';

type ModeFilter = Extract<GameMode, '1v1' | '2v2' | '3v3'> | 'ALL';

type AutomationToastState = {
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
};

export function App() {
  const [activeView, setActiveView] = useState<NavigationItemId>('dashboard');
  const { store, actions } = useRocketLeagueStats();
  const [selectedMatchId, setSelectedMatchId] = useState(store.matches[0]?.id ?? '');
  const [matchFilters, setMatchFilters] = useState<MatchHistoryFiltersState>(defaultMatchHistoryFilters);
  const [booting, setBooting] = useState(true);
  const [dashboardFeedback, setDashboardFeedback] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('ALL');
  const [rankedOnly, setRankedOnly] = useState(false);
  const [automationToast, setAutomationToast] = useState<AutomationToastState | null>(null);
  const bootAutomationRanRef = useRef(false);
  const parsedReplayPathsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);

  const showAutomationToast = useCallback((toast: AutomationToastState) => {
    setAutomationToast(toast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setAutomationToast(null), 6800);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 420);
    return () => window.clearTimeout(timer);
  }, []);


  const filteredMatches = useMemo(() => {
    return store.matches.filter((match) => {
      const matchesMode = modeFilter === 'ALL' || match.mode === modeFilter;
      const matchesRanked = !rankedOnly || match.matchType === 'Ranked' || /ranked/i.test(match.playlist);
      return matchesMode && matchesRanked;
    });
  }, [modeFilter, rankedOnly, store.matches]);

  const viewStore = useMemo<RocketLeagueDataStore>(() => ({
    ...store,
    matches: filteredMatches,
    profile: {
      ...store.profile,
      mainMode: modeFilter === 'ALL' ? store.profile.mainMode : modeFilter,
    },
  }), [filteredMatches, modeFilter, store]);

  const viewSummary = useMemo(() => calculateDerivedMetrics(viewStore), [viewStore]);

  const selectedMatch = useMemo(
    () => filteredMatches.find((match) => match.id === selectedMatchId) ?? filteredMatches[0] ?? null,
    [filteredMatches, selectedMatchId],
  );

  const syncLocalMmrInBackground = useCallback(async (reason: 'startup' | 'replay' | 'manual') => {
    const automation = getTrackerAutomationSettings(store.settings);

    if (!automation.enableRankAutoSync || !automation.epicUsername) {
      return null;
    }

    const result = await syncLocalMmrSnapshot({
      settings: store.settings,
      playlistRanks: store.playlistRanks,
      mainMode: store.profile.mainMode,
      updatePlaylistRank: actions.updatePlaylistRank,
    });

    actions.updateSettings({
      lastLocalMmrSyncAt: result.syncedAt,
      lastTrackerSyncAt: undefined,
      updatedAt: result.syncedAt,
    } as Partial<RocketLeagueSettings>);

    if (reason === 'startup') {
      showAutomationToast({
        tone: 'success',
        title: 'MMR local sincronizado',
        message: `Snapshot local actualizado en segundo plano: ${result.primaryMmr}.`,
      });
    }

    return result;
  }, [actions, showAutomationToast, store.playlistRanks, store.profile.mainMode, store.settings]);

  const runAppBootAutomation = useCallback(() => {
    if (bootAutomationRanRef.current) return;
    bootAutomationRanRef.current = true;

    const automation = getTrackerAutomationSettings(store.settings);

    if (automation.enableRankAutoSync && automation.epicUsername) {
      void syncLocalMmrInBackground('startup').catch((error) => {
        showAutomationToast({
          tone: 'warning',
          title: 'MMR local pendiente',
          message: error instanceof Error ? error.message : 'No se pudo actualizar el snapshot local al abrir la app.',
        });
      });
    }

    if (isElectronRuntime() && (automation.autoParseNewReplays || automation.replayWatcherWasActive)) {
      void startReplayWatcher()
        .then((watcherStatus) => {
          actions.updateSettings({
            replayWatcherWasActive: watcherStatus.isWatching,
            lastReplayAutomationAt: new Date().toISOString(),
          } as Partial<RocketLeagueSettings>);
          if (watcherStatus.isWatching) {
            showAutomationToast({
              tone: 'info',
              title: 'Watcher activo',
              message: 'Replays nuevos se analizarán automáticamente.',
            });
          }
        })
        .catch((error) => {
          showAutomationToast({
            tone: 'error',
            title: 'Watcher no inició',
            message: error instanceof Error ? error.message : 'No se pudo reactivar el watcher.',
          });
        });
    }
  }, [actions, showAutomationToast, store.settings, syncLocalMmrInBackground]);

  const handleAutomatedReplayDetected = useCallback((file: DesktopReplayFile) => {
    const automation = getTrackerAutomationSettings(store.settings);
    if (!automation.autoParseNewReplays) return;
    if (parsedReplayPathsRef.current.has(file.path)) return;
    parsedReplayPathsRef.current.add(file.path);

    showAutomationToast({
      tone: 'info',
      title: 'Replay detectado',
      message: `Analizando ${file.fileName}...`,
    });

    void (async () => {
      const preview = await analyzeReplayPreview(file.path);
      const match = buildMatchFromReplayAnalysis(preview, store.profile);

      if (!match) {
        showAutomationToast({
          tone: 'warning',
          title: 'Replay procesado',
          message: 'El parser creó JSON, pero no hubo datos suficientes para registrar partida.',
        });
        return;
      }

      actions.registerMatch(match);
      setSelectedMatchId(match.id);

      let mmrText = 'sin cambio';
      try {
        const syncResult = await syncLocalMmrInBackground('replay');
        if (syncResult?.primaryMmr) mmrText = String(syncResult.primaryMmr);
      } catch (error) {
        mmrText = 'pendiente';
        console.warn('Auto-sync local de MMR falló después del replay.', error);
      }

      const completedAt = new Date().toISOString();
      actions.updateSettings({
        lastReplayAutomationAt: completedAt,
        replayWatcherWasActive: true,
        updatedAt: completedAt,
      } as Partial<RocketLeagueSettings>);

      showAutomationToast({
        tone: 'success',
        title: 'Partida registrada',
        message: `Partida registrada · MMR local: ${mmrText}`,
      });
    })().catch((error) => {
      parsedReplayPathsRef.current.delete(file.path);
      showAutomationToast({
        tone: 'error',
        title: 'Auto-parse falló',
        message: error instanceof Error ? error.message : 'No se pudo analizar el replay nuevo.',
      });
    });
  }, [actions, showAutomationToast, store.profile, store.settings, syncLocalMmrInBackground]);

  const handleAutomationWatcherError = useCallback((message: string) => {
    actions.updateSettings({ replayWatcherWasActive: false } as Partial<RocketLeagueSettings>);
    showAutomationToast({
      tone: 'error',
      title: 'Watcher detenido',
      message,
    });
  }, [actions, showAutomationToast]);

  return (
    <AppShell
      activeView={activeView}
      onChangeView={setActiveView}
      profile={store.profile}
      settings={store.settings}
      improvementState={viewSummary.improvementState}
      modeFilter={modeFilter}
      rankedOnly={rankedOnly}
      onModeFilterChange={setModeFilter}
      onRankedOnlyChange={setRankedOnly}
      onAppBootAutomation={runAppBootAutomation}
      onDesktopReplayDetected={handleAutomatedReplayDetected}
      onDesktopWatcherError={handleAutomationWatcherError}
    >
      <div className="mx-auto flex max-w-[1560px] flex-col gap-5">
        {booting ? <LoadingDashboard /> : null}
        {!booting && activeView === 'dashboard' ? (
          <DashboardView
            store={viewStore}
            summary={viewSummary}
            selectedMatch={selectedMatch}
            feedback={dashboardFeedback}
            onSelectMatch={(match) => setSelectedMatchId(match.id)}
            onRegisterMatch={() => {
              setActiveView('partidas');
              setDashboardFeedback('Panel de registro de partida preparado.');
            }}
            onRegisterTraining={() => {
              setActiveView('entrenamiento');
              setDashboardFeedback('Panel de registro de entrenamiento preparado.');
            }}
          />
        ) : null}
        {!booting && activeView === 'partidas' ? (
          <MatchesView
            store={viewStore}
            actions={actions}
            selectedMatch={selectedMatch}
            filters={matchFilters}
            onChangeFilters={setMatchFilters}
            onResetFilters={() => setMatchFilters(defaultMatchHistoryFilters)}
            onSelectMatch={(match) => setSelectedMatchId(match.id)}
          />
        ) : null}
        {!booting && activeView === 'entrenamiento' ? <TrainingView store={store} actions={actions} /> : null}
        {!booting && activeView === 'replays' ? (
          <ReplayConnector
            profile={store.profile}
            settings={store.settings}
            matches={store.matches}
            onUpdateSettings={actions.updateSettings}
            onCreateMatch={(match) => {
              actions.registerMatch(match);
              setSelectedMatchId(match.id);
            }}
            onOpenMatch={(matchId) => {
              setSelectedMatchId(matchId);
              setActiveView('partidas');
            }}
          />
        ) : null}
        {!booting && (activeView === 'habilidades' || isSkillNavigationItem(activeView)) ? (
          <SkillsView
            store={store}
            actions={actions}
            activeAreaId={isSkillNavigationItem(activeView) ? activeView : 'overview'}
            onActiveAreaChange={(areaId) => {
              if (areaId === 'overview') {
                setActiveView('habilidades');
                return;
              }
              if ((['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'] as const).includes(areaId as SkillNavigationItemId)) {
                setActiveView(areaId as SkillNavigationItemId);
              }
            }}
          />
        ) : null}
        {!booting && activeView === 'errores' ? <ErrorsView store={store} /> : null}
        {!booting && activeView === 'progreso' ? <ProgressView store={viewStore} summary={viewSummary} actions={actions} /> : null}
        {!booting && activeView === 'ajustes' ? <SettingsView store={store} actions={actions} /> : null}
      </div>
      <AutomationToast toast={automationToast} onClose={() => setAutomationToast(null)} />
    </AppShell>
  );
}

type RocketLeagueActions = ReturnType<typeof useRocketLeagueStats>['actions'];

function AutomationToast({ toast, onClose }: { toast: AutomationToastState | null; onClose: () => void }) {
  if (!toast) return null;

  const toneClass = {
    info: 'border-cyan-300/30 bg-cyan-300/12 text-cyan-50',
    success: 'border-emerald-300/30 bg-emerald-300/12 text-emerald-50',
    warning: 'border-amber-300/30 bg-amber-300/12 text-amber-50',
    error: 'border-rose-300/30 bg-rose-300/12 text-rose-50',
  }[toast.tone];

  return (
    <div className={`fixed right-5 top-16 z-[80] w-[min(420px,calc(100vw-2rem))] rounded-2xl border px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] opacity-70">Auto pipeline</p>
          <h3 className="mt-1 text-sm font-black text-white">{toast.title}</h3>
          <p className="mt-1 text-xs font-bold leading-5">{toast.message}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-2 py-1 text-xs font-black text-white/80 hover:bg-white/10">×</button>
      </div>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="grid gap-5">
      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5">
        <div className="h-3 w-40 animate-pulse rounded-full bg-white/10" />
        <div className="mt-4 h-10 w-72 max-w-full animate-pulse rounded-2xl bg-white/10" />
        <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded-full bg-white/8" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {['a', 'b', 'c', 'd'].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-[1.35rem] border border-white/10 bg-white/[0.035]" />
        ))}
      </div>
    </div>
  );
}

function DashboardView({
  store,
  summary,
  selectedMatch,
  feedback,
  onSelectMatch,
  onRegisterMatch,
  onRegisterTraining,
}: {
  store: RocketLeagueDataStore;
  summary: DerivedRocketLeagueMetrics;
  selectedMatch: RocketLeagueMatch | null;
  feedback: string;
  onSelectMatch: (match: RocketLeagueMatch) => void;
  onRegisterMatch: () => void;
  onRegisterTraining: () => void;
}) {
  const recentMatches = store.matches.slice(0, 5);
  const todayMatches = calculateTodayMatches(store.matches);
  const currentStreak = calculateCurrentStreak(store.matches);
  const strongestArea = summary.strongestArea?.name ?? 'Sin datos';
  const weakestArea = summary.weakestArea?.name ?? store.skillAreas.find((area) => area.id === store.profile.weakAreas[0])?.name ?? 'Sin datos';
  const recommendation = summary.trainingRecommendation;
  const focusArea = recommendation?.title.replace('Enfocar ', '') ?? weakestArea;
  const rankProgress = Math.max(0, Math.min(100, store.profile.rank.progressToNextRank ?? 0));
  const playedThisWeek = store.matches.slice(0, 10).length;

  return (
    <div className="pdf-dashboard">
      <section className="pdf-dashboard__hero">
        <article className="analyzer-card pdf-rank-panel">
          <div className="pdf-rank-panel__header">
            <span className="rank-gem" aria-hidden="true">◆</span>
            <span className="analyzer-pill violet">Rank</span>
            <span className="analyzer-pill cyan">{store.profile.mainMode}</span>
          </div>
          <div className="pdf-rank-panel__mmr">{formatMMR(store.profile.rank.mmr)}</div>
          <div className="pdf-rank-panel__tier">{store.profile.rank.tier} · {store.profile.rank.division}</div>
          <div className="pdf-rank-panel__mini">
            <MiniCockpitStat label="Last games" value={formatSignedNumber(summary.weeklyTotals.mmrDelta)} />
            <MiniCockpitStat label="Last 7 days" value={formatSignedNumber(summary.weeklyTotals.mmrDelta)} />
            <MiniCockpitStat label="Last 30 days" value={formatSignedNumber(summary.monthlyTotals?.mmrDelta ?? 0)} />
            <MiniCockpitStat label="Season peak" value={formatMMR(Math.max(store.profile.rank.mmr, ...store.rankHistory.map((item) => item.mmr), 0))} />
          </div>
        </article>

        <article className="analyzer-card pdf-main-graph">
          <div className="dashboard-panel-heading compact">
            <div>
              <p className="section-kicker">MMR progression</p>
              <h2>Curva de sesión / semana</h2>
            </div>
            <span className="analyzer-pill violet">Live graph</span>
          </div>
          <DashboardMmrCurve matches={store.matches} rankHistory={store.rankHistory} currentMmr={store.profile.rank.mmr} />
        </article>

        <aside className="analyzer-card pdf-recent-column">
          <div className="dashboard-panel-heading compact">
            <div>
              <p className="section-kicker">Recent games</p>
              <h2>Partidas recientes</h2>
            </div>
            <span className="analyzer-pill ghost">{recentMatches.length}</span>
          </div>
          <div className="pdf-recent-stack">
            {recentMatches.length === 0 ? (
              <EmptyDashboardPanel title="Sin partidas" description="Importá replays para llenar esta columna con tarjetas reales." />
            ) : recentMatches.map((match) => (
              <button key={match.id} type="button" className={`pdf-recent-tile ${match.id === selectedMatch?.id ? 'is-selected' : ''}`} onClick={() => onSelectMatch(match)}>
                <div className="pdf-recent-tile__overlay" />
                <div className="pdf-recent-tile__head">
                  <span className={`analyzer-pill ${match.result === 'victoria' ? 'green' : match.result === 'derrota' ? 'orange' : 'cyan'}`}>{resultShort(match.result)}</span>
                  <span>{match.mode}</span>
                </div>
                <div className="pdf-recent-tile__score"><b className="blue">{match.score.blue}</b><em>-</em><b className="orange">{match.score.orange}</b></div>
                <div className="pdf-recent-tile__map">{match.mapName}</div>
                <div className="pdf-recent-tile__stats">
                  <span>{match.playerStats.goals}<small>G</small></span>
                  <span>{match.playerStats.assists}<small>A</small></span>
                  <span>{match.playerStats.saves}<small>SV</small></span>
                  <span>{match.playerStats.shots}<small>SH</small></span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <RankProgressionPanel profile={store.profile} progress={rankProgress} />

      <section className="pdf-dashboard__middle">
        <SnapshotPanel summary={summary} todayMatches={todayMatches} currentStreak={currentStreak} playedThisWeek={playedThisWeek} />
        <article className="analyzer-card pdf-season-heatmap">
          <div className="dashboard-panel-heading compact">
            <div>
              <p className="section-kicker">Season activity</p>
              <h2>Mapa de actividad</h2>
            </div>
            <span className="analyzer-pill cyan">{store.dailyProgress.length || summary.last30DaysProgress.length} días</span>
          </div>
          <DashboardHeatmap progress={summary.last30DaysProgress.length ? summary.last30DaysProgress : store.dailyProgress} />
        </article>
        <article className="analyzer-card pdf-radar-card">
          <div className="dashboard-panel-heading compact">
            <div>
              <p className="section-kicker">Pillars</p>
              <h2>Radar competitivo</h2>
            </div>
            <span className="analyzer-pill green">Rank model</span>
          </div>
          <DashboardSkillRadar areas={store.skillAreas} />
        </article>
      </section>

      <PillarScoreStrip areas={store.skillAreas} />

      <section className="pdf-dashboard__lower">
        <article className="analyzer-card pdf-focus-panel">
          <div className="dashboard-panel-heading compact">
            <div>
              <p className="section-kicker">Focus card</p>
              <h2>{recommendation?.title ?? `Enfocar ${focusArea}`}</h2>
            </div>
            <span className="analyzer-pill violet">{recommendation?.priority ?? 'media'}</span>
          </div>
          <p>{recommendation?.reason ?? 'Importá más partidas para que el coach detecte tendencias reales. Con una sola partida se muestra lectura inicial.'}</p>
          <div className="dashboard-focus-card__matrix">
            <DataTile label="Área fuerte" value={strongestArea} />
            <DataTile label="Área crítica" value={weakestArea} />
            <DataTile label="Pack" value={recommendation?.trainingPackCode ?? 'Pendiente'} />
          </div>
          <div className="dashboard-focus-card__actions">
            <button type="button" onClick={onRegisterMatch} className="analyzer-button">Registrar partida</button>
            <button type="button" onClick={onRegisterTraining} className="analyzer-button violet">Entrenamiento</button>
          </div>
          {feedback ? <p className="dashboard-feedback">{feedback}</p> : null}
        </article>
        <article className="analyzer-card pdf-field-panel">
          <div className="dashboard-panel-heading compact">
            <div>
              <p className="section-kicker">Game state</p>
              <h2>Campo táctico</h2>
            </div>
            <span className="analyzer-pill orange">WIP</span>
          </div>
          <MiniTacticalField match={selectedMatch} />
        </article>
        <SessionCoachPanel store={store} onOpenTraining={onRegisterTraining} compact />
      </section>
    </div>
  );
}

function MiniCockpitStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mini-cockpit-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyDashboardPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-dashboard-panel">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function resultShort(result: RocketLeagueMatch['result']) {
  if (result === 'victoria') return 'Victoria';
  if (result === 'derrota') return 'Derrota';
  if (result === 'empate') return 'Empate';
  return 'Sin registro';
}

function RankProgressionPanel({ profile, progress }: { profile: RocketLeagueDataStore['profile']; progress: number }) {
  const mmr = profile.rank.mmr;
  const gamesToNext = profile.rank.gamesToNextRank ?? 0;
  return (
    <article className="analyzer-card pdf-rank-progression">
      <div className="dashboard-panel-heading compact">
        <div>
          <p className="section-kicker">Rank progression</p>
          <h2>Progreso al siguiente rango</h2>
        </div>
        <span className="analyzer-pill violet">{gamesToNext || 'sin datos'} games to next rank</span>
      </div>
      <div className="pdf-rank-track">
        <span className="rank-track__start">DIV I</span>
        <span className="rank-track__mid">DIV II</span>
        <span className="rank-track__end">DIV III</span>
        <div className="rank-track__bar"><i style={{ width: `${progress}%` }} /></div>
        <span className="rank-track__gem" style={{ left: `${Math.max(4, Math.min(96, progress))}%` }}>◆</span>
      </div>
      <div className="pdf-rank-progression__stats">
        <DataTile label="MMR" value={formatMMR(mmr)} />
        <DataTile label="Games to next rank" value={String(gamesToNext || 0)} />
        <DataTile label="Progreso" value={`${Math.round(progress)}%`} />
        <DataTile label="Modo" value={profile.mainMode} />
      </div>
    </article>
  );
}

function SnapshotPanel({ summary, todayMatches, currentStreak, playedThisWeek }: { summary: DerivedRocketLeagueMetrics; todayMatches: number; currentStreak: string; playedThisWeek: number }) {
  const winRate = Math.max(0, Math.min(100, summary.winRate));
  return (
    <article className="analyzer-card pdf-snapshot-card">
      <div className="dashboard-panel-heading compact">
        <div>
          <p className="section-kicker">Today snapshot</p>
          <h2>Resumen rápido</h2>
        </div>
        <span className="analyzer-pill green">{todayMatches} today</span>
      </div>
      <div className="pdf-snapshot-card__body">
        <div className="pdf-win-ring" style={{ '--wr': `${winRate * 3.6}deg` } as React.CSSProperties}>
          <strong>{formatPercent(winRate)}</strong>
          <span>WR</span>
        </div>
        <div className="pdf-snapshot-list">
          <MiniCockpitStat label="Played" value={playedThisWeek} />
          <MiniCockpitStat label="W/L/D" value={formatRecord(summary.record.wins, summary.record.losses, summary.record.draws)} />
          <MiniCockpitStat label="Streak" value={currentStreak} />
          <MiniCockpitStat label="MMR change" value={formatSignedNumber(summary.weeklyTotals.mmrDelta)} />
        </div>
      </div>
    </article>
  );
}

function PillarScoreStrip({ areas }: { areas: SkillArea[] }) {
  const pillars = ['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'] as const;
  return (
    <section className="pdf-pillar-strip">
      {pillars.map((id) => {
        const area = areas.find((item) => item.id === id);
        const value = area?.currentScore ?? 0;
        return (
          <article key={id} className="pdf-pillar-tile">
            <span>{area?.name ?? id}</span>
            <strong>{value}</strong>
            <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
          </article>
        );
      })}
    </section>
  );
}

function DashboardMmrCurve({ matches, rankHistory, currentMmr }: { matches: RocketLeagueMatch[]; rankHistory: RocketLeagueDataStore['rankHistory']; currentMmr: number }) {
  const values = [...rankHistory.map((item) => item.mmr), ...matches.map((match) => match.rankSnapshot.mmr)].filter((value) => Number.isFinite(value) && value > 0);
  const hasData = values.length > 0 || currentMmr > 0;
  const series = values.length ? values.slice(-24) : currentMmr > 0 ? [currentMmr] : [];
  const min = series.length ? Math.min(...series) - 25 : 0;
  const max = series.length ? Math.max(...series) + 25 : 100;
  const points = series.map((value, index) => {
    const x = series.length === 1 ? 50 : (index / (series.length - 1)) * 100;
    const y = 100 - ((value - min) / Math.max(max - min, 1)) * 82 - 9;
    return `${x},${y}`;
  }).join(' ');
  const area = series.length ? `0,100 ${points} 100,100` : '';

  return (
    <div className="dashboard-curve pdf-curve-grid">
      {hasData ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Curva MMR">
          <defs>
            <linearGradient id="mmrArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(168,85,247,0.46)" />
              <stop offset="58%" stopColor="rgba(0,229,212,0.20)" />
              <stop offset="100%" stopColor="rgba(0,229,212,0.02)" />
            </linearGradient>
          </defs>
          {area ? <polygon points={area} fill="url(#mmrArea)" /> : null}
          {points ? <polyline points={points} fill="none" stroke="rgba(238,242,255,0.82)" strokeWidth="1.15" /> : null}
          {series.map((value, index) => {
            const x = series.length === 1 ? 50 : (index / (series.length - 1)) * 100;
            const y = 100 - ((value - min) / Math.max(max - min, 1)) * 82 - 9;
            return <circle key={`${value}-${index}`} cx={x} cy={y} r="1.15" fill="rgba(0,229,212,.95)" />;
          })}
        </svg>
      ) : <EmptyDashboardPanel title="Sin historial MMR" description="Conectá MMR o guardá snapshots para generar la curva real." />}
      <div className="pdf-curve-grid__axis"><span>{max || 0}</span><span>{Math.round((max + min) / 2) || 0}</span><span>{min || 0}</span></div>
    </div>
  );
}

function DashboardHeatmap({ progress }: { progress: RocketLeagueDataStore['dailyProgress'] }) {
  const cells = Array.from({ length: 35 }, (_, index) => progress[index]?.playedMatches ?? 0);
  return (
    <div className="dashboard-heatmap" aria-label="Heatmap de actividad">
      {cells.map((value, index) => (
        <span key={`heat-${index}`} className={`heat-cell level-${Math.min(4, value)}`} title={`${value} partidas`} />
      ))}
    </div>
  );
}

function DashboardSkillRadar({ areas }: { areas: SkillArea[] }) {
  const pillars = ['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'] as const;
  const values = pillars.map((id) => areas.find((area) => area.id === id)?.currentScore ?? 0);
  const points = values.map((value, index) => {
    const angle = (-90 + (360 / values.length) * index) * (Math.PI / 180);
    const radius = 8 + Math.max(0, Math.min(100, value)) * 0.38;
    return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
  }).join(' ');

  return (
    <div className="dashboard-radar-wrap">
      <svg viewBox="0 0 100 100" className="dashboard-radar" role="img" aria-label="Radar de habilidades">
        {[18, 30, 42].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" />)}
        {pillars.map((_, index) => {
          const angle = (-90 + (360 / pillars.length) * index) * (Math.PI / 180);
          return <line key={String(index)} x1="50" y1="50" x2={50 + Math.cos(angle) * 42} y2={50 + Math.sin(angle) * 42} stroke="rgba(255,255,255,0.07)" />;
        })}
        <polygon points={points} fill="rgba(0,229,212,0.22)" stroke="rgba(0,229,212,0.86)" strokeWidth="1.4" />
      </svg>
      <div className="dashboard-radar-list">
        {pillars.map((id) => {
          const area = areas.find((item) => item.id === id);
          return <span key={id}><strong>{area?.name ?? id}</strong>{area?.currentScore ?? 0}</span>;
        })}
      </div>
    </div>
  );
}

function MiniTacticalField({ match }: { match: RocketLeagueMatch | null }) {
  const events = match?.events.slice(0, 5) ?? [];
  return (
    <div className="mini-field">
      <div className="mini-field__half blue" />
      <div className="mini-field__half orange" />
      <span className="mini-field__ball" />
      {events.map((event, index) => (
        <span key={event.id} className={`mini-field__event ${event.team === 'orange' ? 'orange' : 'blue'}`} style={{ left: `${22 + (index * 13) % 58}%`, top: `${22 + (event.timestampSecond % 55)}%` }} />
      ))}
      <div className="mini-field__label top">Blue</div>
      <div className="mini-field__label bottom">Orange</div>
    </div>
  );
}

function calculateTodayMatches(matches: RocketLeagueMatch[]): number {
  if (matches.length === 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  return matches.filter((match) => match.playedAt.slice(0, 10) === today).length;
}

function calculateCurrentStreak(matches: RocketLeagueMatch[]): string {
  if (matches.length === 0) return '0';
  const [latest] = matches;
  if (!latest || latest.result === 'empate' || latest.result === 'sin_registro') return '0';
  const target = latest.result;
  const count = matches.findIndex((match) => match.result !== target);
  const streak = count === -1 ? matches.length : count;
  return target === 'victoria' ? `W${streak}` : `L${streak}`;
}

function MatchesView({
  store,
  actions,
  selectedMatch,
  filters,
  onChangeFilters,
  onResetFilters,
  onSelectMatch,
}: {
  store: RocketLeagueDataStore;
  actions: RocketLeagueActions;
  selectedMatch: RocketLeagueMatch | null;
  filters: MatchHistoryFiltersState;
  onChangeFilters: (filters: MatchHistoryFiltersState) => void;
  onResetFilters: () => void;
  onSelectMatch: (match: RocketLeagueMatch) => void;
}) {
  const [mode, setMode] = useState<'historial' | 'analisis' | 'replays'>('historial');

  return (
    <div className="matches-workspace matches-workspace--clean grid gap-2">
      <div className="analysis-floating-switch" aria-label="Cambiar vista de partidas">
        <button type="button" onClick={() => setMode('historial')} className={mode === 'historial' ? 'is-active' : ''}>Match History</button>
        <button type="button" onClick={() => setMode('replays')} className={mode === 'replays' ? 'is-active' : ''}>Replay Intake</button>
        <button type="button" onClick={() => setMode('analisis')} className={mode === 'analisis' ? 'is-active' : ''}>Game Analysis</button>
      </div>

      {mode === 'historial' ? (
        <div className="compact-history-grid grid gap-3 2xl:grid-cols-[.82fr_1.18fr]">
          <MatchHistory
            matches={store.matches}
            skillAreas={store.skillAreas}
            selectedMatchId={selectedMatch?.id}
            filters={filters}
            onChangeFilters={onChangeFilters}
            onResetFilters={onResetFilters}
            onSelectMatch={(match) => {
              onSelectMatch(match);
              setMode('analisis');
            }}
          />
          <div className="grid gap-3 content-start">
            <RegisterMatchForm store={store} actions={actions} />
            <GameAnalysisPanel match={selectedMatch} skillAreas={store.skillAreas} />
          </div>
        </div>
      ) : mode === 'replays' ? (
        <ReplayConnector
          profile={store.profile}
          settings={store.settings}
          matches={store.matches}
          onUpdateSettings={actions.updateSettings}
          onCreateMatch={(match) => {
            actions.registerMatch(match);
            onSelectMatch(match);
          }}
          onOpenMatch={(matchId) => {
            const match = store.matches.find((item) => item.id === matchId);
            if (match) onSelectMatch(match);
            setMode('analisis');
          }}
        />
      ) : (
        <GameAnalysisPanel match={selectedMatch} skillAreas={store.skillAreas} />
      )}
    </div>
  );
}

function TrainingView({ store, actions }: { store: RocketLeagueDataStore; actions: RocketLeagueActions }) {
  return (
    <div className="grid gap-5">
      <SessionCoachPanel store={store} compact />
      <TrainingLab store={store} actions={actions} />
      <RegisterTrainingForm store={store} actions={actions} />
    </div>
  );
}

function SkillsView({
  store,
  actions,
  activeAreaId,
  onActiveAreaChange,
}: {
  store: RocketLeagueDataStore;
  actions: RocketLeagueActions;
  activeAreaId?: 'overview' | SkillNavigationItemId;
  onActiveAreaChange?: (areaId: 'overview' | SkillAreaId) => void;
}) {
  return (
    <SkillAreasLab
      areas={store.skillAreas}
      metrics={store.skillMetrics}
      errors={store.frequentErrors}
      store={store}
      actions={actions}
      activeAreaId={activeAreaId}
      onActiveAreaChange={onActiveAreaChange}
    />
  );
}

function ErrorsView({ store }: { store: RocketLeagueDataStore }) {
  return <ErrorTracker errors={store.frequentErrors} areas={store.skillAreas} />;
}

function ProgressView({ store, summary, actions }: { store: RocketLeagueDataStore; summary: DerivedRocketLeagueMetrics; actions: RocketLeagueActions }) {
  return <ProgressDashboard store={store} summary={summary} actions={actions} />;
}

function SettingsView({ store, actions }: { store: RocketLeagueDataStore; actions: RocketLeagueActions }) {
  return <SettingsHub store={store} actions={actions} />;
}
