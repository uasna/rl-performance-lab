export function ManualEntryPlaceholder() {
  return (
    <section className="rounded-[2rem] border border-dashed border-cyan-300/25 bg-cyan-300/6 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Formulario futuro</p>
      <h2 className="mt-2 text-2xl font-black text-white">Registro manual pendiente</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        Esta fase deja lista la carpeta <span className="font-semibold text-slate-200">/components/forms</span> para capturar partidas,
        entrenamientos, errores frecuentes y cambios de MMR sin depender todavía de backend.
      </p>
    </section>
  );
}
