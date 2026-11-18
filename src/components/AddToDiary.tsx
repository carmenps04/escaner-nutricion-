import { useState } from 'react';
import { Minus, NotebookPen, Plus } from 'lucide-react';
import type { Product } from '../lib/types.ts';
import type { Portion } from '../lib/evaluate.ts';
import { fmt, plural } from '../lib/evaluate.ts';
import { addEntry, forGrams } from '../lib/diary.ts';

const num = (s: string) => {
  const t = s.replace(',', '.').trim();
  return t === '' || !isFinite(+t) ? 0 : +t;
};

/** «Lo he comido»: apunta una cantidad del producto en el diario de hoy. */
export default function AddToDiary({ product, suggested, onAdded }: { product: Product; suggested: Portion; onAdded: () => void }) {
  const byUnits = !!product.unitWeight;
  const [units, setUnits] = useState(() => Math.max(1, suggested.units ?? 1));
  const [grams, setGrams] = useState(() => String(suggested.grams && !byUnits ? Math.round(suggested.grams) : 100));
  const u = product.liquid ? 'ml' : 'g';
  const g = byUnits ? units * product.unitWeight! : num(grams);
  const t = forGrams(product.n, g);
  const name = product.unitName ?? 'unidad';

  const add = () => {
    if (g <= 0) return;
    addEntry({
      name: product.name,
      brand: product.brand,
      grams: g,
      units: byUnits ? units : undefined,
      unitName: byUnits ? name : undefined,
      ...t,
      product,
    });
    onAdded();
  };

  return (
    <section className="card">
      <h2 className="card-title"><NotebookPen size={15} /> Apuntar en el diario</h2>
      <div className="diary-add">
        {byUnits ? (
          <div className="stepper" role="group" aria-label="Cantidad">
            <button type="button" aria-label="Una menos" onClick={() => setUnits(Math.max(1, units - 1))}><Minus size={16} /></button>
            <span><b>{units}</b> {units === 1 ? name : plural(name)}</span>
            <button type="button" aria-label="Una más" onClick={() => setUnits(units + 1)}><Plus size={16} /></button>
          </div>
        ) : (
          <label className="field">
            <span>Cantidad</span>
            <div className="with-unit">
              <input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
              <em>{u}</em>
            </div>
          </label>
        )}
        <button className="btn primary" onClick={add} disabled={g <= 0}>Lo he comido</button>
      </div>
      <p className="small muted">{fmt(g, 0)} {u} · {fmt(t.kcal, 0)} kcal · {fmt(t.prot, 0)} g proteína · {fmt(t.hc, 0)} g hidratos · {fmt(t.grasa, 0)} g grasa</p>
    </section>
  );
}
