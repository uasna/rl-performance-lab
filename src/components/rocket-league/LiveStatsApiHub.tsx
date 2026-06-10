import { useEffect, useRef, useState } from 'react';
import {
  configureStatsApi,
  checkStatsApiPort,
  getStatsApiConfigStatus,
  listenStatsApiMessage,
  listenStatsApiStatus,
  startStatsApiStream,
  stopStatsApiStream,
  isElectronRuntime,
  selectStatsApiConfig,
  type StatsApiConfigStatus,
} from '../../lib/electronBridge';
import { appendLiveShotTelemetry, clearLiveShotTelemetry, extractLiveShotTelemetry, exportLiveTelemetryJson, loadLiveShotTelemetry, type LiveShotTelemetry } from '../../lib/liveShotTelemetry';
import type { EpicAccountConnection, LiveStatsApiSettings, RocketLeagueSettings } from '../../types/rocketLeague';

type Props = {
  settings: RocketLeagueSettings;
  onSave: (settings: Partial<RocketLeagueSettings>) => void;
  compact?: boolean;
};

type LiveMessage = {
  id: string;
  event: string;
  receivedAt: string;
  summary: string;
};

type LivePlayerIdentity = {
  name: string;
  primaryId: string;
  platform: EpicAccountConnection['platform'];
  uid: string;
};

type LiveStatsState = {
  connected: boolean;
  connecting: boolean;
  messageCount: number;
  lastEvent: string;
  lastMessageAt: string;
  matchGuid: string;
  arena: string;
  timeSeconds: number;
  blueScore: number;
  orangeScore: number;
  targetName: string;
  speed: number;
  boost: number;
  supersonic: boolean;
  touches: number;
  shots: number;
  saves: number;
  goals: number;
  demos: number;
  detectedIdentity: LivePlayerIdentity | null;
  error: string;
};


type StatsApiPlayer = {
  Name?: string;
  PrimaryId?: string;
  TeamNum?: number;
  Score?: number;
  Goals?: number;
  Shots?: number;
  Assists?: number;
  Saves?: number;
  Touches?: number;
  CarTouches?: number;
  Demos?: number;
  Speed?: number;
  Boost?: number;
  bSupersonic?: boolean;
};

type StatsApiTeam = {
  Name?: string;
  TeamNum?: number;
  Score?: number;
};


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DEFAULT_LIVE: LiveStatsApiSettings = {
  enabled: false,
  port: 49123,
  packetSendRate: 10,
  autoConnect: false,
  status: 'no_configurada',
  configPath: '',
  lastConnectedAt: '',
  lastMessageAt: '',
  lastError: '',
};

const INITIAL_STATE: LiveStatsState = {
  connected: false,
  connecting: false,
  messageCount: 0,
  lastEvent: 'Sin conexión',
  lastMessageAt: '',
  matchGuid: '',
  arena: '',
  timeSeconds: 0,
  blueScore: 0,
  orangeScore: 0,
  targetName: '',
  speed: 0,
  boost: 0,
  supersonic: false,
  touches: 0,
  shots: 0,
  saves: 0,
  goals: 0,
  demos: 0,
  detectedIdentity: null,
  error: '',
};

function platformFromPrimaryId(primaryId: string): LivePlayerIdentity['platform'] {
  const platform = primaryId.split('|')[0]?.toLowerCase() ?? '';
  if (platform.includes('epic')) return 'Epic';
  if (platform.includes('steam')) return 'Steam';
  if (platform.includes('ps') || platform.includes('playstation')) return 'PlayStation';
  if (platform.includes('xbox')) return 'Xbox';
  if (platform.includes('switch')) return 'Switch';
  return 'Desconocida';
}

function uidFromPrimaryId(primaryId: string): string {
  const parts = primaryId.split('|');
  return parts[1] ?? primaryId;
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}


function readKey(record: unknown, keys: string[]): unknown {
  if (!isRecord(record)) return undefined;
  for (const key of keys) {
    if (key in record) return record[key];
  }
  const lowerMap = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actual = lowerMap.get(key.toLowerCase());
    if (actual) return record[actual];
  }
  return undefined;
}

function parseObjectMaybe(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readRecord(record: unknown, keys: string[]): Record<string, unknown> | undefined {
  return parseObjectMaybe(readKey(record, keys));
}

function readArray(record: unknown, keys: string[]): Record<string, unknown>[] {
  const value = readKey(record, keys);
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readString(record: unknown, keys: string[], fallback = ''): string {
  const value = readKey(record, keys);
  return value === undefined || value === null ? fallback : String(value);
}

function readNumber(record: unknown, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = readKey(record, [key]);
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeTeamNum(value: unknown): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const label = String(value ?? '').toLowerCase();
  if (label.includes('orange')) return 1;
  return 0;
}

type NormalizedLivePayload = {
  event: string;
  data: Record<string, unknown>;
  game: Record<string, unknown>;
  players: StatsApiPlayer[];
  teams: StatsApiTeam[];
  rawKeys: string[];
};

function normalizeStatsApiPayload(parsed: unknown): NormalizedLivePayload | null {
  const root = parseObjectMaybe(parsed);
  if (!root) return null;
  const data = parseObjectMaybe(readKey(root, ['Data', 'data', 'Payload', 'payload', 'Body', 'body'])) ?? root;
  const event = readString(root, ['Event', 'event', 'EventName', 'eventName', 'type', 'Type'], readString(data, ['Event', 'event', 'EventName', 'eventName', 'type', 'Type'], 'UpdateState'));
  const game = readRecord(data, ['Game', 'game', 'Match', 'match', 'State', 'state']) ?? data;
  const players = (readArray(data, ['Players', 'players', 'PlayerStats', 'playerStats'])
    .concat(readArray(game, ['Players', 'players', 'PlayerStats', 'playerStats'])) as StatsApiPlayer[])
    .filter((player, index, list) => {
      const id = String(readKey(player, ['PrimaryId', 'primaryId', 'Name', 'name']) ?? index);
      return list.findIndex((item, itemIndex) => String(readKey(item, ['PrimaryId', 'primaryId', 'Name', 'name']) ?? itemIndex) === id) === index;
    });
  const teams = (readArray(game, ['Teams', 'teams']).concat(readArray(data, ['Teams', 'teams'])) as StatsApiTeam[]);
  return { event, data, game, players, teams, rawKeys: Object.keys(root).concat(Object.keys(data).map((key) => `Data.${key}`)) };
}

function getTeamScore(teams: StatsApiTeam[], data: Record<string, unknown>, teamNum: number): number {
  const team = teams.find((item) => normalizeTeamNum(readKey(item, ['TeamNum', 'teamNum', 'Num', 'num', 'Team', 'team'])) === teamNum) ?? teams[teamNum];
  if (team) return readNumber(team, ['Score', 'score', 'Goals', 'goals'], 0);
  return teamNum === 0
    ? readNumber(data, ['BlueScore', 'blueScore', 'Team0Score', 'team0Score', 'BlueGoals', 'blueGoals'], 0)
    : readNumber(data, ['OrangeScore', 'orangeScore', 'Team1Score', 'team1Score', 'OrangeGoals', 'orangeGoals'], 0);
}

function pickLiveTarget(players: StatsApiPlayer[], game: Record<string, unknown>) {
  const targetRecord = readRecord(game, ['Target', 'target', 'ViewerTarget', 'viewerTarget']);
  const targetName = readString(targetRecord, ['Name', 'name'], '');
  if (targetName) return players.find((player) => readString(player, ['Name', 'name']) === targetName) ?? players[0];
  return players.find((player) => readString(player, ['PrimaryId', 'primaryId']).toLowerCase().startsWith('epic|')) ?? players[0];
}

type PlayerCounter = { shots: number; goals: number; saves: number; touches: number; lastTrainingTouchCandidate: number };

function deriveTelemetryFromUpdateState(
  event: string,
  data: Record<string, unknown>,
  game: Record<string, unknown>,
  players: StatsApiPlayer[],
  previous: Record<string, PlayerCounter>,
): LiveShotTelemetry[] {
  if (event !== 'UpdateState' || players.length === 0) return [];
  const now = new Date().toISOString();
  const matchGuid = readString(data, ['MatchGuid', 'matchGuid'], readString(game, ['MatchGuid', 'matchGuid'], 'live-match'));
  const arena = readString(game, ['Arena', 'arena', 'Map', 'map'], '');
  const timeSeconds = readNumber(game, ['TimeSeconds', 'timeSeconds'], readNumber(data, ['TimeSeconds', 'timeSeconds'], 0));
  const elapsed = readNumber(game, ['Elapsed', 'elapsed'], 0);
  const shots: LiveShotTelemetry[] = [];

  for (const player of players) {
    const name = readString(player, ['Name', 'name'], 'Cuenta RL');
    const key = readString(player, ['PrimaryId', 'primaryId'], name);
    const old = previous[key];
    const team = normalizeTeamNum(readKey(player, ['TeamNum', 'teamNum', 'Team', 'team']));
    const current = {
      shots: readNumber(player, ['Shots', 'shots'], 0),
      goals: readNumber(player, ['Goals', 'goals'], 0),
      saves: readNumber(player, ['Saves', 'saves'], 0),
      touches: readNumber(player, ['Touches', 'touches', 'CarTouches', 'carTouches'], 0),
      lastTrainingTouchCandidate: old?.lastTrainingTouchCandidate ?? 0,
    };

    const base = {
      capturedAt: now,
      matchGuid,
      playerName: name,
      playerTeamNum: team,
      arena,
      timeSeconds,
      elapsed,
      playerSpeed: readNumber(player, ['Speed', 'speed'], 0),
      playerBoost: readNumber(player, ['Boost', 'boost'], 0),
      rawEvent: event,
    };

    if (old) {
      if (current.shots > old.shots) {
        shots.push({
          ...base,
          id: `${matchGuid}-derived-shot-${key}-${current.shots}-${Math.round(timeSeconds)}`.replace(/[^a-z0-9-_]/gi, '-'),
          event: 'ShotCandidate',
          ratingScore: 58,
          reason: 'Tiro detectado por aumento del contador Shots en UpdateState. Se usará como candidato de pack hasta que BallHit entregue física exacta.',
        });
      }
      if (current.goals > old.goals) {
        shots.push({
          ...base,
          id: `${matchGuid}-derived-goal-${key}-${current.goals}-${Math.round(timeSeconds)}`.replace(/[^a-z0-9-_]/gi, '-'),
          event: 'GoalScored',
          goalSpeed: 0,
          ratingScore: 72,
          reason: 'Gol detectado por aumento del contador Goals en UpdateState. Candidato ofensivo para pack/revisión.',
        });
      }
      if (current.saves > old.saves) {
        shots.push({
          ...base,
          id: `${matchGuid}-derived-save-${key}-${current.saves}-${Math.round(timeSeconds)}`.replace(/[^a-z0-9-_]/gi, '-'),
          event: 'StatfeedEvent',
          ratingScore: 64,
          reason: 'Save detectado por aumento del contador Saves en UpdateState. Candidato defensivo futuro.',
        });
      }

      // Algunas sesiones de Rocket League no emiten BallHit/Shot events, pero UpdateState sí entrega touches.
      // Para que el generador no quede muerto, guardamos una ventana de entrenamiento cada 4 toques nuevos
      // o cada ráfaga importante de touches. Estos candidatos son de baja confianza, no geometría exacta.
      const touchDelta = current.touches - old.touches;
      const touchWindowReady = current.touches >= 2 && current.touches - (old.lastTrainingTouchCandidate || 0) >= 4;
      if (touchDelta > 0 && touchWindowReady) {
        current.lastTrainingTouchCandidate = current.touches;
        shots.push({
          ...base,
          id: `${matchGuid}-derived-touch-${key}-${current.touches}-${Math.round(timeSeconds)}`.replace(/[^a-z0-9-_]/gi, '-'),
          event: 'TrainingTouch',
          ratingScore: 54,
          reason: 'Ventana de toque/ataque detectada por Stats API. Sirve para generar pack de práctica seguro mientras no haya BallHit con posición exacta.',
        });
      }
    }

    previous[key] = current;
  }

  return shots;
}
function formatClock(seconds: number) {
  if (!seconds) return '--:--';
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function LiveStatsApiHub({ settings, onSave, compact = false }: Props) {
  const liveSettings = { ...DEFAULT_LIVE, ...(settings.liveStatsApi ?? {}) };
  const [configStatus, setConfigStatus] = useState<StatsApiConfigStatus | null>(null);
  const [state, setState] = useState<LiveStatsState>(INITIAL_STATE);
  const [events, setEvents] = useState<LiveMessage[]>([]);
  const [shotTelemetryCount, setShotTelemetryCount] = useState(() => loadLiveShotTelemetry().length);
  const [portMessage, setPortMessage] = useState('');
  const streamingRef = useRef(false);
  const playerCountersRef = useRef<Record<string, PlayerCounter>>({});

  async function refreshConfig() {
    if (!isElectronRuntime()) return;
    const result = await getStatsApiConfigStatus();
    setConfigStatus(result);
    onSave({ liveStatsApi: { ...liveSettings, configPath: result.configPath, port: result.port, packetSendRate: result.packetSendRate, status: result.configured ? 'configurada' : liveSettings.status } });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshConfig();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isElectronRuntime()) return () => undefined;
    const disposeMessage = listenStatsApiMessage((payload) => handleLiveMessage(JSON.stringify(payload)));
    const disposeStatus = listenStatsApiStatus((payload) => {
      setState((current) => ({
        ...current,
        connected: Boolean(payload.connected),
        connecting: Boolean(payload.connecting),
        error: payload.message || current.error,
        lastEvent: payload.connected ? (current.lastEvent === 'Sin conexión' ? 'Socket activo' : current.lastEvent) : current.lastEvent,
      }));
      if (payload.connected) updateLiveSettings({ status: 'conectada', lastError: '', port: payload.port || liveSettings.port });
      else if (payload.connecting) updateLiveSettings({ status: 'conectando', lastError: payload.message });
    });
    if (liveSettings.autoConnect && liveSettings.enabled) connect();
    return () => {
      disposeMessage();
      disposeStatus();
      void disconnect(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLiveSettings(next: Partial<LiveStatsApiSettings>) {
    onSave({ liveStatsApi: { ...liveSettings, ...next } });
  }

  async function chooseConfig() {
    if (!isElectronRuntime()) return;
    const result = await selectStatsApiConfig();
    setConfigStatus(result);
    updateLiveSettings({ configPath: result.configPath, port: result.port, packetSendRate: result.packetSendRate, status: result.configured ? 'configurada' : 'no_configurada' });
  }

  async function enableStatsApi() {
    if (!isElectronRuntime()) return;
    const activePort = Number(liveSettings.port) > 0 ? Number(liveSettings.port) : 49123;
    const activeRate = Number(liveSettings.packetSendRate) > 0 ? Number(liveSettings.packetSendRate) : 10;
    const result = await configureStatsApi({ configPath: liveSettings.configPath || configStatus?.configPath, port: activePort, packetSendRate: activeRate });
    setConfigStatus(result);
    updateLiveSettings({ enabled: true, configPath: result.configPath, port: result.port || activePort, packetSendRate: result.packetSendRate || activeRate, status: result.configured ? 'configurada' : 'error', lastError: result.ok ? '' : result.message });
  }

  async function checkLocalPort() {
    if (!isElectronRuntime()) return;
    const result = await checkStatsApiPort({ port: liveSettings.port || 49123 });
    setPortMessage(result.message);
    if (!result.ok) {
      setState((current) => ({ ...current, error: result.message }));
    }
  }

  async function disconnect(save = true) {
    streamingRef.current = false;
    if (isElectronRuntime()) await stopStatsApiStream();
    setState((current) => ({ ...current, connected: false, connecting: false }));
    if (save) updateLiveSettings({ status: 'configurada' });
  }

  async function connect() {
    if (!isElectronRuntime()) {
      setState((current) => ({ ...current, error: 'La lectura Stats API requiere Electron.' }));
      return;
    }
    const activeRate = Number(liveSettings.packetSendRate) > 0 ? Number(liveSettings.packetSendRate) : 10;
    const activePort = Number(liveSettings.port) > 0 ? Number(liveSettings.port) : 49123;
    streamingRef.current = true;
    setState((current) => ({ ...current, connecting: true, error: `Conectando por socket TCP local en 127.0.0.1:${activePort}` }));
    updateLiveSettings({ enabled: true, status: 'conectando', port: activePort, packetSendRate: activeRate });
    const result = await startStatsApiStream({ port: activePort, host: '127.0.0.1' });
    setState((current) => ({
      ...current,
      connected: Boolean(result.connected),
      connecting: Boolean(result.connecting),
      error: result.message,
    }));
  }

  function handleLiveMessage(raw: unknown) {
    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    const normalized = normalizeStatsApiPayload(parsed);
    if (!normalized) return;

    const { event, data, game, players, teams, rawKeys } = normalized;
    const target = pickLiveTarget(players, game);
    const blue = getTeamScore(teams, data, 0);
    const orange = getTeamScore(teams, data, 1);
    const primaryId = String(readKey(target, ['PrimaryId', 'primaryId']) ?? '');
    const detectedIdentity = primaryId
      ? { name: String(readKey(target, ['Name', 'name']) ?? 'Cuenta RL'), primaryId, platform: platformFromPrimaryId(primaryId), uid: uidFromPrimaryId(primaryId) }
      : null;
    const now = new Date().toISOString();
    const timeSeconds = readNumber(game, ['TimeSeconds', 'timeSeconds'], readNumber(data, ['TimeSeconds', 'timeSeconds', 'GoalTime', 'goalTime'], 0));
    const arena = readString(game, ['Arena', 'arena', 'Map', 'map', 'MapName', 'mapName'], readString(data, ['Arena', 'arena', 'Map', 'map', 'MapName', 'mapName'], ''));

    setState((current) => ({
      ...current,
      connected: true,
      connecting: false,
      messageCount: current.messageCount + 1,
      lastEvent: event,
      lastMessageAt: now,
      matchGuid: readString(data, ['MatchGuid', 'matchGuid'], readString(game, ['MatchGuid', 'matchGuid'], current.matchGuid ?? '')),
      arena: arena || current.arena || '',
      timeSeconds: timeSeconds || current.timeSeconds,
      blueScore: normalizeNumber(blue),
      orangeScore: normalizeNumber(orange),
      targetName: String(readKey(target, ['Name', 'name']) ?? readString(readRecord(game, ['Target', 'target']), ['Name', 'name'], current.targetName ?? '')),
      speed: readNumber(target, ['Speed', 'speed'], current.speed),
      boost: readNumber(target, ['Boost', 'boost'], current.boost),
      supersonic: Boolean(readKey(target, ['bSupersonic', 'supersonic', 'bIsSupersonic']) ?? current.supersonic),
      touches: readNumber(target, ['Touches', 'touches', 'CarTouches', 'carTouches'], current.touches),
      shots: readNumber(target, ['Shots', 'shots'], current.shots),
      saves: readNumber(target, ['Saves', 'saves'], current.saves),
      goals: readNumber(target, ['Goals', 'goals'], current.goals),
      demos: readNumber(target, ['Demos', 'demos', 'Demolitions', 'demolitions'], current.demos),
      detectedIdentity: detectedIdentity ?? current.detectedIdentity,
      error: '',
    }));
    const shotTelemetry = extractLiveShotTelemetry(event, data, game);
    const derivedTelemetry = deriveTelemetryFromUpdateState(event, data, game, players, playerCountersRef.current);
    const shouldShowEvent = event !== 'UpdateState' || derivedTelemetry.length > 0;
    if (shouldShowEvent) {
      const shownEvent = event === 'UpdateState' && derivedTelemetry.length ? 'TrainingCandidate' : event;
      const summary = event === 'UpdateState' && derivedTelemetry.length
        ? `${derivedTelemetry.length} candidato(s) creados desde touches/shots/goals · ${arena || 'arena'}`
        : summarizeEvent(event, data, game, players, rawKeys);
      setEvents((current) => [
        { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, event: shownEvent, receivedAt: now, summary },
        ...current,
      ].slice(0, 8));
    }

    const telemetryItems = [shotTelemetry, ...derivedTelemetry].filter(Boolean) as LiveShotTelemetry[];
    if (telemetryItems.length) {
      let nextShots = loadLiveShotTelemetry();
      for (const item of telemetryItems) nextShots = appendLiveShotTelemetry(item);
      setShotTelemetryCount(nextShots.length);
    }

    updateLiveSettings({ status: 'conectada', lastMessageAt: now, lastError: '' });
  }

  function saveDetectedIdentity() {
    if (!state.detectedIdentity) return;
    const identity = state.detectedIdentity;
    onSave({
      epicAccount: {
        ...(settings.epicAccount ?? { status: 'desconectada', displayName: '', epicAccountId: '', platform: 'Epic', profileUrl: '' }),
        status: 'conectada',
        displayName: identity.name,
        epicAccountId: identity.uid,
        platform: identity.platform,
        connectedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        notes: `Detectado por Stats API local: ${identity.primaryId}`,
      },
      liveStatsApi: { ...liveSettings, status: 'conectada', enabled: true, lastMessageAt: new Date().toISOString() },
    });
  }

  return (
    <section className={`analyzer-card live-api-card${compact ? ' compact' : ''}`}>
      <div className="live-api-header">
        <div>
          <p className="pdf-card-label">Live data hub</p>
          <strong>Epic + Stats API local</strong>
          <span>Conecta la app al socket TCP local de Rocket League para stats en vivo mientras jugás.</span>
        </div>
        <span className={`analyzer-pill ${state.connected ? 'green' : state.connecting ? 'cyan' : 'ghost'}`}>{state.connected ? 'LIVE' : state.connecting ? 'Conectando' : 'Offline'}</span>
      </div>

      <div className="live-api-controls">
        <label><span>Puerto</span><input value={liveSettings.port} onChange={(event) => updateLiveSettings({ port: Number(event.target.value) || 49123 })} /></label>
        <label><span>PacketSendRate</span><input value={Number(liveSettings.packetSendRate) > 0 ? liveSettings.packetSendRate : 10} min={1} max={120} onChange={(event) => updateLiveSettings({ packetSendRate: Number(event.target.value) > 0 ? Number(event.target.value) : 10 })} /></label>
        <button type="button" onClick={refreshConfig} disabled={!isElectronRuntime()}>Comprobar</button>
        <button type="button" onClick={chooseConfig} disabled={!isElectronRuntime()}>Seleccionar ini</button>
        <button type="button" onClick={enableStatsApi} disabled={!isElectronRuntime()}>Activar Stats API</button>
        <button type="button" onClick={checkLocalPort} disabled={!isElectronRuntime()}>Probar puerto</button>
        <button type="button" className="install" onClick={state.connected ? () => { void disconnect(true); } : () => { void connect(); }}>{state.connected ? 'Desconectar' : state.connecting ? 'Esperando live' : 'Conectar live'}</button>
      </div>

      <div className="live-api-grid">
        <LiveStat label="Evento" value={state.lastEvent} />
        <LiveStat label="Marcador" value={`${state.blueScore}-${state.orangeScore}`} />
        <LiveStat label="Tiempo" value={formatClock(state.timeSeconds)} />
        <LiveStat label="Arena" value={state.arena || 'Sin partida'} />
        <LiveStat label="Boost" value={state.boost ? `${state.boost}%` : '0%'} />
        <LiveStat label="Speed" value={state.speed ? `${Math.round(state.speed)}` : '0'} />
        <LiveStat label="Touches" value={state.touches} />
        <LiveStat label="Msgs" value={state.messageCount} />
      </div>

      {state.detectedIdentity ? (
        <div className="live-identity-strip">
          <div><span>Cuenta detectada</span><strong>{state.detectedIdentity.name}</strong><em>{state.detectedIdentity.primaryId}</em></div>
          <button type="button" onClick={saveDetectedIdentity}>Guardar como cuenta vinculada</button>
        </div>
      ) : null}


      <div className="live-telemetry-strip">
        <div>
          <span>Shot telemetry</span>
          <strong>{shotTelemetryCount}</strong>
          <em>BallHit / tiros / goles / ventanas de toque guardados localmente</em>
        </div>
        <button type="button" onClick={() => { exportLiveTelemetryJson(); setShotTelemetryCount(loadLiveShotTelemetry().length); }}>Exportar shots</button>
        <button type="button" onClick={() => { clearLiveShotTelemetry(); setShotTelemetryCount(0); }}>Limpiar shots</button>
      </div>

      <div className="live-session-summary">
        <span><strong>{state.shots}</strong>Shots de la cuenta</span>
        <span><strong>{state.goals}</strong>Goals de la cuenta</span>
        <span><strong>{state.saves}</strong>Saves de la cuenta</span>
        <span><strong>{state.touches}</strong>Touches detectados</span>
      </div>

      {events.length ? (
        <div className="live-event-list is-compact">
          {events.map((item) => <p key={item.id}><strong>{item.event}</strong><span>{item.summary}</span></p>)}
        </div>
      ) : null}

      <p className={state.error ? 'pack-warning' : 'account-hint'}>{state.error || portMessage || configStatus?.message || 'Stats API activa. UpdateState se resume arriba; solo se listan eventos útiles para evitar ruido visual.'}</p>
    </section>
  );
}

function summarizeEvent(event: string, data: Record<string, unknown>, game: Record<string, unknown>, players: StatsApiPlayer[] = [], rawKeys: string[] = []) {
  if (event === 'GoalScored') return `Gol · ${readString(readRecord(data, ['Scorer', 'scorer']), ['Name', 'name'], 'sin scorer')} · ${Math.round(readNumber(data, ['GoalSpeed', 'goalSpeed'], 0))} uu/s`;
  if (event === 'BallHit') return `Ball hit · ${readString(players[0], ['Name', 'name'], 'sin jugador')} · ${Math.round(readNumber(readRecord(data, ['Ball', 'ball']), ['PostHitSpeed', 'postHitSpeed'], 0))} uu/s`;
  if (event === 'ClockUpdatedSeconds') return `${formatClock(readNumber(data, ['TimeSeconds', 'timeSeconds'], 0))}`;
  if (event === 'UpdateState') {
    const teams = readArray(game, ['Teams', 'teams']) as StatsApiTeam[];
    const blue = getTeamScore(teams, data, 0);
    const orange = getTeamScore(teams, data, 1);
    return `${readString(game, ['Arena', 'arena', 'Map', 'map'], 'arena')} · ${blue}-${orange} · jugadores ${players.length}${rawKeys.length ? ` · keys ${rawKeys.slice(0, 5).join(', ')}` : ''}`;
  }
  if (event === 'StatfeedEvent') return `${readString(data, ['Type', 'type', 'EventName', 'eventName'], 'Statfeed')}`;
  return event;
}

function LiveStat({ label, value }: { label: string; value: string | number }) {
  return <div className="live-stat"><span>{label}</span><strong>{value}</strong></div>;
}
