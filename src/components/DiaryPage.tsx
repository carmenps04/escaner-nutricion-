import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Pencil, PenLine, Plus, Sofa, Trash2 } from 'lucide-react';
import MealBuilder from './MealBuilder.tsx';
import type { Profile } from '../lib/profile.ts';
import type { Product } from '../lib/types.ts';
import { dowOf, type Today } from '../lib/training.ts';
import { addEntry, dayKey, itemGrams, loadDay, remaining, removeEntry, totals, updateEntry, forGrams, type DiaryEntry, type Totals } from '../lib/diary.ts';
import { fmt, plural } from '../lib/evaluate.ts';
import { loadPlan, mealTarget } from '../lib/plan.ts';
import { useDraft, VsPlan } from './MealBuilder.tsx';

const num = (s: string) => {
  const t = s.replace(',', '.').trim();
  return t === '' || !isFinite(+t) ? 0 : +t;
};

interface Props {
  profile: Profile;
  hoy: Today;
  onOpen: (p: Product) => void;
  toast: (m: string) => void;
}

export default function DiaryPage({ profile, hoy, onOpen, toast }: Props) {
  const [date, setDate] = useState(() => new Date());
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState<null | 'meal' | 'manual'>(null);
  const key = dayKey(date);
  const isToday = key === dayKey();
  const entries = loadDay(key);
  void version;
  // Hoy manda el ajuste del día; otros días, la semana del perfil.
  const entreno = isToday ? hoy.entreno : (profile.semana ?? []).some((t) => t.dow === dowOf(date));
  const plan = entreno ? profile.entreno : profile.descanso;
  // Comida que se está añadiendo o editando: el resumen enseña cómo quedaría el día con ella.
  const [draft, setDraft] = useState<{ replaces?: string; t: Totals } | null>(null);
  const onDraft = (replaces?: string) => (d: Totals | null) => setDraft(d && d.kcal > 0 ? { replaces, t: d } : null);
  const saved = totals(entries);
  const before = draft?.replaces ? totals(entries.filter((e) => e.id !== draft.replaces)) : saved;
  const t = draft ? sum(before, draft.t) : saved;
  const left = remaining(plan, t);
  const summary = useRef<HTMLElement>(null);
  const [summaryVisible, setSummaryVisible] = useState(true);
  useEffect(() => {
    const el = summary.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([en]) => setSummaryVisible(en.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const refresh = () => setVersion((v) => v + 1);
  const shift = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
    setAdding(null);
    setDraft(null);
  };
  const longDate = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const label = isToday ? 'Hoy' : longDate.charAt(0).toUpperCase() + longDate.slice(1);

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Diario</h1>
          <p>Lo que vas comiendo frente a tu plan del día.</p>
        </div>
      </header>

      <div className="day-nav">
        <button className="icon-btn" aria-label="Día anterior" onClick={() => shift(-1)}><ChevronLeft size={20} /></button>
        <div>
          <strong>{label}</strong>
          <span>{entreno ? <><Dumbbell size={13} /> Día de entreno</> : <><Sofa size={13} /> Día sin entreno</>} · {fmt(plan.kcal, 0)} kcal</span>
        </div>
        <button className="icon-btn" aria-label="Día siguiente" onClick={() => shift(1)} disabled={isToday}><ChevronRight size={20} /></button>
      </div>

      <section className={`card ${draft ? 'previewing' : ''}`} ref={summary}>
        <div className="kcal-head">
          <div>
            <strong>{fmt(t.kcal, 0)}</strong> <span>/ {fmt(plan.kcal, 0)} kcal</span>
          </div>
          <span className={tooMuch(t.kcal, plan.kcal, TOL.kcal) ? 'over' : 'muted'}>
            {left.kcal >= 0 ? `Te quedan ${fmt(left.kcal, 0)} kcal` : `Te has pasado ${fmt(-left.kcal, 0)} kcal`}
          </span>
        </div>
        <Bar value={t.kcal} before={before.kcal} max={plan.kcal} big tol={TOL.kcal} />
        {draft && <p className="preview-note">Con la comida que estás añadiendo (+{fmt(t.kcal - before.kcal, 0)} kcal). Aún no está guardada.</p>}
        <div className="macros">
          <Macro previewing={!!draft} label="Proteína" value={t.prot} before={before.prot} max={plan.prot} goal="reach" />
          <Macro previewing={!!draft} label="Hidratos" value={t.hc} before={before.hc} max={plan.hc} />
          <Macro previewing={!!draft} label="Grasa" value={t.grasa} before={before.grasa} max={plan.grasa} />
        </div>
      </section>

      {draft && !summaryVisible && <DraftStrip t={t} before={before} plan={plan} />}

      <section className="card">
        <h2 className="card-title">Comidas</h2>
        {!adding && (
          <div className="diary-actions">
            <button className="btn primary" onClick={() => setAdding('meal')}><Plus size={16} /> Añadir comida</button>
            <button className="btn ghost" onClick={() => setAdding('manual')}><PenLine size={16} /> Valores a mano</button>
          </div>
        )}
        {adding === 'meal' && (
          <MealBuilder entreno={entreno} onDraft={onDraft()} onCancel={() => setAdding(null)} onSave={(e) => { addEntry(e, key); setAdding(null); refresh(); toast('Comida añadida al diario'); }} />
        )}
        {adding === 'manual' && <ManualEntry onDraft={onDraft()} onCancel={() => setAdding(null)} onAdd={(e) => { addEntry(e, key); setAdding(null); refresh(); toast('Añadido al diario'); }} />}
        {entries.length ? (
          <div className="entries">
            {entries.map((e) => <EntryRow key={e.id} e={e} day={key} entreno={entreno} onDraft={onDraft(e.id)} onOpen={onOpen} onChange={refresh} />)}
          </div>
        ) : (
          !adding && <p className="empty">Aún no has apuntado nada {isToday ? 'hoy' : 'este día'}.</p>
        )}
      </section>
      <p className="small muted">«Añadir comida» suma los productos que ya has escaneado con la cantidad que tomes. Lo que no tengas escaneado (por ejemplo, un plato casero) apúntalo con «Valores a mano». La app usa lo que te queda del día para ajustar la cantidad máxima de cada producto.</p>
    </div>
  );
}

const sum = (a: Totals, b: Totals): Totals => ({ kcal: a.kcal + b.kcal, prot: a.prot + b.prot, hc: a.hc + b.hc, grasa: a.grasa + b.grasa });

/** Barra de progreso; si hay comida en preparación, la parte nueva va en otro tono. */
/**
 * Cuándo algo sale en rojo: solo si es malo para el objetivo. Pasarse de proteína no se marca (es lo que
 * hay que alcanzar en déficit); hidratos y grasa, solo si se pasan más de un 5 % (las calorías, un 2 %).
 */
const TOL = { macro: 0.05, kcal: 0.02 };
const tooMuch = (value: number, max: number, tol: number) => max > 0 && value > max * (1 + tol);

function Bar({ value, before = value, max, big, reach, tol = TOL.macro }: { value: number; before?: number; max: number; big?: boolean; reach?: boolean; tol?: number }) {
  const pct = (x: number) => (max > 0 ? Math.max(0, Math.min(100, (x / max) * 100)) : 0);
  const base = pct(Math.min(before, value));
  const add = pct(value) - base;
  const bad = (v: number) => !reach && tooMuch(v, max, tol);
  return (
    <div className={`bar ${big ? 'big' : ''}`} aria-hidden>
      <span style={{ width: `${base}%` }} className={bad(before) ? 'over' : ''} />
      {add > 0 && <span style={{ width: `${add}%` }} className={`add ${bad(value) ? 'over' : ''}`} />}
    </div>
  );
}

function Macro({ label, value, before = value, max, goal, previewing }: { label: string; value: number; before?: number; max: number; goal?: 'reach'; previewing?: boolean }) {
  const left = max - value;
  const add = value - before;
  const reach = goal === 'reach';
  const bad = !reach && tooMuch(value, max, TOL.macro);
  const text = left > 0.5 ? `faltan ${fmt(left, 0)} g` : reach ? 'objetivo cumplido' : bad ? `te pasas ${fmt(-left, 0)} g` : 'en tu objetivo';
  return (
    <div className="macro">
      <span className="macro-label">{label}</span>
      <Bar value={value} before={before} max={max} reach={reach} />
      <span className="macro-val"><b>{fmt(value, 0)}</b> / {fmt(max, 0)} g</span>
      {previewing && <em className="macro-add">{add < 0 ? '−' : '+'}{fmt(Math.abs(add), 0)} g</em>}
      <small className={bad ? 'over' : left <= 0.5 ? 'ok-text' : 'muted'}>{text}</small>
    </div>
  );
}

/** Resumen fijo arriba mientras se añade una comida y el resumen del día no se ve. */
function DraftStrip({ t, before, plan }: { t: Totals; before: Totals; plan: { kcal: number; prot: number; hc: number; grasa: number } }) {
  const items: [string, number, number][] = [
    ['Prot.', t.prot, plan.prot],
    ['HC', t.hc, plan.hc],
    ['Grasa', t.grasa, plan.grasa],
  ];
  return (
    <div className="draft-strip" role="status">
      <div className="draft-inner">
        <div className="draft-kcal">
          <span>Con esta comida</span>
          <b className={tooMuch(t.kcal, plan.kcal, TOL.kcal) ? 'over' : ''}>{fmt(t.kcal, 0)}</b> / {fmt(plan.kcal, 0)} kcal
        </div>
        <Bar value={t.kcal} before={before.kcal} max={plan.kcal} tol={TOL.kcal} />
        <div className="draft-macros">
          {items.map(([l, v, m]) => (
            <span key={l} className={l !== 'Prot.' && tooMuch(v, m, TOL.macro) ? 'over' : ''}><small>{l}</small> <b>{fmt(v, 0)}</b>/{fmt(m, 0)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function EntryRow({ e, day, entreno, onDraft, onOpen, onChange }: { e: DiaryEntry; day: string; entreno: boolean; onDraft: (t: Totals | null) => void; onOpen: (p: Product) => void; onChange: () => void }) {
  const target = useMemo(() => mealTarget(loadPlan(), e.name, entreno), [e.name, entreno]);
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(e.units ?? e.grams ?? '').replace('.', ','));
  const [time, setTime] = useState(e.time);
  const unitOf = (p?: Product) => (p?.liquid ? 'ml' : 'g');
  const single = !e.items && e.product && e.grams != null;
  const manual = !e.items && !e.product;
  const qtyText = e.units != null ? `${fmt(e.units, 1)} ${e.units === 1 ? e.unitName : plural(e.unitName ?? 'unidad')}` : e.grams != null ? `${fmt(e.grams, 0)} ${unitOf(e.product)}` : null;
  const meta = [qtyText, `${fmt(e.kcal, 0)} kcal`, `${fmt(e.prot, 0)} g prot.`, `${fmt(e.hc, 0)} g HC`, `${fmt(e.grasa, 0)} g grasa`].filter(Boolean).join(' · ');

  if (editing && manual) {
    return (
      <div className="entry">
        <ManualEntry initial={e} onDraft={onDraft} onCancel={() => setEditing(false)} onAdd={(m) => { updateEntry(e.id, m, day); setEditing(false); onChange(); }} />
      </div>
    );
  }

  if (editing && e.items) {
    return (
      <div className="entry">
        <MealBuilder initial={e} entreno={entreno} onDraft={onDraft} onCancel={() => setEditing(false)} onSave={(m) => { updateEntry(e.id, m, day); setEditing(false); onChange(); }} />
      </div>
    );
  }

  const save = () => {
    const q = num(qty);
    if (q <= 0 || !e.product) return setEditing(false);
    const grams = e.units != null && e.product.unitWeight ? q * e.product.unitWeight : q;
    updateEntry(e.id, { grams, units: e.units != null ? q : undefined, time: time || e.time, ...forGrams(e.product.n, grams) }, day);
    setEditing(false);
    onChange();
  };

  return (
    <div className="entry">
      <div className="entry-row">
        <span className="entry-time">{e.time}</span>
        <button className="entry-main" onClick={() => setEditing(!editing)} aria-expanded={editing}>
          <span className="entry-title">{e.name}</span>
          <span className="entry-meta">{meta}</span>
        </button>
        <button className={`icon-btn ${editing ? 'on' : ''}`} aria-label={`Editar ${e.name}`} aria-expanded={editing} onClick={() => setEditing(!editing)}>
          <Pencil size={16} />
        </button>
        <button className="icon-btn" aria-label={`Borrar ${e.name}`} onClick={() => { removeEntry(e.id, day); onChange(); }}>
          <Trash2 size={16} />
        </button>
      </div>
      {e.items && (
        <ul className="entry-items">
          {e.items.map((i, k) => {
            const g = itemGrams(i);
            const q = i.unit === 'unidad' ? `${fmt(i.qty, 1)} ${i.qty === 1 ? i.product.unitName ?? 'unidad' : plural(i.product.unitName ?? 'unidad')}` : `${fmt(g, 0)} ${unitOf(i.product)}`;
            return (
              <li key={k}>
                <span>{q} · {i.product.name}</span>
                <span>{fmt(forGrams(i.product.n, g).kcal, 0)} kcal</span>
              </li>
            );
          })}
        </ul>
      )}
      {target && (
        <div className="entry-vs">
          <span className="entry-vs-title">Plan: {target.raciones}</span>
          <VsPlan label="HC" value={e.hc} goal={target.hc} />
          <VsPlan label="Prot." value={e.prot} goal={target.prot} reach />
          <VsPlan label="Grasa" value={e.grasa} goal={target.grasa} />
        </div>
      )}
      {editing && single && (
        <div className="entry-edit">
          <div className="entry-edit-row">
            <div className="with-unit">
              <input inputMode="decimal" value={qty} onChange={(ev) => setQty(ev.target.value)} aria-label="Cantidad" />
              <em>{e.units != null ? plural(e.unitName ?? 'unidad') : unitOf(e.product)}</em>
            </div>
            <input type="time" value={time} onChange={(ev) => setTime(ev.target.value)} aria-label="Hora" className="entry-edit-time" />
            <button className="btn primary small-btn" onClick={save}>Guardar</button>
          </div>
          <button className="link" onClick={() => onOpen(e.product!)}>Ver la valoración del producto</button>
        </div>
      )}
    </div>
  );
}

function ManualEntry({ onAdd, onCancel, initial, onDraft }: { onAdd: (e: Omit<DiaryEntry, 'id' | 'time'> & { time?: string }) => void; onCancel: () => void; initial?: DiaryEntry; onDraft?: (t: Totals | null) => void }) {
  const str = (x?: number) => (x == null ? '' : String(Math.round(x * 10) / 10).replace('.', ','));
  const [time, setTime] = useState(() => initial?.time ?? new Date().toTimeString().slice(0, 5));
  const [v, setV] = useState({ name: initial?.name ?? '', kcal: str(initial?.kcal), prot: str(initial?.prot), hc: str(initial?.hc), grasa: str(initial?.grasa) });
  const set = (k: keyof typeof v) => (ev: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: ev.target.value });
  const ok = v.name.trim() && num(v.kcal) > 0;
  useDraft(onDraft, num(v.kcal) > 0 ? { kcal: num(v.kcal), prot: num(v.prot), hc: num(v.hc), grasa: num(v.grasa) } : null);
  return (
    <div className="cita-editor">
      <div className="manual-head">
        <label className="field"><span>Qué has comido</span><input value={v.name} onChange={set('name')} placeholder="Comida del menú: pollo con arroz" /></label>
        <label className="field"><span>Hora</span><input type="time" value={time} onChange={(ev) => setTime(ev.target.value)} /></label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Calorías</span><div className="with-unit"><input inputMode="decimal" value={v.kcal} onChange={set('kcal')} /><em>kcal</em></div></label>
        <label className="field"><span>Proteína</span><div className="with-unit"><input inputMode="decimal" value={v.prot} onChange={set('prot')} /><em>g</em></div></label>
        <label className="field"><span>Hidratos</span><div className="with-unit"><input inputMode="decimal" value={v.hc} onChange={set('hc')} /><em>g</em></div></label>
        <label className="field"><span>Grasa</span><div className="with-unit"><input inputMode="decimal" value={v.grasa} onChange={set('grasa')} /><em>g</em></div></label>
      </div>
      <div className="cita-actions">
        <button className="btn ghost small-btn" onClick={onCancel}>Cancelar</button>
        <button className="btn primary small-btn" disabled={!ok} onClick={() => onAdd({ name: v.name.trim(), time: time || undefined, grams: null, kcal: num(v.kcal), prot: num(v.prot), hc: num(v.hc), grasa: num(v.grasa) })}>{initial ? 'Guardar' : 'Añadir'}</button>
      </div>
    </div>
  );
}
