import type { ReactNode } from 'react';
import { useState } from 'react';
import type { GameMode, PlayerProfile, PlaylistRank, RocketLeagueDataStore, RocketLeagueSettings, SkillAreaId } from '../../types/rocketLeague';
import { LiveStatsApiHub } from './LiveStatsApiHub';
import { MmrOcrHub } from './MmrOcrHub';
import { Tag } from '../cards/Tag';
import { getTrackerAutomationSettings, syncLocalMmrSnapshot } from './trackerNetworkAutoSync';

type SettingsHubActions = {
  updateProfile: (profile: Partial<PlayerProfile>) => void;
  updateSettings: (settings: Partial<RocketLeagueSettings>) => void;
  exportData: () => string;
  importData: (payload: string) => { ok: boolean; error?: string };
  resetData: () => void;
  updatePlaylistRank: (rank: PlaylistRank) => void;
};

const modeOptions: GameMode[] = ['1v1', '2v2', '3v3'];

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function SettingsHub({ store, actions }: { store: RocketLeagueDataStore; actions: SettingsHubActions }) {
  const automationSettings = getTrackerAutomationSettings(store.settings);
  const [epicUsername, setEpicUsername] = useState(automationSettings.epicUsername || store.settings.epicAccount?.displayName || store.profile.playerName || '');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(Boolean(automationSettings.enableRankAutoSync));
  const [autoParseReplays, setAutoParseReplays] = useState(Boolean(automationSettings.autoParseNewReplays));
  const [syncingLocalMmr, setSyncingLocalMmr] = useState(false);
  const [payload, setPayload] = useState('');
  const [feedback, setFeedback] = useState('');

  const [region, setRegion] = useState(store.settings.region ?? store.profile.region ?? 'LATAM');
  const [mainModes, setMainModes] = useState<GameMode[]>(store.profile.primaryModes?.length ? store.profile.primaryModes : [store.profile.mainMode]);
  const [goal, setGoal] = useState(store.profile.goal);
  const [dailyMinutes, setDailyMinutes] = useState(String(store.settings.dailyAvailableMinutes ?? store.settings.preferredTrainingMinutes ?? 90));
  const [priorityAreas, setPriorityAreas] = useState<SkillAreaId[]>(store.settings.priorityAreaIds ?? []);

  function buildAutomationSettings() {
    const now = new Date().toISOString();
    return {
      epicUsername: epicUsername.trim(),
      trackerApiKey: undefined,
      trnApiKey: undefined,
      enableRankAutoSync: autoSyncEnabled,
      autoParseNewReplays: autoParseReplays,
      replayWatcherWasActive: autoParseReplays ? automationSettings.replayWatcherWasActive : false,
      epicAccount: {
        ...(store.settings.epicAccount ?? {}),
        status: epicUsername.trim() ? 'conectada' : 'desconectada',
        displayName: epicUsername.trim(),
        platform: 'Epic',
      },
      updatedAt: now,
    } as Partial<RocketLeagueSettings>;
  }

  function saveAutomationSettings() {
    actions.updateSettings(buildAutomationSettings());
    setFeedback('Automatización guardada. La app usará replays locales y snapshots de MMR locales, sin Tracker API.');
  }

  async function syncLocalMmrNow() {
    setSyncingLocalMmr(true);
    const nextSettings = { ...store.settings, ...buildAutomationSettings() } as RocketLeagueSettings;
    actions.updateSettings(buildAutomationSettings());
    setFeedback('Sincronizando MMR local...');

    try {
      const result = await syncLocalMmrSnapshot({
        settings: nextSettings,
        playlistRanks: store.playlistRanks,
        mainMode: store.profile.mainMode,
        updatePlaylistRank: actions.updatePlaylistRank,
      });

      actions.updateSettings({
        ...buildAutomationSettings(),
        lastLocalMmrSyncAt: result.syncedAt,
        lastTrackerSyncAt: undefined,
      } as Partial<RocketLeagueSettings>);
      setFeedback(`MMR local sincronizado: ${result.primaryMmr}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo sincronizar el MMR local.');
    } finally {
      setSyncingLocalMmr(false);
    }
  }

  function saveLocalPreferences() {
    const now = new Date().toISOString();
    actions.updateProfile({
      region,
      primaryModes: mainModes,
      mainMode: mainModes[0] ?? '2v2',
      goal,
      recommendedTrainingMinutes: Number(dailyMinutes) || 0,
      updatedAt: now,
    });
    actions.updateSettings({
      region,
      preferredTrainingMinutes: Number(dailyMinutes) || 0,
      dailyAvailableMinutes: Number(dailyMinutes) || 0,
      priorityAreaIds: priorityAreas,
      updatedAt: now,
    });
    setFeedback('Preferencias avanzadas guardadas.');
  }

  async function handleExport() {
    const data = actions.exportData();
    try {
      await navigator.clipboard.writeText(data);
      setFeedback('Backup JSON copiado al portapapeles.');
    } catch {
      setPayload(data);
      setFeedback('Backup JSON generado en el campo de texto.');
    }
  }

  function handleImport() {
    const result = actions.importData(payload);
    setFeedback(result.ok ? 'Datos importados correctamente.' : result.error ?? 'No se pudo importar el JSON.');
  }

  return (
    <div className="settings-one-profile grid gap-3">
      <section className="analyzer-card settings-hero-compact">
        <div>
          <p className="section-kicker">Configuración esencial</p>
          <h1>Ajustes</h1>
          <p>Dejá configurada tu cuenta Epic y el watcher. El MMR se guarda desde snapshots locales/OCR, sin Tracker API.</p>
        </div>
        <div className="settings-hero-compact__meta">
          <span>{store.matches.length} partidas</span>
          <span>{store.matches.filter((match) => match.source === 'replay_parser').length} replays</span>
          <span>{epicUsername.trim() ? 'cuenta lista' : 'cuenta pendiente'}</span>
        </div>
      </section>

      <section className="analyzer-card settings-compact-card settings-primary-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="section-kicker">Automatización total</p>
            <h2>Replay Watcher + MMR local</h2>
            <p className="settings-muted">Configurás tu usuario Epic, activás el watcher y guardás un snapshot de MMR local cuando cambie. No usa TRN API.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tag>{autoSyncEnabled ? 'Auto-sync ON' : 'Auto-sync OFF'}</Tag>
            <Tag>{autoParseReplays ? 'Auto-parse ON' : 'Auto-parse OFF'}</Tag>
            {automationSettings.lastLocalMmrSyncAt ? <Tag>Última sync {new Date(automationSettings.lastLocalMmrSyncAt).toLocaleString('es-HN')}</Tag> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_320px]">
          <TextField label="Epic username" value={epicUsername} onChange={setEpicUsername} placeholder="Ej. uasna" />
          <div className="grid gap-2">
            <ToggleRow label="Auto-sync MMR local" active={autoSyncEnabled} onToggle={() => setAutoSyncEnabled((value) => !value)} />
            <ToggleRow label="Auto-parse replays" active={autoParseReplays} onToggle={() => setAutoParseReplays((value) => !value)} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={syncLocalMmrNow} disabled={syncingLocalMmr || !epicUsername.trim() || !autoSyncEnabled} className="analyzer-button">
            {syncingLocalMmr ? 'Sincronizando...' : 'Sincronizar MMR local ahora'}
          </button>
          <button type="button" onClick={saveAutomationSettings} className="analyzer-button violet">Guardar automatización</button>
        </div>
        <p className="settings-muted mt-3">Para que el MMR cambie solo en el dashboard, guardá el MMR leído una vez desde Avanzado → MMR OCR local. Después cada replay nuevo registra partida y reutiliza el último snapshot local confirmado.</p>
      </section>

      <details className="analyzer-card settings-compact-card settings-advanced-block">
        <summary>
          <span>
            <b>Avanzado / mantenimiento</b>
            <small>MMR OCR local, Stats API, preferencias y backup.</small>
          </span>
          <em>Abrir</em>
        </summary>

        <div className="mt-4 grid gap-3">
          <section className="grid gap-3 xl:grid-cols-[.95fr_1.05fr]">
            <article className="settings-subpanel">
              <p className="section-kicker">Preferencias locales</p>
              <h2>Entrenamiento y filtros</h2>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Región" value={region} onChange={setRegion} />
                  <TextField label="Tiempo diario" value={dailyMinutes} onChange={setDailyMinutes} numeric suffix="min" />
                </div>
                <label className="grid gap-2">
                  <span className="settings-field-label">Objetivo competitivo</span>
                  <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={2} className="settings-textarea" />
                </label>
                <OptionGroup label="Modos principales">
                  {modeOptions.map((mode) => (
                    <OptionButton key={mode} active={mainModes.includes(mode)} onClick={() => setMainModes(toggleValue(mainModes, mode))}>{mode}</OptionButton>
                  ))}
                </OptionGroup>
                <OptionGroup label="Áreas prioritarias">
                  {store.skillAreas.map((area) => (
                    <OptionButton key={area.id} active={priorityAreas.includes(area.id)} onClick={() => setPriorityAreas(toggleValue(priorityAreas, area.id))}>{area.name}</OptionButton>
                  ))}
                </OptionGroup>
                <button type="button" onClick={saveLocalPreferences} className="analyzer-button">Guardar preferencias</button>
              </div>
            </article>

            <article className="settings-subpanel">
              <p className="section-kicker">Datos JSON</p>
              <h2>Backup local</h2>
              <p className="settings-muted">Solo para respaldar o restaurar datos locales.</p>
              <textarea value={payload} onChange={(event) => setPayload(event.target.value)} rows={7} placeholder="Pegá aquí un backup JSON exportado de RL Performance Lab." className="settings-textarea mt-3" />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={handleExport} className="analyzer-button violet">Exportar</button>
                <button type="button" onClick={handleImport} className="analyzer-button">Importar</button>
                <button type="button" onClick={() => { actions.resetData(); setFeedback('Datos reiniciados.'); }} className="analyzer-button orange">Reset</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tag>{store.matches.length} partidas</Tag>
                <Tag>{store.trainingSessions.length} entrenamientos</Tag>
                <Tag>{store.skillAreas.length} áreas</Tag>
              </div>
            </article>
          </section>

          <LiveStatsApiHub settings={store.settings} onSave={actions.updateSettings} />
          <MmrOcrHub settings={store.settings} playlistRanks={store.playlistRanks} onSaveSettings={actions.updateSettings} onSaveRank={actions.updatePlaylistRank} />
        </div>
      </details>

      {feedback ? <p className="dashboard-feedback">{feedback}</p> : null}
    </div>
  );
}

function TextField({ label, value, onChange, numeric, suffix, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; suffix?: string; placeholder?: string; type?: 'text' | 'password' }) {
  return (
    <label className="grid gap-2">
      <span className="settings-field-label">{label}</span>
      <div className="settings-input-wrap">
        <input value={value} onChange={(event) => onChange(event.target.value)} inputMode={numeric ? 'numeric' : 'text'} placeholder={placeholder} type={type} />
        {suffix ? <span>{suffix}</span> : null}
      </div>
    </label>
  );
}

function ToggleRow({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={`settings-option flex w-full items-center justify-between gap-3 ${active ? 'is-active' : ''}`}>
      <span>{label}</span>
      <strong className={active ? 'text-cyan-100' : 'text-slate-400'}>{active ? 'ON' : 'OFF'}</strong>
    </button>
  );
}

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="settings-field-label">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function OptionButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`settings-option${active ? ' is-active' : ''}`}>
      {children}
    </button>
  );
}
