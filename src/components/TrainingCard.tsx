import { Dumbbell } from 'lucide-react';
import { DIAS, type TrainingDay } from '../lib/training.ts';

/** Así tiene Carmen organizados sus entrenamientos: día 1 a día 4 de su rutina. */
const SESIONES = ['Día 1', 'Día 2', 'Día 3', 'Día 4'];

/** Semana de entreno: qué días, qué sesión y a qué hora. */
export default function TrainingCard({ semana, onChange }: { semana: TrainingDay[]; onChange: (s: TrainingDay[]) => void }) {
  const byDow = new Map(semana.map((t) => [t.dow, t]));
  const toggle = (dow: number) => {
    if (byDow.has(dow)) onChange(semana.filter((t) => t.dow !== dow));
    else {
      // Al activar un día se propone la hora del último día configurado, para no repetirla.
      const hora = semana[semana.length - 1]?.hora ?? '07:00';
      const usadas = new Set(semana.map((t) => t.sesion));
      const sesion = SESIONES.find((x) => !usadas.has(x));
      onChange([...semana, { dow, hora, sesion }].sort((a, b) => a.dow - b.dow));
    }
  };
  const edit = (dow: number, patch: Partial<TrainingDay>) => onChange(semana.map((t) => (t.dow === dow ? { ...t, ...patch } : t)));

  return (
    <section className="card">
      <h2 className="card-title"><Dumbbell size={15} /> Entreno semanal</h2>
      <p className="small muted">Marca los días que entrenas. Así la app sabe qué plan usar cada día y en qué momento te conviene cada producto.</p>
      <div className="week">
        {DIAS.map((d, dow) => {
          const t = byDow.get(dow);
          return (
            <div key={d} className={`week-day ${t ? 'on' : ''}`}>
              <button type="button" className="week-toggle" role="switch" aria-checked={!!t} onClick={() => toggle(dow)}>
                <span className="switch" aria-hidden />
                <span>{d}</span>
              </button>
              {t ? (
                <div className="week-fields">
                  <select aria-label={`Sesión del ${d}`} value={t.sesion ?? ''} onChange={(e) => edit(dow, { sesion: e.target.value || undefined })}>
                    <option value="">Sin indicar</option>
                    {SESIONES.map((x) => <option key={x} value={x}>{x}</option>)}
                    {/* Si había un nombre antiguo (p. ej. «Empuje»), se conserva como opción. */}
                    {t.sesion && !SESIONES.includes(t.sesion) && <option value={t.sesion}>{t.sesion}</option>}
                  </select>
                  <input aria-label={`Hora del ${d}`} type="time" value={t.hora ?? ''} onChange={(e) => edit(dow, { hora: e.target.value })} />
                </div>
              ) : (
                <span className="week-rest">Descanso</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="small muted">Si una semana cambias de día, puedes ajustarlo solo para hoy desde la pantalla Escanear.</p>
    </section>
  );
}
