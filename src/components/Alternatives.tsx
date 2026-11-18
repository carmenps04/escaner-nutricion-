import { useEffect, useState } from 'react';
import { ArrowLeftRight, Loader2, Sparkles } from 'lucide-react';
import type { Product } from '../lib/types.ts';
import type { Profile } from '../lib/profile.ts';
import { categoryLabel, findAlternatives, storeName, storeOf, type AlternativesResult } from '../lib/alternatives.ts';
import { evaluate, portionText, VERDICT_TEXT } from '../lib/evaluate.ts';
import type { Today } from '../lib/training.ts';

// Resultados en memoria mientras la app está abierta, para no repetir búsquedas.
const cache = new Map<string, AlternativesResult>();

interface Props {
  product: Product;
  profile: Profile;
  hoy: Today;
  onOpen: (p: Product) => void;
  onCompare: (p: Product) => void;
}

export default function Alternatives({ product, profile, hoy, onOpen, onCompare }: Props) {
  const store = storeOf(product);
  const [onlyStore, setOnlyStore] = useState(true);
  const key = `${product.code ?? product.name}|${onlyStore && store ? store : '*'}|${profile.objetivo}`;
  const [res, setRes] = useState<AlternativesResult | null>(() => cache.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  const canSearch = (product.categories ?? []).length > 0;

  useEffect(() => {
    if (!canSearch) return;
    const hit = cache.get(key);
    if (hit) { setRes(hit); return; }
    if (!navigator.onLine) { setRes(null); return; }
    let alive = true;
    setLoading(true);
    findAlternatives(product, profile, onlyStore).then((r) => {
      if (r.status === 'ok') cache.set(key, r);
      if (alive) { setRes(r); setLoading(false); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const where = onlyStore && store ? `en ${storeName(store)}` : 'en supermercados de España';

  return (
    <section className="card">
      <h2 className="card-title"><Sparkles size={15} /> Alternativas mejores {where}</h2>
      {store && (
        <div className="seg">
          <button className={onlyStore ? 'on' : ''} onClick={() => setOnlyStore(true)}>Solo {storeName(store)}</button>
          <button className={!onlyStore ? 'on' : ''} onClick={() => setOnlyStore(false)}>Cualquier tienda</button>
        </div>
      )}

      {!canSearch && <p className="small muted">Este producto no tiene categoría en Open Food Facts (lo has metido a mano o por foto), así que no puedo buscar productos parecidos.</p>}
      {canSearch && !navigator.onLine && !res && <p className="small muted">Sin conexión: las alternativas se buscan en internet.</p>}
      {loading && <p className="busy"><Loader2 className="spin" size={16} /> Buscando productos parecidos…</p>}
      {res?.status === 'error' && <p className="small muted">{res.message}</p>}
      {res?.status === 'ok' && !loading && (
        res.items.length ? (
          <>
            <div className="list">
              {res.items.map(({ product: alt }) => {
                const e = evaluate(alt, profile);
                const portion = hoy.entreno ? e.entreno : e.descanso;
                return (
                  <div key={alt.code ?? alt.name} className="list-item alt">
                    <button onClick={() => onOpen(alt)}>
                      <span className={`dot v-${e.verdict}`} />
                      <span className="list-name">
                        {alt.name}
                        <small>{[alt.brand, `${e.score}/100`, `hoy hasta ${portionText(portion, alt).replace(/ \(.*\)/, '')}`].filter(Boolean).join(' · ')}</small>
                      </span>
                      <span className={`pill v-${e.verdict}`}>{VERDICT_TEXT[e.verdict]}</span>
                    </button>
                    <button className="icon-btn" aria-label={`Comparar con ${alt.name}`} onClick={() => onCompare(alt)}>
                      <ArrowLeftRight size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="small muted">Del mismo tipo de producto ({categoryLabel(res.category)}), con mejor puntuación para tu objetivo. Pulsa <ArrowLeftRight size={12} style={{ verticalAlign: '-1px' }} /> para compararlos.</p>
          </>
        ) : (
          <p className="small muted">No he encontrado ninguno claramente mejor {where} en esta categoría ({categoryLabel(res.category)}). Ten en cuenta que Open Food Facts no tiene todos los productos de cada tienda.</p>
        )
      )}
    </section>
  );
}
