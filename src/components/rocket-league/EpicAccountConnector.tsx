import { useMemo, useState } from 'react';
import type { EpicAccountConnection, RocketLeagueSettings } from '../../types/rocketLeague';

export function EpicAccountConnector({ settings, onSave }: { settings: RocketLeagueSettings; onSave: (settings: Partial<RocketLeagueSettings>) => void }) {
  const current = settings.epicAccount ?? {
    status: 'desconectada',
    displayName: '',
    epicAccountId: '',
    platform: 'Epic',
    profileUrl: '',
  } satisfies EpicAccountConnection;
  const [form, setForm] = useState(current);
  const [feedback, setFeedback] = useState('');

  const isReady = useMemo(() => Boolean(form.displayName.trim() || form.epicAccountId.trim() || form.profileUrl.trim()), [form]);

  function save(status: EpicAccountConnection['status']) {
    const now = new Date().toISOString();
    onSave({
      epicAccount: {
        ...form,
        status,
        connectedAt: status === 'conectada' ? (form.connectedAt || now) : form.connectedAt,
        lastSyncAt: now,
      },
    });
    setFeedback(status === 'conectada' ? 'Cuenta lista para sincronización local con Stats API / Tracker.' : 'Datos de cuenta guardados como borrador.');
  }

  return (
    <section className="analyzer-card compact-account-card">
      <div className="dashboard-panel-heading compact">
        <div>
          <p className="section-kicker">Epic account hub</p>
          <h2>Vincular cuenta Rocket League</h2>
        </div>
        <span className={`analyzer-pill ${current.status === 'conectada' ? 'green' : current.status === 'preparada' ? 'cyan' : 'ghost'}`}>
          {current.status}
        </span>
      </div>
      <p className="account-hint">
        Guarda tu identidad Epic/Tracker. El Live Data Hub puede detectar tu PrimaryId en partida y guardarlo aquí para vincular replays, stats en vivo y snapshots de MMR.
      </p>
      <div className="account-grid">
        <label><span>Display name</span><input value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} placeholder="Ej: uasna" /></label>
        <label><span>Epic Account ID</span><input value={form.epicAccountId} onChange={(event) => setForm((value) => ({ ...value, epicAccountId: event.target.value }))} placeholder="Opcional" /></label>
        <label><span>Plataforma</span><select value={form.platform} onChange={(event) => setForm((value) => ({ ...value, platform: event.target.value as EpicAccountConnection['platform'] }))}><option>Epic</option><option>Steam</option><option>PlayStation</option><option>Xbox</option><option>Switch</option><option>Desconocida</option></select></label>
        <label><span>Perfil / Tracker URL</span><input value={form.profileUrl} onChange={(event) => setForm((value) => ({ ...value, profileUrl: event.target.value }))} placeholder="https://rocketleague.tracker.network/..." /></label>
      </div>
      <div className="account-actions">
        <button type="button" className="analyzer-button" onClick={() => save('preparada')}>Guardar</button>
        <button type="button" className="analyzer-button violet" disabled={!isReady} onClick={() => save('conectada')}>Marcar conectada</button>
      </div>
      {feedback ? <p className="dashboard-feedback">{feedback}</p> : null}
    </section>
  );
}
