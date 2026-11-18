import type { Product, Nutrients } from '../lib/types.ts';
import type { Profile } from '../lib/profile.ts';
import type { Today } from '../lib/training.ts';
import { evaluate, fmt, portionText, VERDICT_TEXT } from '../lib/evaluate.ts';

interface Props {
  a: Product;
  b: Product;
  profile: Profile;
  hoy: Today;
  onOpen: (p: Product) => void;
  onBack: () => void;
}

type Better = 'high' | 'low';
const ROWS: { label: string; key: keyof Nutrients; unit: string; better: Better; d: number }[] = [
  { label: 'Energía', key: 'kcal', unit: 'kcal', better: 'low', d: 0 },
  { label: 'Proteínas', key: 'prot', unit: 'g', better: 'high', d: 1 },
  { label: 'Hidratos', key: 'hc', unit: 'g', better: 'low', d: 1 },
  { label: 'Azúcares', key: 'azucar', unit: 'g', better: 'low', d: 1 },
  { label: 'Grasas', key: 'grasa', unit: 'g', better: 'low', d: 1 },
  { label: 'Saturadas', key: 'sat', unit: 'g', better: 'low', d: 1 },
  { label: 'Fibra', key: 'fibra', unit: 'g', better: 'high', d: 1 },
  { label: 'Sal', key: 'sal', unit: 'g', better: 'low', d: 2 },
];

/** Dos productos lado a lado; en cada fila se marca el que sale mejor. */
export default function CompareView({ a, b, profile, hoy, onOpen, onBack }: Props) {
  const ea = evaluate(a, profile);
  const eb = evaluate(b, profile);
  const pa = hoy.entreno ? ea.entreno : ea.descanso;
  const pb = hoy.entreno ? eb.entreno : eb.descanso;
  const win = (x: number | null, y: number | null, better: Better): [boolean, boolean] => {
    if (x == null || y == null || Math.abs(x - y) < 0.05) return [false, false];
    return better === 'high' ? [x > y, y > x] : [x < y, y < x];
  };
  const u = a.liquid ? 'ml' : 'g';

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Comparar</h1>
          <p>Valores por 100 {u}. En verde, el que sale mejor en cada fila.</p>
        </div>
      </header>
      <section className="card compare">
        <table className="table compare-table">
          <thead>
            <tr>
              <th />
              {[a, b].map((p) => (
                <th key={p.code ?? p.name}>
                  <button className="compare-name" onClick={() => onOpen(p)}>{p.name}</button>
                  {p.brand && <small>{p.brand}</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Valoración</td>
              {[ea, eb].map((e, i) => (
                <td key={i}><span className={`pill v-${e.verdict}`}>{VERDICT_TEXT[e.verdict]}</span><small className="score">{e.score}/100</small></td>
              ))}
            </tr>
            <tr>
              <td>Máximo hoy</td>
              <td>{portionText(pa, a)}</td>
              <td>{portionText(pb, b)}</td>
            </tr>
            {ROWS.map((r) => {
              const [wa, wb] = win(a.n[r.key], b.n[r.key], r.better);
              const cell = (v: number | null, w: boolean) => <td className={w ? 'win' : ''}>{v == null ? '—' : `${fmt(v, r.d)} ${r.unit}`}</td>;
              return (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  {cell(a.n[r.key], wa)}
                  {cell(b.n[r.key], wb)}
                </tr>
              );
            })}
            <tr>
              <td>Procesado</td>
              {[a, b].map((p, i) => <td key={i}>{p.nova ? `NOVA ${p.nova}` : '—'}</td>)}
            </tr>
          </tbody>
        </table>
      </section>
      <div className="actions">
        <button className="btn ghost" onClick={onBack}>Volver</button>
        <button className="btn primary" onClick={() => onOpen(b)}>Ver la alternativa</button>
      </div>
    </div>
  );
}
