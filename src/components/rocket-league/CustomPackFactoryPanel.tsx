import { useEffect, useMemo, useState } from 'react';
import { createPackDraft, getNextFactorySettings, getPackFactoryStatus, type CustomPackDraft } from '../../lib/customTrainingPackFactory';
import { exportLiveTelemetryJson, liveTelemetryToPackCandidates, loadLiveShotTelemetry } from '../../lib/liveShotTelemetry';
import {
  createTrainingPackDraft,
  getTrainingPackStatus,
  installTrainingPackDraft,
  inspectTrainingTemplate,
  isElectronRuntime,
  openTrainingPackLanding,
  cleanupGeneratedTrainingPacks,
  rollbackLastTrainingPackInstall,
  openTrainingSafetyBackups,
  selectMyTrainingDirectory,
  selectTrainingTemplateDirectory,
  selectRocketRpTrainingCli,
  type TrainingPackInstallStatus,
} from '../../lib/electronBridge';
import type { RocketLeagueDataStore, RocketLeagueSettings } from '../../types/rocketLeague';

type FactoryActions = {
  updateSettings: (settings: Partial<RocketLeagueSettings>) => void;
};

export function CustomPackFactoryPanel({ store, actions }: { store: RocketLeagueDataStore; actions: FactoryActions }) {
  const status = useMemo(() => getPackFactoryStatus(store.matches, store.settings), [store.matches, store.settings]);
  const [draft, setDraft] = useState<CustomPackDraft | null>(null);
  const [desktopStatus, setDesktopStatus] = useState<TrainingPackInstallStatus | null>(null);
  const [selectedDraftFolder, setSelectedDraftFolder] = useState('');
  const [liveShotCount, setLiveShotCount] = useState(() => loadLiveShotTelemetry().length);
  const [working, setWorking] = useState(false);

  const latestDraftFolder = desktopStatus?.latestDraftFolder ?? desktopStatus?.draftFolders?.[0] ?? '';
  const stagedFolder = desktopStatus?.draftFolder || selectedDraftFolder || store.settings.customPackFactory?.stagedPackFolder || latestDraftFolder || '';
  const targetDirectory = desktopStatus?.targetMyTrainingDirectory ?? desktopStatus?.selectedMyTrainingDirectory ?? desktopStatus?.myTrainingDirectories?.[0] ?? '';
  const activeTemplate = desktopStatus?.activeTemplate ?? desktopStatus?.templates?.[0] ?? null;
  const liveCandidates = useMemo(() => {
    void liveShotCount;
    return liveTelemetryToPackCandidates(loadLiveShotTelemetry());
  }, [liveShotCount]);
  const visibleCandidates = liveCandidates.length ? [...liveCandidates, ...status.candidates].slice(0, 15) : status.candidates;
  const canGenerateManual = status.manualRemainingThisWeek > 0 && visibleCandidates.length > 0;
  const canGenerateAutomatic = (status.automaticAvailable > 0 || liveCandidates.length >= 10) && visibleCandidates.length > 0;

  useEffect(() => {
    if (!isElectronRuntime()) return;
    getTrainingPackStatus()
      .then((result) => {
        setDesktopStatus(result);
        if (result.latestDraftFolder) setSelectedDraftFolder(result.latestDraftFolder);
      })
      .catch(() => undefined);
  }, []);

  async function refreshBridge() {
    if (!isElectronRuntime()) return;
    const result = await getTrainingPackStatus();
    setDesktopStatus(result);
    if (!selectedDraftFolder && result.latestDraftFolder) setSelectedDraftFolder(result.latestDraftFolder);
  }

  async function generate(type: 'manual' | 'automatic') {
    setWorking(true);
    try {
      const baseDraft = createPackDraft(store.matches, store.settings, type);
      const liveOnlyDraft: CustomPackDraft = liveCandidates.length ? {
        ...baseDraft,
        id: baseDraft.id || `rla-live-pack-${Date.now()}`,
        title: type === 'automatic' ? 'Auto pack · live shot telemetry' : 'Manual pack · live shot telemetry',
        status: 'draft',
        shots: [...liveCandidates, ...baseDraft.shots].slice(0, 15),
        sourceReplayIds: [...new Set([...liveCandidates.map((shot) => shot.replayId), ...baseDraft.sourceReplayIds])],
        note: 'Pack draft construido usando telemetría en vivo de Stats API: ubicación del impacto, velocidad de la pelota y rating del tiro cuando estuvo disponible.',
      } : baseDraft;
      const nextDraft = liveOnlyDraft;
      setDraft(nextDraft);
      if (nextDraft.status === 'blocked') return;
      const nextSettings = getNextFactorySettings(store.settings, nextDraft);
      actions.updateSettings({ customPackFactory: nextSettings });
      if (isElectronRuntime()) {
        const result = await createTrainingPackDraft(nextDraft);
        const createdDraftFolder = result.draftFolder || result.latestDraftFolder || nextSettings.stagedPackFolder || '';
        setSelectedDraftFolder(createdDraftFolder);
        setDesktopStatus(result);
        actions.updateSettings({ customPackFactory: { ...nextSettings, stagedPackFolder: createdDraftFolder || nextSettings.stagedPackFolder } });
      }
    } finally {
      setWorking(false);
    }
  }

  async function install() {
    const draftFolderToInstall = stagedFolder || latestDraftFolder;
    setWorking(true);
    try {
      const result = await installTrainingPackDraft(draftFolderToInstall);
      if (result.draftFolder || result.latestDraftFolder) setSelectedDraftFolder(result.draftFolder || result.latestDraftFolder || '');
      setDesktopStatus(result);
      if (result.installedPath) {
        actions.updateSettings({ customPackFactory: { ...(store.settings.customPackFactory ?? getNextFactorySettings(store.settings, draft ?? { id: '', title: '', createdAt: '', requestType: 'manual', status: 'blocked', shots: [], sourceReplayIds: [], note: '' })), lastInstalledPath: result.installedPath } });
      }
    } finally {
      setWorking(false);
    }
  }

  async function openLanding() {
    if (!isElectronRuntime()) return;
    const path = await openTrainingPackLanding();
    setDesktopStatus((current) => current ?? { ok: true, message: 'Carpeta abierta.', rlaLandingDirectory: path, rocketTrainingRoot: '', myTrainingDirectories: [] });
  }

  async function selectTarget() {
    if (!isElectronRuntime()) return;
    setWorking(true);
    try {
      const result = await selectMyTrainingDirectory();
      setDesktopStatus(result);
      actions.updateSettings({ customPackFactory: { ...(store.settings.customPackFactory ?? getNextFactorySettings(store.settings, draft ?? { id: '', title: '', createdAt: '', requestType: 'manual', status: 'blocked', shots: [], sourceReplayIds: [], note: '' })), selectedMyTrainingDirectory: result.targetMyTrainingDirectory ?? result.selectedMyTrainingDirectory ?? '' } });
    } finally {
      setWorking(false);
    }
  }

  async function selectTemplate() {
    if (!isElectronRuntime()) return;
    setWorking(true);
    try {
      const result = await selectTrainingTemplateDirectory();
      setDesktopStatus(result);
    } finally {
      setWorking(false);
    }
  }

  async function selectRocketRp() {
    if (!isElectronRuntime()) return;
    setWorking(true);
    try {
      const result = await selectRocketRpTrainingCli();
      setDesktopStatus(result);
    } finally {
      setWorking(false);
    }
  }

  async function cleanupGenerated() {
    if (!isElectronRuntime()) return;
    setWorking(true);
    try {
      const result = await cleanupGeneratedTrainingPacks();
      setDesktopStatus(result);
    } finally {
      setWorking(false);
    }
  }

  async function rollbackLastInstall() {
    if (!isElectronRuntime()) return;
    setWorking(true);
    try {
      const result = await rollbackLastTrainingPackInstall();
      setDesktopStatus(result);
    } finally {
      setWorking(false);
    }
  }

  async function openSafetyBackups() {
    if (!isElectronRuntime()) return;
    await openTrainingSafetyBackups();
  }

  async function inspectTemplate() {
    if (!isElectronRuntime()) return;
    setWorking(true);
    try {
      const result = await inspectTrainingTemplate();
      setDesktopStatus(result);
    } finally {
      setWorking(false);
    }
  }

  const exactInstallReady = Boolean(desktopStatus?.exactTemWriterReady);
  const packStageLabel = desktopStatus?.packWorkflowStage === 'install_ready'
    ? 'Instalación lista'
    : desktopStatus?.packWorkflowStage === 'tem_writer_validation'
      ? 'Schema mapper'
      : 'Captura + seed seguro';

  return (
    <section className="exact-shot-pack analyzer-card compact-pack-factory">
      <div className="exact-shot-pack__head">
        <div>
          <p className="pdf-card-label">Custom training pack core</p>
          <strong>{visibleCandidates.length} candidatos guardados</strong>
          <span>
            Pack Pipeline V7: Phase 42 mapea el schema real de los shots antes de volver a mutar geometría.
          </span>
        </div>
        <div>
          <button type="button" onClick={() => generate('manual')} disabled={!canGenerateManual || working}>Generar seed</button>
          <button type="button" className="install" onClick={() => generate('automatic')} disabled={!canGenerateAutomatic || working}>Auto seed</button>
          <button type="button" className="danger" onClick={cleanupGenerated} disabled={working || !isElectronRuntime()}>Limpiar packs RLA</button>
          <button type="button" className="danger" onClick={rollbackLastInstall} disabled={working || !isElectronRuntime() || !desktopStatus?.canRollbackLastInstall}>Rollback último RLA</button>
          <button type="button" onClick={install} disabled={working || !isElectronRuntime() || !activeTemplate || !exactInstallReady}>Crear .Tem seguro</button>
        </div>
      </div>

      <div className="pack-quota-grid">
        <PackQuota label="Processed games" value={status.processedGames} hint={`${status.gamesUntilAutoPack} para auto pack`} />
        <PackQuota label="Manual left" value={status.manualRemainingThisWeek} hint="máx. 10 / semana" />
        <PackQuota label="Auto packs" value={status.automaticGeneratedThisWeek} hint="máx. 3 / semana" />
        <PackQuota label="Drafts RLA" value={desktopStatus?.draftCount ?? desktopStatus?.draftFolders?.length ?? 0} hint={stagedFolder ? 'último draft listo' : 'generá seed primero'} />
        <PackQuota label="Live candidatos" value={liveShotCount} hint="Stats API local" />
        <PackQuota label=".Tem plantilla" value={activeTemplate ? 'OK' : 'No'} hint={activeTemplate?.name ?? 'seleccioná MyTraining'} />
        <PackQuota label="RocketRP" value={desktopStatus?.rocketRpTrainingCliAvailable ? 'OK' : 'No'} hint="decode/serialize" />
        <PackQuota label="Writer .Tem" value={exactInstallReady ? 'OK' : 'Bloqueado'} hint={packStageLabel} />
      </div>

      <div className="custom-shot-list">
        <div><span>Shot</span><span>Replay</span><span>Rating</span><span>Reason</span></div>
        {visibleCandidates.length ? visibleCandidates.slice(0, 8).map((shot, index) => (
          <div key={shot.id}>
            <span>{index + 1}</span>
            <strong>{shot.replayFileName}</strong>
            <em>{shot.shotScore}</em>
            <small>{shot.reason}</small>
          </div>
        )) : <p>{status.message}</p>}
      </div>

      <div className="pack-paths pack-paths--stacked">
        <button type="button" onClick={openLanding} disabled={!isElectronRuntime()}>Abrir RLA packs</button>
        <button type="button" onClick={openSafetyBackups} disabled={!isElectronRuntime()}>Abrir backups safety</button>
        <button type="button" onClick={refreshBridge} disabled={!isElectronRuntime() || working}>Re-escanear carpetas</button>
        <button type="button" onClick={selectTarget} disabled={!isElectronRuntime() || working}>Cambiar MyTraining</button>
        <button type="button" onClick={selectTemplate} disabled={!isElectronRuntime() || working}>Cambiar plantilla .Tem</button>
        <button type="button" onClick={inspectTemplate} disabled={!isElectronRuntime() || working || !activeTemplate}>Inspeccionar plantilla</button>
        <button type="button" onClick={selectRocketRp} disabled={!isElectronRuntime() || working}>Seleccionar RocketRP CLI</button>
        <button type="button" onClick={() => { setLiveShotCount(loadLiveShotTelemetry().length); }} disabled={working}>Releer live shots</button>
        <button type="button" onClick={exportLiveTelemetryJson} disabled={working || !liveShotCount}>Exportar live shots</button>
        <span className="pack-install-state">Estado: {stagedFolder ? `draft seleccionado: ${stagedFolder.split(/[/\\]/).pop()}` : 'sin draft generado'}</span>
        <span>Destino detectado: {targetDirectory || 'No detectado todavía'}</span>
        <span>Plantilla activa: {activeTemplate ? `${activeTemplate.name} · ${activeTemplate.fileCount} archivos` : 'No detectada'}</span>
        <span>RocketRP: {desktopStatus?.rocketRpTrainingCliAvailable ? desktopStatus.rocketRpTrainingCliPath : 'No configurado'}</span>
        <span>RLA: {desktopStatus?.rlaLandingDirectory ?? 'Documents\\My Games\\RLA\\training_packs'}</span>
        <span>Safety: {desktopStatus?.lastTrainingSafety?.backupRoot ? `rollback listo · ${desktopStatus.lastTrainingSafety.generatedTemFileName ?? desktopStatus.lastTrainingSafety.generatedCode}` : 'sin instalación RLA reciente'}</span>
      </div>

      {desktopStatus?.templateInspection ? (
        <div className="pack-explainer pack-explainer--inspection">
          <strong>Inspección de plantilla</strong>
          <span>{desktopStatus.templateInspection.message}</span>
          {desktopStatus.templateInspection.selected ? (
            <span>
              Seleccionada: {desktopStatus.templateInspection.selected.fileName} · {desktopStatus.templateInspection.selected.shotCount} shots · {(desktopStatus.templateInspection.selected.sizeBytes / 1024).toFixed(1)} KB
            </span>
          ) : null}
          <span>{desktopStatus.templateInspection.nextStep}</span>
          {desktopStatus.templateInspection.reportPath ? <span>Reporte: {desktopStatus.templateInspection.reportPath}</span> : null}
        </div>
      ) : null}


      {!stagedFolder ? (
        <p className="pack-warning pack-warning--info">No hay draft RLA seleccionado. Apretá Generar seed primero; después Inspeccionar plantilla y Crear .Tem seguro. Tener solo 1 replay no bloquea el writer si ya hay candidatos live.</p>
      ) : null}

      <div className="pack-explainer">
        <strong>Flujo correcto del generador:</strong>
        <span>1) Live/Replays capturan candidatos → 2) seed con ubicación/velocidad si existe → 3) inspecciona plantilla real → 4) parchea shots clonados con geometría del fallo → 5) RocketRP serializa y relee → 6) instala solo si shots &gt; 0 → 7) rollback elimina solo lo generado por RLA.</span>
      </div>

      <p className="pack-warning">Pack Pipeline V7 activo: primero se conserva pack jugable y se genera phase42-shot-schema-map.json. El siguiente parche solo mutará rutas confirmadas por ese reporte.</p>
      {desktopStatus?.exactTemWriterBlockReason ? <p className="pack-warning pack-warning--info">{desktopStatus.exactTemWriterBlockReason}</p> : null}
      {draft ? <p className="dashboard-feedback">{draft.note}</p> : null}
      {desktopStatus ? <p className={desktopStatus.ok ? 'dashboard-feedback' : 'pack-warning'}>{desktopStatus.message}</p> : null}
    </section>
  );
}

function PackQuota({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return <div className="pack-quota"><span>{label}</span><strong>{value}</strong><em>{hint}</em></div>;
}
