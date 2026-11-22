import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import type { Profile } from '../lib/profile.ts';
import { dayKey } from '../lib/diary.ts';
import { fmt } from '../lib/evaluate.ts';
import {
  addDays, monthDays, monthWeeks, parseDay, periodStats, refreshSummaries, tips, toneOf, TONE_TEXT, weekDays, weekStart,
  type DaySum, type Stats, type Tone,
} from '../lib/resumen.ts';

type Mode = 'semana' | 'mes' | 'año';
const DOW_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DOW_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dow = (k: string) => (parseDay(k).getDay() + 6) % 7;

interface BarItem {
  key: string;
  label: string;
  sub?: string;
  score: number | null;
  /** Texto en lugar de la nota (sin datos, en curso…). */
  note?: string;
  title: string;
  onClick?: () => void;
}

export default function ResumenPage({ profile }: { profile: Profile }) {
  const [mode, setMode] = useState<Mode>('semana');
  const [anchor, setAnchor] = useState(() => new Date());
  // Al abrir: se rehacen los resúmenes de los días que siguen en el diario y se leen todos los guardados.
  const sums = useMemo(() => refreshSummaries(profile), [profile]);
  const now = new Date();
  const todayKey = dayKey(now);

  const start = mode === 'semana' ? weekStart(anchor) : mode === 'mes' ? new Date(anchor.getFullYear(), anchor.getMonth(), 1) : new Date(anchor.getFullYear(), 0, 1);
  const next = mode === 'semana' ? addDays(start, 7) : mode === 'mes' ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : new Date(start.getFullYear() + 1, 0, 1);
  const isCurrent = next > now;
  const shift = (dir: 1 | -1) => setAnchor(mode === 'semana' ? addDays(start, 7 * dir) : mode === 'mes' ? new Date(start.getFullYear(), start.getMonth() + dir, 1) : new Date(start.getFullYear() + dir, 0, 1));
  const open = (m: Mode, d: Date) => { setMode(m); setAnchor(d); window.scrollTo(0, 0); };

  let label: string;
  let content: JSX.Element;
  if (mode === 'semana') {
    const days = weekDays(start);
    const a = parseDay(days[0]);
    const b = parseDay(days[6]);
    const yr = b.getFullYear() !== now.getFullYear() ? ` ${b.getFullYear()}` : '';
    label = a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}${yr}`
      : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}${yr}`;
    if (isCurrent) label = `Esta semana · ${label}`;
    content = <WeekView days={days} sums={sums} todayKey={todayKey} objetivo={profile.objetivo} />;
  } else if (mode === 'mes') {
    label = `${cap(MONTHS[start.getMonth()])} ${start.getFullYear()}`;
    const st = periodStats(monthDays(start.getFullYear(), start.getMonth()), sums, todayKey);
    const weeks: BarItem[] = monthWeeks(start.getFullYear(), start.getMonth())
      .filter((m) => dayKey(m) <= todayKey)
      .map((m) => {
        const ws = periodStats(weekDays(m), sums, todayKey);
        const end = addDays(m, 6);
        const range = `${m.getDate()}–${end.getDate()}`;
        return {
          key: dayKey(m),
          label: range,
          sub: m.getMonth() !== end.getMonth() ? `${MONTHS[m.getMonth()].slice(0, 3)}/${MONTHS[end.getMonth()].slice(0, 3)}` : MONTHS[m.getMonth()].slice(0, 3),
          score: ws.score,
          note: ws.score == null ? 'sin datos' : undefined,
          title: `Semana del ${m.getDate()} ${MONTHS[m.getMonth()]} al ${end.getDate()} ${MONTHS[end.getMonth()]}: ${ws.score == null ? 'sin días completos' : `nota ${fmt(ws.score, 1)} (${ws.counted.length} días)`}`,
          onClick: () => open('semana', m),
        };
      });
    content = (
      <>
        <ScoreCard st={st} what="del mes" />
        <TipsCard items={tips(st, profile.objetivo, 'mes')} />
        <section className="card">
          <h2 className="card-title">Por semanas</h2>
          <Bars items={weeks} />
          <Legend extra="Toca una semana para ver su detalle. Las semanas que empiezan o acaban en otro mes cuentan entera." />
        </section>
      </>
    );
  } else {
    const y = start.getFullYear();
    label = String(y);
    const all = Array.from({ length: 12 }, (_, m) => monthDays(y, m)).flat();
    const st = periodStats(all, sums, todayKey);
    const months: BarItem[] = Array.from({ length: 12 }, (_, m) => m)
      .filter((m) => dayKey(new Date(y, m, 1)) <= todayKey)
      .map((m) => {
        const ms = periodStats(monthDays(y, m), sums, todayKey);
        return {
          key: String(m),
          label: cap(MONTHS[m].slice(0, 3)),
          score: ms.score,
          note: ms.score == null ? '–' : undefined,
          title: `${cap(MONTHS[m])}: ${ms.score == null ? 'sin días completos' : `nota ${fmt(ms.score, 1)} (${ms.counted.length} días)`}`,
          onClick: () => open('mes', new Date(y, m, 1)),
        };
      });
    content = (
      <>
        <ScoreCard st={st} what="del año" />
        <TipsCard items={tips(st, profile.objetivo, 'año')} />
        <section className="card">
          <h2 className="card-title">Por meses</h2>
          <Bars items={months} compact />
          <Legend extra="Toca un mes para ver sus semanas." />
        </section>
      </>
    );
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Resumen</h1>
          <p>Cómo has cumplido tus calorías, y qué mejorar.</p>
        </div>
      </header>

      <div className="seg seg-3" role="radiogroup" aria-label="Periodo">
        {(['semana', 'mes', 'año'] as Mode[]).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setAnchor(new Date()); }}>
            {m === 'semana' ? 'Semanal' : m === 'mes' ? 'Mensual' : 'Anual'}
          </button>
        ))}
      </div>

      <div className="day-nav">
        <button className="icon-btn" aria-label="Anterior" onClick={() => shift(-1)}><ChevronLeft size={20} /></button>
        <div><strong>{label}</strong></div>
        <button className="icon-btn" aria-label="Siguiente" onClick={() => shift(1)} disabled={isCurrent}><ChevronRight size={20} /></button>
      </div>

      {content}
    </div>
  );
}

function WeekView({ days, sums, todayKey, objetivo }: { days: string[]; sums: Record<string, DaySum>; todayKey: string; objetivo: Profile['objetivo'] }) {
  const st = periodStats(days, sums, todayKey);
  const enCurso = st.rows.find((r) => r.status === 'curso');
  // Ranking: de mejor a peor nota; detrás, hoy (en curso) y los días sin datos.
  const order = { ok: 0, curso: 1, vacio: 2, antes: 3, futuro: 3 };
  const rows = st.rows.filter((r) => r.status !== 'futuro' && r.status !== 'antes').sort((a, b) => order[a.status] - order[b.status] || (b.score ?? 0) - (a.score ?? 0) || a.day.localeCompare(b.day));
  const items: BarItem[] = rows.map((r) => {
    const d = parseDay(r.day);
    const kcal = r.sum ? `${fmt(r.sum.kcal, 0)} de ${fmt(r.sum.plan.kcal, 0)} kcal` : 'sin datos';
    return {
      key: r.day,
      label: DOW_SHORT[dow(r.day)],
      sub: String(d.getDate()),
      score: r.status === 'ok' ? r.score : null,
      note: r.status === 'curso' ? 'en curso' : r.status === 'vacio' ? 'sin datos' : undefined,
      title: `${DOW_LONG[dow(r.day)]} ${d.getDate()}: ${kcal}${r.status === 'ok' ? ` · nota ${fmt(r.score!, 1)}` : r.status === 'curso' ? ' · cuenta al apuntar la cena' : ''}`,
    };
  });
  return (
    <>
      <ScoreCard st={st} what="de la semana" note={enCurso ? 'Hoy cuenta cuando apuntes la cena.' : undefined} />
      <TipsCard items={tips(st, objetivo, 'semana')} />
      <section className="card">
        <h2 className="card-title">Ranking de días</h2>
        <Bars items={items} />
        <Legend extra="Nota de cada día según las calorías frente a tu plan." />
      </section>
    </>
  );
}

function ScoreCard({ st, what, note }: { st: Stats; what: string; note?: string }) {
  if (st.score == null) {
    return (
      <section className="card">
        <p className="empty">No hay días completos apuntados {what === 'de la semana' ? 'esta semana' : what === 'del mes' ? 'este mes' : 'este año'}.{note ? ` ${note}` : ''}</p>
      </section>
    );
  }
  const tone = toneOf(st.score);
  return (
    <section className="card">
      <div className="score-head">
        <div className={`score-badge t-${tone}`} aria-label={`Nota ${what}: ${fmt(st.score, 1)} sobre 10`}>
          <b>{fmt(st.score, 1)}</b><span>/10</span>
        </div>
        <div className="score-text">
          <span className="score-title">Calorías {what}: <b>{TONE_TEXT[tone].toLowerCase()}</b></span>
          <span>{st.counted.length} de {st.span} {st.span === 1 ? 'día completo' : 'días completos'}</span>
          {st.avg && <span>Media: {fmt(st.avg.kcal, 0)} de {fmt(st.avg.plan.kcal, 0)} kcal al día</span>}
        </div>
      </div>
      {note && <p className="small muted">{note}</p>}
    </section>
  );
}

function TipsCard({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="card">
      <h2 className="card-title"><Lightbulb size={14} /> Qué mejorar</h2>
      <ul className="tips">{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  );
}

const toneClass = (s: number | null): Tone | 'none' => (s == null ? 'none' : toneOf(s));

/** Barras verticales con la nota (0–10) encima de cada una y la etiqueta debajo. */
function Bars({ items, compact }: { items: BarItem[]; compact?: boolean }) {
  if (!items.length) return <p className="empty">Sin datos.</p>;
  return (
    <div className={`vbars ${compact ? 'compact' : ''}`} role="list">
      {items.map((it) => {
        const Tag = it.onClick ? 'button' : 'div';
        const h = it.score == null ? 0 : Math.max(3, it.score * 10);
        return (
          <Tag key={it.key} role="listitem" className="vbar" title={it.title} aria-label={it.title} onClick={it.onClick}>
            <span className="vbar-val">{it.score != null ? fmt(it.score, 1) : it.note}</span>
            <span className="vbar-track">
              <span className={`vbar-fill t-${toneClass(it.score)}`} style={{ height: `${h}%` }} />
            </span>
            <span className="vbar-label">{it.label}{it.sub && <small>{it.sub}</small>}</span>
          </Tag>
        );
      })}
    </div>
  );
}

function Legend({ extra }: { extra?: string }) {
  return (
    <div className="vlegend">
      <span><i className="t-verde" /> {TONE_TEXT.verde} (8–10)</span>
      <span><i className="t-amarillo" /> {TONE_TEXT.amarillo} (5–7,9)</span>
      <span><i className="t-rojo" /> {TONE_TEXT.rojo} (&lt; 5)</span>
      {extra && <p className="small muted">{extra}</p>}
    </div>
  );
}
