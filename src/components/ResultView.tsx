import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Dumbbell, Info, MinusCircle, Pencil, Sofa, XCircle } from 'lucide-react';
import type { Product } from '../lib/types.ts';
import { OBJETIVOS, type Profile } from '../lib/profile.ts';
import { evaluate, fmt, plural, portionText, targetProteinDensity, VERDICT_TEXT, type Portion } from '../lib/evaluate.ts';
import { timingAdvice, type Today } from '../lib/training.ts';
import TodayChip from './TodayChip.tsx';
import Alternatives from './Alternatives.tsx';
import { gramsLeft, loadDay, remaining, totals } from '../lib/diary.ts';

interface Props {
  product: Product;
  profile: Profile;
  configured: boolean;
  hoy: Today;
  onTodayChange: () => void;
  onOpen: (p: Product) => void;
  onCompare: (p: Product) => void;
  onEdit: () => void;
  onBack: () => void;
}

const ROWS = [
  ['Energía', 'kcal', 'kcal', 0],
  ['Proteínas', 'prot', 'g', 1],
  ['Hidratos', 'hc', 'g', 1],
  ['  azúcares', 'azucar', 'g', 1],
  ['Grasas', 'grasa', 'g', 1],
  ['  saturadas', 'sat', 'g', 1],
  ['Fibra', 'fibra', 'g', 1],
  ['Sal', 'sal', 'g', 2],
] as const;

export default function ResultView({ product, profile, configured, hoy, onTodayChange, onOpen, onCompare, onEdit, onBack }: Props) {
  const e = useMemo(() => evaluate(product, profile), [product, profile]);
  const u = product.liquid ? 'ml' : 'g';
  const Icon = e.verdict === 'buena' ? CheckCircle2 : e.verdict === 'regular' ? MinusCircle : XCircle;
  const todayP = hoy.entreno ? e.entreno : e.descanso;
  // Lo que ya llevas hoy en el diario: si queda poco, la cantidad máxima baja.
  const diaryNote = useMemo(() => {
    const entries = loadDay();
    if (!entries.length) return null;
    const plan = hoy.entreno ? profile.entreno : profile.descanso;
    const left = remaining(plan, totals(entries));
    const head = `Hoy llevas ${fmt(plan.kcal - left.kcal, 0)} de ${fmt(plan.kcal, 0)} kcal.`;
    if (left.kcal <= 0) return { tone: 'over', text: `${head} Ya has llegado a tus calorías de hoy: mejor déjalo para otro día.` };
    const cap = gramsLeft(product.n, left);
    if (!cap || todayP.grams == null || cap.grams >= todayP.grams) return { tone: 'ok', text: `${head} Te cabe la cantidad máxima.` };
    const u = product.liquid ? 'ml' : 'g';
    const by = { kcal: 'las calorías', hc: 'los hidratos', grasa: 'la grasa' }[cap.by];
    const qty = product.unitWeight ? Math.floor(cap.grams / product.unitWeight) : Math.floor(cap.grams / 5) * 5;
    const txt = product.unitWeight
      ? (qty >= 1 ? `${qty} ${qty === 1 ? product.unitName ?? 'unidad' : plural(product.unitName ?? 'unidad')}` : `menos de 1 ${product.unitName ?? 'unidad'}`)
      : `${fmt(qty, 0)} ${u}`;
    return { tone: 'warn', text: `${head} Por ${by} que te quedan, hoy como máximo ${txt}.` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, profile, hoy]);
  const ref = todayP.grams;
  // A un producto «buena opción» no se le pide esperar a un día de entreno.
  const advice = e.kind !== 'general' || (e.verdict === 'buena' && !hoy.entreno && e.macroKind === 'hc') ? null : timingAdvice(e.macroKind, hoy);
  const boxes = [
    <PortionBox key="e" title="Con entreno" icon={<Dumbbell size={16} />} p={e.entreno} product={product} isToday={hoy.entreno} />,
    <PortionBox key="d" title="Sin entreno" icon={<Sofa size={16} />} p={e.descanso} product={product} isToday={!hoy.entreno} />,
  ];

  return (
    <div className="page">
      <header className="product-head">
        {product.image && <img src={product.image} alt="" />}
        <div>
          <h1>{product.name}</h1>
          <div className="product-meta">
            {[product.brand, product.code].filter(Boolean).join(' · ')}
            {product.nutriscore && <span className={`nutri n-${product.nutriscore}`}>Nutri-Score {product.nutriscore.toUpperCase()}</span>}
          </div>
        </div>
      </header>

      <TodayChip hoy={hoy} onChange={onTodayChange} />

      {!configured && <p className="note warn-note">Estás usando valores de ejemplo. Configura tu perfil para que la valoración sea la tuya.</p>}

      <div className="cols">
        <div className="col">
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

          <section className="card">
            <h2 className="card-title">Cuánto como máximo por toma</h2>
            <div className="portions">{hoy.entreno ? boxes : [boxes[1], boxes[0]]}</div>
            {ref != null && <p className="small muted">El límite lo marca {todayP.limitedBy}.</p>}
            {diaryNote && <p className={`note ${diaryNote.tone === 'ok' ? '' : 'warn-note'}`}>{diaryNote.text}</p>}
            <div className="freq-row">
              <Clock size={18} />
              <div>
                <p><b>Frecuencia:</b> {e.frequency}</p>
                {advice && <p className="muted">{advice}</p>}
              </div>
            </div>
          </section>

        </div>

        <div className="col">
          <Alternatives product={product} profile={profile} hoy={hoy} onOpen={onOpen} onCompare={onCompare} />
          <section className="card">
            <h2 className="card-title">Por qué</h2>
            <ul className="reasons">
              {e.reasons.map((r) => <li key={r.text} className={`r-${r.tone}`}>{r.text}</li>)}
            </ul>
          </section>
          <details className="card how">
            <summary className="card-title">Cómo se ha calculado</summary>
            <p className="small">
              Con tu plan del dietista: <b>{fmt(profile.descanso.kcal, 0)} kcal</b> sin entreno y <b>{fmt(profile.entreno.kcal, 0)} kcal</b> con entreno, y tu objetivo: {OBJETIVOS[profile.objetivo].toLowerCase()}.
              La proteína de referencia es <b>{fmt(targetProteinDensity(profile.descanso))} g por cada 100 kcal</b>, que sale de los {fmt(profile.descanso.prot, 0)} g de proteína de tu plan.
            </p>
            {e.breakdown.length > 0 && (
              <table className="table how-table">
                <thead><tr><th>Criterio</th><th>Peso</th><th>Nota</th></tr></thead>
                <tbody>
                  {e.breakdown.map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td>{b.weight} %</td>
                      <td><span className="how-bar"><span style={{ width: `${b.score}%` }} className={b.score >= 75 ? 'g' : b.score >= 45 ? 'm' : 'b'} /></span>{b.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="small muted">
              La puntuación es la media ponderada de las notas: buena opción desde 65, regular de 40 a 64 y ocasional por debajo de 40.
              La cantidad máxima es el tope más bajo entre calorías, grasa, hidratos, proteína, azúcar libre, grasa saturada y sal, calculados sobre tu plan de cada tipo de día.
              Tu peso y tu composición corporal no entran directamente: el dietista ya los ha convertido en las calorías y macros de tu plan, y la app usa esos números.
            </p>
          </details>
          <section className="card">
            <h2 className="card-title">Valores nutricionales</h2>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>100 {u}</th>
                  {ref != null && <th>{portionText(todayP, product).replace(/ \(.*\)/, '')}</th>}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, k, unit, d]) => {
                  const v = product.n[k];
                  return (
                    <tr key={k} className={label.startsWith('  ') ? 'sub' : ''}>
                      <td>{label.trim()}</td>
                      <td>{v == null ? '—' : `${fmt(v, d)} ${unit}`}</td>
                      {ref != null && <td>{v == null ? '—' : `${fmt((v * ref) / 100, d)} ${unit}`}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <p className="disclaimer">
            <Info size={14} />
            <span>Orientación calculada con tu plan ({fmt(profile.descanso.kcal, 0)} kcal sin entreno, {fmt(profile.entreno.kcal, 0)} kcal con entreno). Si choca con lo que te ha pautado tu dietista, manda su pauta.</span>
          </p>

          <div className="actions">
            <button className="btn ghost" onClick={onEdit}><Pencil size={16} /> Corregir</button>
            <button className="btn primary" onClick={onBack}>Escanear otro</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortionBox({ title, icon, p, product, isToday }: { title: string; icon: React.ReactNode; p: Portion; product: Product; isToday: boolean }) {
  // «3 galletas» en grande y los gramos y calorías debajo, para que no se parta en dos líneas.
  const text = portionText(p, product);
  const m = text.match(/^(.*?) \((.*)\)$/);
  const main = m ? m[1] : text;
  const extra = [m?.[2], p.kcal != null ? `${fmt(p.kcal, 0)} kcal` : null, p.pctDayKcal != null ? `${fmt(p.pctDayKcal, 0)} % del día` : null].filter(Boolean).join(' · ');
  return (
    <div className={`portion ${isToday ? 'today-portion' : 'other'}`}>
      <span className="portion-title">{icon} {title}{isToday && <span className="badge">Hoy</span>}</span>
      <strong>{main}</strong>
      {extra && <small>{extra}</small>}
      {p.prot != null && <small>{fmt(p.prot, 0)} g de proteína</small>}
    </div>
  );
}
