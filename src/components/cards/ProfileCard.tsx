import { formatMinutes } from '../../lib/formatters';
import { formatRankLabel } from '../../lib/rankUtils';
import type { PlayerProfile, SkillArea } from '../../types/rocketLeague';

interface ProfileCardProps {
  profile: PlayerProfile;
  skillAreas: SkillArea[];
}

export function ProfileCard({ profile, skillAreas }: ProfileCardProps) {
  const strongAreas = skillAreas.filter((area) => profile.strongAreas.includes(area.id));
  const weakAreas = skillAreas.filter((area) => profile.weakAreas.includes(area.id));

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Perfil competitivo</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{profile.playerName}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {profile.game} · Objetivo: {profile.goal} · Modo principal: {profile.mainMode}
          </p>
        </div>
        <div className="rounded-3xl border border-violet-300/18 bg-violet-300/8 px-5 py-4 text-left lg:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-100/70">Rango simulado</p>
          <p className="mt-2 text-xl font-black text-white">{formatRankLabel(profile.rank)}</p>
          <p className="mt-1 text-sm text-slate-400">{profile.rank.mmr} MMR</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <InfoBlock label="Áreas fuertes" values={strongAreas.map((area) => area.name)} />
        <InfoBlock label="Áreas débiles" values={weakAreas.map((area) => area.name)} />
        <InfoBlock label="Entrenamiento sugerido" values={[formatMinutes(profile.recommendedTrainingMinutes)]} />
      </div>
    </section>
  );
}

function InfoBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className="rounded-full border border-cyan-300/15 bg-cyan-300/8 px-3 py-1 text-sm font-semibold text-cyan-100">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
