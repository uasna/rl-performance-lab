import { navigationItems, type NavigationItemId } from './navigation';

export function MobileNav({ activeView, onChangeView }: { activeView: NavigationItemId; onChangeView: (view: NavigationItemId) => void }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-6 gap-1 rounded-[1.4rem] border border-white/10 bg-slate-950/88 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-2xl xl:hidden" aria-label="Navegación móvil">
      {navigationItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChangeView(item.id)}
          className={`rounded-2xl px-1.5 py-2 text-[10px] font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
            activeView === item.id ? 'bg-cyan-300/14 text-cyan-100' : 'text-slate-500 hover:text-slate-200'
          }`}
        >
          {item.shortLabel}
        </button>
      ))}
    </nav>
  );
}
