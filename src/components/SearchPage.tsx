import { useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Search, Store } from 'lucide-react';
import type { Product } from '../lib/types.ts';
import type { Profile } from '../lib/profile.ts';
import { evaluate, VERDICT_TEXT } from '../lib/evaluate.ts';
import { ERROR_TEXT, SearchError } from '../lib/alternatives.ts';
import { isComplete, loadSuper, PAGE_SIZE, saveSuper, searchStore, SUPERS } from '../lib/storeSearch.ts';

interface State {
  store: string;
  q: string;
  /** Búsqueda hecha (para «Ver más» y para saber si mostrar resultados). */
  done: { store: string; q: string } | null;
  products: Product[];
  total: number;
  page: number;
  sort: 'relevancia' | 'puntuacion';
}

// Se conserva mientras la app está abierta: al abrir un producto y volver, siguen los resultados.
let saved: State | null = null;

interface Props {
  profile: Profile;
  onOpen: (p: Product) => void;
  onBack: () => void;
}

/** Buscar productos de un supermercado por nombre y ver directamente si encajan en el plan. */
export default function SearchPage({ profile, onOpen, onBack }: Props) {
  const [s, setS] = useState<State>(() => saved ?? { store: loadSuper(), q: '', done: null, products: [], total: 0, page: 1, sort: 'relevancia' });
  const [busy, setBusy] = useState<null | 'buscar' | 'mas'>(null);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<State>) => setS((old) => { const next = { ...old, ...patch }; saved = next; return next; });

  const run = async (page: number) => {
    const q = page === 1 ? s.q.trim() : s.done!.q;
    const store = page === 1 ? s.store : s.done!.store;
    if (q.length < 2) { setError('Escribe al menos 2 letras.'); return; }
    if (!navigator.onLine) { setError('Sin conexión no se puede buscar. Los productos que ya has escaneado están en el Historial.'); return; }
    setBusy(page === 1 ? 'buscar' : 'mas');
    setError(null);
    try {
      const r = await searchStore(store, q, page);
      update(page === 1
        ? { done: { store, q }, products: r.products, total: r.total, page }
        : { products: [...s.products, ...r.products.filter((p) => !s.products.some((x) => x.code === p.code))], total: r.total, page });
    } catch (e) {
      setError(ERROR_TEXT[e instanceof SearchError ? e.reason : 'red']);
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => {
    const list = s.products.map((p, i) => ({ p, i, e: isComplete(p) ? evaluate(p, profile) : null }));
    // Por puntuación: primero los mejor valorados; los que no tienen datos, al final.
    if (s.sort === 'puntuacion') list.sort((a, b) => (b.e?.score ?? -1) - (a.e?.score ?? -1) || a.i - b.i);
    return list;
  }, [s.products, s.sort, profile]);

  const storeName = SUPERS.find(([t]) => t === s.done?.store)?.[1] ?? '';
  const more = s.done && s.products.length < s.total && s.page * PAGE_SIZE < s.total;

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <button className="link back-link" onClick={onBack}><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Escanear</button>
          <h1>Buscar en un supermercado</h1>
          <p>Busca un producto por su nombre y mira si encaja en tu plan, sin escanearlo.</p>
        </div>
      </header>

      <form className="card search-form" onSubmit={(e) => { e.preventDefault(); void run(1); }}>
        <label className="field">
          <span>Supermercado</span>
          <select value={s.store} onChange={(e) => { update({ store: e.target.value }); saveSuper(e.target.value); }}>
            {SUPERS.map(([t, n]) => <option key={t} value={t}>{n}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Producto</span>
          <div className="with-icon">
            <Search size={16} />
            <input type="search" enterKeyHint="search" value={s.q} onChange={(e) => update({ q: e.target.value })} placeholder="Galletas, yogur, pan de molde…" aria-label="Producto que buscas" />
          </div>
        </label>
        <button type="submit" className="btn primary" disabled={!!busy || s.q.trim().length < 2}>
          {busy === 'buscar' ? <Loader2 className="spin" size={16} /> : <Search size={16} />} Buscar
        </button>
        {error && <p className="small over">{error}</p>}
      </form>

      {s.done && !busy && s.products.length === 0 && !error && (
        <p className="empty">No he encontrado «{s.done.q}» en {storeName}. Prueba con otra palabra (por ejemplo, «yogur» en lugar de «yogures griegos»).</p>
      )}

      {s.products.length > 0 && (
        <>
          <div className="search-head">
            <span className="small muted">{s.total > s.products.length ? `${s.products.length} de ${s.total}` : s.products.length} resultados en {storeName}</span>
            <div className="seg search-sort" role="radiogroup" aria-label="Ordenar">
              <button type="button" role="radio" aria-checked={s.sort === 'relevancia'} className={s.sort === 'relevancia' ? 'on' : ''} onClick={() => update({ sort: 'relevancia' })}>Relevancia</button>
              <button type="button" role="radio" aria-checked={s.sort === 'puntuacion'} className={s.sort === 'puntuacion' ? 'on' : ''} onClick={() => update({ sort: 'puntuacion' })}>Mejor valorados</button>
            </div>
          </div>
          <section className="card">
            <div className="list">
              {rows.map(({ p, e }) => (
                <div key={(p.code ?? '') + p.name} className="list-item">
                  <button onClick={() => onOpen(p)}>
                    {p.image ? <img className="search-img" src={p.image} alt="" loading="lazy" /> : <span className="search-img" aria-hidden />}
                    <span className="list-name">
                      {p.name}
                      <small>{[p.brand, p.quantity, e ? `${e.score}/100` : null].filter(Boolean).join(' · ')}</small>
                    </span>
                    {e ? <span className={`pill v-${e.verdict}`}>{VERDICT_TEXT[e.verdict]}</span> : <span className="pill sin-datos">Sin datos</span>}
                  </button>
                </div>
              ))}
            </div>
            {more && (
              <button className="btn ghost" disabled={!!busy} onClick={() => void run(s.page + 1)}>
                {busy === 'mas' && <Loader2 className="spin" size={16} />} Ver más
              </button>
            )}
          </section>
        </>
      )}

      <p className="small muted"><Store size={12} style={{ verticalAlign: '-1px' }} /> Los productos vienen de Open Food Facts, una base de datos abierta que rellenan los usuarios: puede que falte alguno o que un dato no esté al día. Mercadona es el supermercado con más productos; en los demás hay menos. «Sin datos»: el producto no tiene la tabla nutricional completa; al abrirlo puedes completarla.</p>
    </div>
  );
}
