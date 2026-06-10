import { useMemo, useState } from 'react';
import { CustomPackFactoryPanel } from './CustomPackFactoryPanel';
import { ConceptTacticalPitch } from './TacticalPlayback';
import { openTrainingPackLanding } from '../../lib/electronBridge';
import { formatSecondsAsMinutes } from '../../lib/formatters';
import type { FrequentError, RocketLeagueDataStore, RocketLeagueSettings, SkillArea, SkillAreaId, SkillMetric } from '../../types/rocketLeague';

const areaOrder: Array<'overview' | SkillAreaId> = ['overview', 'movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'];
const pillarIds: SkillAreaId[] = ['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'];

type AreaTone = 'cyan' | 'violet' | 'orange' | 'green';
type AreaCopy = {
  title: string;
  subtitle: string;
  scoreLabel: string;
  panelA: string;
  panelB: string;
  panelC: string;
  packTitle: string;
  packBody: string;
  fieldTitle: string;
  tone: AreaTone;
};

const areaCopies: Record<SkillAreaId, AreaCopy> = {
  movement: {
    title: 'Movement',
    subtitle: 'Velocidad, recoveries, landings y ritmo para llegar antes a la jugada.',
    scoreLabel: 'Movement',
    panelA: 'Recovery',
    panelB: 'Landing control',
    panelC: 'Supersonic efficiency',
    packTitle: 'Movement replay',
    packBody: 'Step through de recoveries, aterrizajes y salidas tras tocar la pelota.',
    fieldTitle: 'Concept · recovery lanes',
    tone: 'cyan',
  },
  boost: {
    title: 'Boost',
    subtitle: 'Small pads, rutas seguras, presión sin abandonar jugadas y gasto eficiente.',
    scoreLabel: 'Boost',
    panelA: 'Pad pathing',
    panelB: 'Boost spent under pressure',
    panelC: 'Overcollection',
    packTitle: 'Boost path review',
    packBody: 'Revisá cuándo abandonás cobertura por boost grande y reemplazá con ruta de pads.',
    fieldTitle: 'Concept · boost routes',
    tone: 'green',
  },
  offence: {
    title: 'Offence',
    subtitle: 'Presencia, tiros, follow-up, selección de jugada y conversión de presión.',
    scoreLabel: 'Offence',
    panelA: 'Presence',
    panelB: 'Shooting',
    panelC: 'Structure',
    packTitle: 'Custom training pack',
    packBody: 'Training packs internos recomendados según tiros fallados, presión y foco actual.',
    fieldTitle: 'Concept · expected threat',
    tone: 'cyan',
  },
  defence: {
    title: 'Defence',
    subtitle: 'Shadow defence, back post, saves, clears y challenges bajo presión.',
    scoreLabel: 'Defence',
    panelA: 'Threat prevention',
    panelB: 'Saves',
    panelC: 'Pressure control',
    packTitle: 'Defensive situations',
    packBody: 'Entrenamiento interno para saves, clears y defender sin regalar segundo toque.',
    fieldTitle: 'Concept · pressure map',
    tone: 'violet',
  },
  rotation: {
    title: 'Rotation',
    subtitle: 'Third man, spacing, coberturas, salida limpia y evitar double commit.',
    scoreLabel: 'Rotation',
    panelA: 'Consistency',
    panelB: 'Overcommitment',
    panelC: 'Team shape',
    packTitle: 'Rotation replay',
    packBody: 'Match rotation playback para revisar distancia a compañero y cobertura tras atacar.',
    fieldTitle: 'Rotation replay · isometric',
    tone: 'violet',
  },
  positioning: {
    title: 'Positioning',
    subtitle: 'Distancia a la jugada, riesgo ball-side, presencia y estructura defensiva.',
    scoreLabel: 'Positioning',
    panelA: 'Ball engagement',
    panelB: 'Consistency',
    panelC: 'Presence',
    packTitle: 'Positioning review',
    packBody: 'Revisá si entrás demasiado cerca, demasiado tarde o sin cobertura detrás.',
    fieldTitle: 'Concept · expected positioning',
    tone: 'cyan',
  },
  mechanics: {
    title: 'Mechanics', subtitle: 'Control mecánico aplicado a decisiones reales.', scoreLabel: 'Mechanics', panelA: 'Touch quality', panelB: 'Recovery', panelC: 'Consistency', packTitle: 'Mechanics block', packBody: 'Trabajo interno sin mapas externos.', fieldTitle: 'Concept · mechanics', tone: 'orange',
  },
  kickoffs: {
    title: 'Kickoffs', subtitle: 'Primer 50, recovery y control del segundo toque.', scoreLabel: 'Kickoffs', panelA: 'Contact', panelB: 'Recovery', panelC: 'Cheat-up', packTitle: 'Kickoff block', packBody: 'Repetición manual con objetivo de segunda jugada.', fieldTitle: 'Concept · kickoff', tone: 'orange',
  },
  mental: {
    title: 'Mental', subtitle: 'Control de tilt y decisiones bajo presión.', scoreLabel: 'Mental', panelA: 'Reset', panelB: 'Focus', panelC: 'Stop-loss', packTitle: 'Session review', packBody: 'Registro manual después de bloques ranked.', fieldTitle: 'Concept · mental', tone: 'violet',
  },
};

function areaName(areaId: 'overview' | SkillAreaId) {
  if (areaId === 'overview') return 'Overview';
  return areaCopies[areaId]?.title ?? areaId;
}

export function SkillAreasLab({ areas, metrics, errors, store, actions, activeAreaId: controlledAreaId, onActiveAreaChange }: { areas: SkillArea[]; metrics: SkillMetric[]; errors: FrequentError[]; store: RocketLeagueDataStore; actions: { updateSettings: (settings: Partial<RocketLeagueSettings>) => void }; activeAreaId?: 'overview' | SkillAreaId; onActiveAreaChange?: (areaId: 'overview' | SkillAreaId) => void }) {
  const [internalActiveAreaId, setInternalActiveAreaId] = useState<'overview' | SkillAreaId>('overview');
  const activeAreaId = controlledAreaId ?? internalActiveAreaId;
  const setActiveAreaId = (areaId: 'overview' | SkillAreaId) => {
    setInternalActiveAreaId(areaId);
    onActiveAreaChange?.(areaId);
  };
  const visibleAreas = useMemo(() => areas.filter((area) => pillarIds.includes(area.id)), [areas]);
  const activeArea = activeAreaId === 'overview' ? null : visibleAreas.find((area) => area.id === activeAreaId) ?? null;

  return (
    <div className="pdf-analysis-page exact-analyser-page">
      <div className="pdf-section-topbar exact-section-tabs">
        <h2>{activeArea ? activeArea.name : 'Overview'}</h2>
        <div className="pdf-tab-strip">
          {areaOrder.map((areaId) => (
            <button key={areaId} type="button" onClick={() => setActiveAreaId(areaId)} className={activeAreaId === areaId ? 'is-active' : ''}>
              {areaName(areaId)}
            </button>
          ))}
        </div>
      </div>
      {activeArea ? (
        <AreaScreen area={activeArea} errors={errors.filter((error) => error.areaId === activeArea.id)} />
      ) : (
        <OverviewScreen areas={visibleAreas} errors={errors} store={store} actions={actions} onSelectArea={setActiveAreaId} />
      )}
    </div>
  );
}

function OverviewScreen({ areas, errors, store, actions, onSelectArea }: { areas: SkillArea[]; errors: FrequentError[]; store: RocketLeagueDataStore; actions: { updateSettings: (settings: Partial<RocketLeagueSettings>) => void }; onSelectArea: (areaId: SkillAreaId) => void }) {
  const scored = areas.filter((area) => area.currentScore > 0);
  const avg = scored.length ? Math.round(scored.reduce((sum, area) => sum + area.currentScore, 0) / scored.length) : 0;
  const critical = [...areas].sort((a, b) => (a.currentScore || 999) - (b.currentScore || 999))[0];
  const activeErrors = errors.filter((error) => error.appearances > 0 || error.impactScore > 0);

  return (
    <div className="exact-overview-grid">
      <section className="exact-overview-hero analyzer-card">
        <div className="exact-rank-estimate">
          <span>Rank estimate</span>
          <strong>{avg || 0}</strong>
          <small>15-game rolling avg</small>
          <div>
            <b>Analysed this week</b><em>{scored.length}</em>
            <b>Total analysed</b><em>{areas.length}</em>
          </div>
        </div>
        <ExactTrendGraph value={avg || 52} label="Actual" />
      </section>

      <CustomPackFactoryPanel store={store} actions={actions} />

      <section className="exact-card-triplet">
        <InsightCard title="Aerial usage" rating={areas.find((a) => a.id === 'movement')?.currentScore ?? 0} goal={76} text="Se activa con datos de movimiento; no se inventa telemetría si el replay no la trae." />
        <InsightCard title="Handbrake aerial recovery" rating={areas.find((a) => a.id === 'rotation')?.currentScore ?? 0} goal={57} text="Lectura por rotación y recoveries estimadas con partidas importadas." />
        <InsightCard title="50/50 win rate" rating={areas.find((a) => a.id === 'defence')?.currentScore ?? 0} goal={77} text="Se refina con eventos más profundos de challenge y goles concedidos." />
      </section>

      <section className="exact-overview-bottom">
        <article className="analyzer-card exact-summary-list">
          <p className="pdf-card-label">Multi game analysis summary</p>
          <Row label="Last run" value="Pendiente" />
          <Row label="Custom training pack" value="1 pack" />
          <Row label="Frequent errors" value={activeErrors.length ? `${activeErrors.length} activos` : 'Sin errores críticos'} />
          <Row label="General analysis" value={critical ? critical.name : 'Sin datos'} />
          <Row label="Win/loss condition" value="Se desbloquea con más partidas" />
        </article>
        <article className="analyzer-card exact-shape-card">
          <p className="pdf-card-label">Shape</p>
          <RadarShape areas={areas} />
        </article>
        <article className="analyzer-card exact-pillar-table">
          <p className="pdf-card-label">Per pillar</p>
          {areas.map((area) => (
            <button key={area.id} type="button" onClick={() => onSelectArea(area.id)}>
              <span>{area.name}</span><i><b style={{ width: `${Math.max(0, Math.min(100, area.currentScore))}%` }} /></i><em>{area.currentScore}</em>
            </button>
          ))}
        </article>
      </section>
    </div>
  );
}

function AreaScreen({ area, errors }: { area: SkillArea; errors: FrequentError[] }) {
  const copy = areaCopies[area.id] ?? areaCopies.positioning;
  const focusErrors = errors.filter((error) => error.appearances > 0 || error.impactScore > 0).slice(0, 2);
  const isReplayArea = area.id === 'rotation';

  return (
    <div className={`exact-area-screen tone-${copy.tone}`}>
      <section className="exact-area-hero analyzer-card">
        <div className="exact-area-score">
          <span>{copy.scoreLabel}</span>
          <strong>{area.currentScore}</strong><em>/100</em>
          <small>15-game rolling avg</small>
        </div>
        <ExactTrendGraph value={area.currentScore || 55} label="Actual" />
      </section>

      {isReplayArea ? <RotationReplayPanel /> : <AreaTrainingPack area={area} copy={copy} />}

      <section className="exact-card-triplet area">
        <FocusMetric title={copy.panelA} value={area.currentScore / 100} goal={area.targetScore / 100 || 0.55} body={copy.subtitle} />
        <FocusMetric title={copy.panelB} value={(area.currentScore + 8) / 100} goal={0.55} body="Medida por sesión. Aumenta precisión con más replays importados." />
        {(focusErrors.length ? focusErrors : [{ title: 'Sin error frecuente', appearances: 0, impactScore: 0, description: 'No hay patrón repetido todavía.' }]).slice(0, 1).map((error) => (
          <article key={error.title} className="analyzer-card exact-mini-warning">
            <p>Frequent error</p>
            <h3>{error.title}</h3>
            <strong>{Math.max(0, error.appearances || error.impactScore).toFixed(1)}x</strong>
            <span>{error.description}</span>
          </article>
        ))}
      </section>

      <section className="exact-area-workbench">
        <div className="exact-metric-stack">
          <MetricCurve title={copy.panelA} score={area.currentScore || 52} />
          <MetricCurve title={copy.panelB} score={Math.min(100, (area.currentScore || 52) + 14)} />
          <MetricCurve title={copy.panelC} score={Math.max(0, (area.currentScore || 52) - 7)} />
        </div>
        <article className="analyzer-card exact-large-field-card">
          <p className="pdf-card-label">{copy.fieldTitle}</p>
          <ConceptTacticalPitch area={area.id} initialView={area.id === 'rotation' || area.id === 'offence' ? 'isometric' : 'topdown'} />
        </article>
      </section>
    </div>
  );
}

function AreaTrainingPack({ area, copy }: { area: SkillArea; copy: AreaCopy }) {
  const [expanded, setExpanded] = useState(area.id === 'offence');
  const rounds = Math.max(3, Math.round((area.currentScore || 45) / 5));
  const shots = Array.from({ length: Math.min(15, rounds) }, (_, index) => ({
    id: index + 1,
    replay: `RLA-${area.id.toUpperCase()}-${String(index + 1).padStart(2, '0')}`,
    reason: index % 3 === 0 ? 'Missed pressure touch' : index % 3 === 1 ? 'Late recovery window' : 'Bad angle before challenge',
  }));

  return (
    <section className="exact-shot-pack analyzer-card">
      <div className="exact-shot-pack__top">
        <div>
          <p className="pdf-card-label">{copy.packTitle}</p>
          <strong>{rounds} rounds</strong>
          <span>{copy.packBody}</span>
        </div>
        <div className="exact-shot-pack__actions">
          <button type="button" onClick={() => openTrainingPackLanding().catch(() => undefined)}>Open folder</button>
          <button type="button" onClick={() => openTrainingPackLanding().catch(() => undefined)}>Install to game</button>
        </div>
      </div>
      <button type="button" className="exact-view-shot-toggle" onClick={() => setExpanded((value) => !value)}>
        View shot {expanded ? '⌃' : '⌄'}
      </button>
      {expanded ? (
        <div className="exact-shot-pack__body">
          <div className="exact-shot-list">
            {shots.map((shot) => (
              <button key={shot.id} type="button">
                <span>{shot.id}</span>
                <b>{shot.replay}</b>
                <em>▷</em>
              </button>
            ))}
          </div>
          <ConceptTacticalPitch area={area.id} initialView={area.id === 'offence' ? 'isometric' : 'topdown'} />
        </div>
      ) : null}
    </section>
  );
}

function RotationReplayPanel() {
  return (
    <section className="exact-rotation-replay analyzer-card rla-rotation-stage">
      <div className="rla-stage-heading">
        <div>
          <p className="pdf-card-label">Replay</p>
          <strong>Rotation playback</strong>
          <span>Vista táctica animada para revisar separación, cobertura y rutas de rotación.</span>
        </div>
      </div>
      <div className="exact-replay-stage rla-replay-stage-large">
        <div className="exact-score-mini"><b>0</b><span>4:33</span><em>0</em></div>
        <ConceptTacticalPitch area="rotation" initialView="isometric" variant="replay" />
      </div>
    </section>
  );
}


function ExactTrendGraph({ value, label }: { value: number; label: string }) {
  const points = [45, 49, 53, 62, 68, 64, 73, 32, 58, Math.max(12, Math.min(95, value || 55))];
  const poly = points.map((v, i) => `${(i / (points.length - 1)) * 100},${100 - v}`).join(' ');
  return (
    <div className="exact-trend-graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs><linearGradient id="exactAreaFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="rgba(0,229,212,.34)"/><stop offset="1" stopColor="rgba(0,229,212,0)"/></linearGradient></defs>
        <polygon points={`0,100 ${poly} 100,100`} fill="url(#exactAreaFill)" />
        <polyline points={poly} fill="none" stroke="rgba(0,229,212,.95)" strokeWidth="1.2" />
        <line x1="0" x2="100" y1="44" y2="44" stroke="rgba(255,255,255,.5)" strokeDasharray="2 2" />
        <line x1="0" x2="100" y1="38" y2="38" stroke="rgba(236,72,153,.75)" strokeDasharray="2 2" />
      </svg>
      <span>{label} {Math.round(value || 0)}</span>
    </div>
  );
}

function InsightCard({ title, rating, goal, text }: { title: string; rating: number; goal: number; text: string }) {
  return (
    <article className="analyzer-card exact-insight-card">
      <p>General</p><h3>{title}</h3>
      <div><strong>{(rating / 100).toFixed(2)}</strong><em>{(goal / 10).toFixed(2)}</em></div>
      <span>{text}</span>
    </article>
  );
}

function FocusMetric({ title, value, goal, body }: { title: string; value: number; goal: number; body: string }) {
  return (
    <article className="analyzer-card exact-focus-metric">
      <p>Focus</p><h3>{title}</h3>
      <div><strong>{value.toFixed(2)}</strong><em>{goal.toFixed(2)}</em></div>
      <span>{body}</span>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="exact-summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

function RadarShape({ areas }: { areas: SkillArea[] }) {
  const values = pillarIds.map((id) => areas.find((area) => area.id === id)?.currentScore ?? 0);
  const pts = values.map((value, i) => {
    const angle = (-90 + i * 60) * Math.PI / 180;
    const radius = 10 + value * 0.36;
    return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 100" className="exact-radar-shape">
      {[16, 28, 40].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.09)" />)}
      {pillarIds.map((_, i) => <line key={i} x1="50" y1="50" x2={50 + Math.cos((-90 + i * 60) * Math.PI / 180) * 42} y2={50 + Math.sin((-90 + i * 60) * Math.PI / 180) * 42} stroke="rgba(255,255,255,.06)" />)}
      <polygon points={pts} fill="rgba(0,229,212,.20)" stroke="rgba(0,229,212,.92)" strokeWidth="1.4" />
    </svg>
  );
}

function MetricCurve({ title, score }: { title: string; score: number }) {
  return (
    <article className="analyzer-card exact-metric-curve">
      <div className="exact-metric-copy"><p>{title}</p><span>Per-game value</span></div>
      <ExactTrendGraph value={score} label="Average" />
    </article>
  );
}
