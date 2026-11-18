import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Dumbbell, MinusCircle, Pencil, Sofa, XCircle, Clock, Info } from 'lucide-react';
import type { Product } from '../lib/types.ts';
import type { Profile } from '../lib/profile.ts';
import { evaluate, fmt, portionText, VERDICT_TEXT, type Portion } from '../lib/evaluate.ts';

export default function ResultView({ product, profile, onEdit, onBack }: { product: Product; profile: Profile; onEdit: () => void; onBack: () => void }) {
  const e = useMemo(() => evaluate(product, profile), [product, profile]);
  const u = product.liquid ? 'ml' : 'g';
  const Icon = e.verdict === 'buena' ? CheckCircle2 : e.verdict === 'regular' ? MinusCircle : XCircle;

  return (
    <div className="page">
      <div className="product-head">
        {product.image && <img src={product.image} alt="" />}
        <div>
          <h1>{product.name}</h1>
          <p className="muted">
            {[product.brand, product.code].filter(Boolean).join(' · ')}
            {product.nutriscore && <span className={`nutri n-${product.nutriscore}`}>Nutri-Score {product.nutriscore.toUpperCase()}</span>}
          </p>
        </div>
      </div>

      <div className={`verdict v-${e.verdict}`}>
        <Icon size={34} />
        <div>
          <strong>{VERDICT_TEXT[e.verdict]}</strong>
          <span>{e.score}/100 para tu objetivo</span>
        </div>
      </div>

      {e.warnings.length > 0 && (
        <div className="warn">
          <AlertTriangle size={18} />
          <div>
            {e.warnings.map((w) => <p key={w}>{w}</p>)}
            <button className="link" onClick={onEdit}>Completar o corregir valores</button>
          </div>
        </div>
      )}

      <h2 className="section">Cuánto como máximo por toma</h2>
      <div className="two">
        <PortionCard title="Día de entreno" icon={<Dumbbell size={18} />} p={e.entreno} product={product} />
        <PortionCard title="Día sin entreno" icon={<Sofa size={18} />} p={e.descanso} product={product} />
      </div>
      {e.descanso.grams != null && <p className="muted small">Lo que marca el límite es {e.descanso.limitedBy}.</p>}

      <div className="card freq">
        <Clock size={18} />
        <div>
          <strong>Frecuencia</strong>
          <p>{e.frequency}</p>
          {e.timing && <p className="muted">{e.timing}</p>}
        </div>
      </div>

      <h2 className="section">Por qué</h2>
      <ul className="reasons">
        {e.reasons.map((r) => (
          <li key={r.text} className={`r-${r.tone}`}>{r.text}</li>
        ))}
      </ul>

      <h2 className="section">Valores nutricionales</h2>
      <table className="nutri-table">
        <thead>
          <tr>
            <th />
            <th>100 {u}</th>
            {e.descanso.grams != null && <th>{portionText(e.descanso, product).replace(/ \(.*\)/, '')}</th>}
          </tr>
        </thead>
        <tbody>
          {([
            ['Energía', 'kcal', 'kcal', 0],
            ['Proteínas', 'prot', 'g', 1],
            ['Hidratos', 'hc', 'g', 1],
            ['  azúcares', 'azucar', 'g', 1],
            ['Grasas', 'grasa', 'g', 1],
            ['  saturadas', 'sat', 'g', 1],
            ['Fibra', 'fibra', 'g', 1],
            ['Sal', 'sal', 'g', 2],
          ] as const).map(([label, k, unit, d]) => {
            const v = product.n[k];
            return (
              <tr key={k} className={label.startsWith('  ') ? 'sub' : ''}>
                <td>{label.trim()}</td>
                <td>{v == null ? '—' : `${fmt(v, d)} ${unit}`}</td>
                {e.descanso.grams != null && <td>{v == null ? '—' : `${fmt((v * e.descanso.grams) / 100, d)} ${unit}`}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="disclaimer">
        <Info size={14} /> Orientación calculada con tu plan ({fmt(profile.descanso.kcal, 0)} / {fmt(profile.entreno.kcal, 0)} kcal). Si choca con lo que te ha pautado tu dietista, manda su pauta.
      </p>

      <div className="actions">
        <button className="btn ghost" onClick={onEdit}><Pencil size={16} /> Corregir</button>
        <button className="btn primary" onClick={onBack}>Escanear otro</button>
      </div>
    </div>
  );
}

function PortionCard({ title, icon, p, product }: { title: string; icon: React.ReactNode; p: Portion; product: Product }) {
  return (
    <div className="card portion">
      <span className="portion-title">{icon} {title}</span>
      <strong>{portionText(p, product)}</strong>
      {p.kcal != null && (
        <span className="muted small">
          {fmt(p.kcal, 0)} kcal · {fmt(p.pctDayKcal ?? 0, 0)} % del día
          {p.prot != null && ` · ${fmt(p.prot, 0)} g prot.`}
        </span>
      )}
    </div>
  );
}
