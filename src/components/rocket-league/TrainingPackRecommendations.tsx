import { useMemo, useState } from 'react';
import { buildTrainingPackSearchUrl, copyTrainingPackCode, recommendTrainingPacksForArea } from '../../lib/trainingPackRecommender';
import type { RocketLeagueDataStore, SkillAreaId, TrainingPackRecommendation } from '../../types/rocketLeague';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';

function areaLabel(areaId: SkillAreaId): string {
  const labels: Record<SkillAreaId, string> = {
    movement: 'Movement',
    boost: 'Boost',
    offence: 'Offence',
    defence: 'Defence',
    rotation: 'Rotation',
    positioning: 'Positioning',
    mechanics: 'Mechanics',
    kickoffs: 'Kickoffs',
    mental: 'Mental',
  };
  return labels[areaId] ?? areaId;
}

function priorityTone(priority: TrainingPackRecommendation['priority']) {
  if (priority === 'principal') return 'improvement';
  if (priority === 'alternativo') return 'info';
  return 'neutral';
}

export function TrainingPackRecommendations({
  store,
  areaId,
  compact = false,
}: {
  store: RocketLeagueDataStore;
  areaId?: SkillAreaId;
  compact?: boolean;
}) {
  const recommendations = useMemo(() => recommendTrainingPacksForArea({ store, areaId, maxResults: compact ? 2 : 3 }), [store, areaId, compact]);
  const targetArea = areaId ?? recommendations[0]?.pack.areaIds[0] ?? store.profile.weakAreas[0] ?? 'positioning';
  const [feedback, setFeedback] = useState('');

  async function copyCode(code: string, name: string) {
    try {
      await copyTrainingPackCode(code);
      setFeedback(`Código copiado: ${name}`);
      window.setTimeout(() => setFeedback(''), 2200);
    } catch {
      setFeedback(`Copialo manualmente: ${code}`);
    }
  }

  function openSearch() {
    const url = buildTrainingPackSearchUrl(targetArea, store.frequentErrors.find((error) => error.appearances > 0)?.title);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-cyan-300/16 bg-cyan-300/[0.055] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info" dot>Training packs</StatusBadge>
            <StatusBadge tone="improvement">Custom Training interno</StatusBadge>
          </div>
          <h2 className="mt-3 text-2xl font-black text-white">Códigos para mañana · {areaLabel(targetArea)}</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-cyan-50/72">
            La app cruza tu foco de sesión con una base local curada de packs. Usá el primer código como bloque principal y los otros como alternativas.
          </p>
        </div>
        <button type="button" onClick={openSearch} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-slate-100 hover:bg-white/[0.07]">
          Buscar más online
        </button>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? '' : 'xl:grid-cols-3'}`}>
        {recommendations.map((recommendation) => (
          <TrainingPackCard key={recommendation.pack.id} recommendation={recommendation} onCopy={copyCode} />
        ))}
      </div>

      {feedback ? <p className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm font-bold text-emerald-100">{feedback}</p> : null}
    </article>
  );
}

function TrainingPackCard({
  recommendation,
  onCopy,
}: {
  recommendation: TrainingPackRecommendation;
  onCopy: (code: string, name: string) => void;
}) {
  const { pack } = recommendation;

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/45 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={priorityTone(recommendation.priority)}>{recommendation.priority}</StatusBadge>
        <Tag>{pack.difficulty}</Tag>
        <Tag>{pack.durationMinutes} min</Tag>
      </div>
      <h3 className="mt-3 text-lg font-black leading-tight text-white">{pack.name}</h3>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{pack.creator}</p>
      <div className="mt-3 rounded-2xl border border-cyan-300/18 bg-cyan-300/10 px-3 py-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/60">Código</p>
        <p className="mt-1 font-mono text-lg font-black tracking-wide text-cyan-50">{pack.code}</p>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">{pack.objective}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {pack.areaIds.slice(0, 3).map((area) => <Tag key={area}>{areaLabel(area)}</Tag>)}
      </div>
      <div className="mt-3 grid gap-2">
        {pack.instructions.slice(0, 2).map((instruction) => (
          <p key={instruction} className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs font-semibold leading-5 text-slate-400">
            {instruction}
          </p>
        ))}
      </div>
      <button type="button" onClick={() => onCopy(pack.code, pack.name)} className="mt-4 w-full rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-black text-emerald-100 hover:bg-emerald-300/16">
        Copiar código
      </button>
      <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-600">Fuente: {pack.sourceName}</p>
    </div>
  );
}
