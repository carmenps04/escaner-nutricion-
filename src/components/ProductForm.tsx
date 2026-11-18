import { useState } from 'react';
import { Camera } from 'lucide-react';
import type { Nutrients, Product } from '../lib/types.ts';

const FIELDS: { key: keyof Nutrients; label: string; unit: string; sub?: boolean }[] = [
  { key: 'kcal', label: 'Valor energético', unit: 'kcal' },
  { key: 'grasa', label: 'Grasas', unit: 'g' },
  { key: 'sat', label: 'de las cuales saturadas', unit: 'g', sub: true },
  { key: 'hc', label: 'Hidratos de carbono', unit: 'g' },
  { key: 'azucar', label: 'de los cuales azúcares', unit: 'g', sub: true },
  { key: 'fibra', label: 'Fibra', unit: 'g' },
  { key: 'prot', label: 'Proteínas', unit: 'g' },
  { key: 'sal', label: 'Sal', unit: 'g' },
];

const toStr = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));
const toNum = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  return t === '' || !isFinite(+t) ? null : +t;
};

interface Props {
  initial: Product;
  ocrText?: string;
  note?: string;
  busy: boolean;
  onPhoto: () => void;
  onSubmit: (p: Product) => void;
  onCancel: () => void;
}

export default function ProductForm({ initial, ocrText, note, busy, onPhoto, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial.name);
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [liquid, setLiquid] = useState(initial.liquid);
  const [vals, setVals] = useState<Record<keyof Nutrients, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, toStr(initial.n[f.key])])) as Record<keyof Nutrients, string>,
  );
  const [unitWeight, setUnitWeight] = useState(toStr(initial.unitWeight));
  const [unitName, setUnitName] = useState(initial.unitName ?? '');
  const [nova, setNova] = useState(initial.nova ? String(initial.nova) : '');
  const [showText, setShowText] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Object.fromEntries(FIELDS.map((f) => [f.key, toNum(vals[f.key])])) as unknown as Nutrients;
    const uw = toNum(unitWeight);
    onSubmit({
      ...initial,
      name: name.trim() || 'Producto sin nombre',
      brand: brand.trim() || undefined,
      liquid,
      // En productos de Open Food Facts se mantiene si es bebida según su categoría.
      drink: initial.categories?.length && initial.liquid === liquid ? initial.drink : liquid,
      n,
      unitWeight: uw && uw > 0 ? uw : undefined,
      unitName: uw && uw > 0 ? unitName.trim() || 'unidad' : undefined,
      nova: nova ? +nova : undefined,
    });
  };

  const u = liquid ? 'ml' : 'g';
  return (
    <form className="page" onSubmit={submit}>
      <header className="page-head">
        <div>
          <h1>Datos del producto</h1>
          <p>Valores de la etiqueta, en la columna «por 100 {u}».</p>
        </div>
      </header>
      {note && <p className="note">{note}</p>}

      <div className="cols">
        <div className="col">
          <section className="card">
            <h2 className="card-title">Producto</h2>
            <label className="field">
              <span>Nombre</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Galletas digestive avena" />
            </label>
            <label className="field">
              <span>Marca (opcional)</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Hacendado" />
            </label>
            <div className="seg" role="radiogroup" aria-label="Tipo de producto">
              <button type="button" className={!liquid ? 'on' : ''} onClick={() => setLiquid(false)}>Sólido · 100 g</button>
              <button type="button" className={liquid ? 'on' : ''} onClick={() => setLiquid(true)}>Bebida · 100 ml</button>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Valores por 100 {u}</h2>
            <div className="rows">
              {FIELDS.map((f) => (
                <label key={f.key} className={`row-field ${f.sub ? 'sub' : ''}`}>
                  <span>{f.label}</span>
                  <input inputMode="decimal" value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder="—" />
                  <em>{f.unit}</em>
                </label>
              ))}
            </div>
            {!ocrText && (
              <button type="button" className="btn ghost wide" onClick={onPhoto} disabled={busy}>
                <Camera size={18} /> Rellenar con una foto de la etiqueta
              </button>
            )}
          </section>
        </div>

        <div className="col">
          <section className="card">
            <h2 className="card-title">Unidad (opcional)</h2>
            <p className="small muted">Para que te diga «3 galletas» en vez de gramos. Suele venir en la etiqueta: «1 galleta = 14 g».</p>
            <div className="grid-2">
              <label className="field">
                <span>Peso de 1 unidad</span>
                <div className="with-unit">
                  <input inputMode="decimal" value={unitWeight} onChange={(e) => setUnitWeight(e.target.value)} placeholder="14" />
                  <em>{u}</em>
                </div>
              </label>
              <label className="field">
                <span>Nombre</span>
                <input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="galleta" />
              </label>
            </div>
            <label className="field">
              <span>Grado de procesado</span>
              <select value={nova} onChange={(e) => setNova(e.target.value)}>
                <option value="">No lo sé</option>
                <option value="1">Sin procesar (fruta, huevos, legumbre…)</option>
                <option value="2">Ingrediente (aceite, harina, azúcar…)</option>
                <option value="3">Procesado (pan, queso, conservas…)</option>
                <option value="4">Ultraprocesado (galletas, bollería, refrescos…)</option>
              </select>
            </label>
          </section>

          {ocrText && (
            <section className="card">
              <button type="button" className="link" onClick={() => setShowText(!showText)}>
                {showText ? 'Ocultar' : 'Ver'} el texto leído en la foto
              </button>
              {showText && <pre className="ocr-text">{ocrText}</pre>}
            </section>
          )}

          <div className="actions">
            <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn primary">Valorar</button>
          </div>
        </div>
      </div>
    </form>
  );
}
