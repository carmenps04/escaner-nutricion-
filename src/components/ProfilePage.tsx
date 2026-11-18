import { useRef, useState } from 'react';
import { Camera, Link2, Save } from 'lucide-react';
import {
  OBJETIVOS, imc, loadCitas, macroKcal, racionesToGrams, saveProfile,
  type DayPlan, type Objetivo, type Profile,
} from '../lib/profile.ts';
import { parseDietSheet } from '../lib/parseDietSheet.ts';
import { readImage, statusText } from '../lib/ocr.ts';
import { fmt } from '../lib/evaluate.ts';

const num = (s: string) => {
  const t = s.replace(',', '.').trim();
  return t === '' || !isFinite(+t) ? 0 : +t;
};
const str = (v: number | undefined) => (v == null ? '' : String(v).replace('.', ','));

export default function ProfilePage({ profile, onSaved, toast }: { profile: Profile; onSaved: (p: Profile) => void; toast: (m: string) => void }) {
  const [p, setP] = useState<Profile>(profile);
  const [busy, setBusy] = useState<string | null>(null);
  const [found, setFound] = useState<string[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const citas = loadCitas();

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });
  const setDay = (day: 'descanso' | 'entreno', patch: Partial<DayPlan>) => setP({ ...p, [day]: { ...p[day], ...patch } });

  const readSheet = async (f: File) => {
    setBusy('Preparando el lector…');
    try {
      const [text] = await readImage(f, (pr) => setBusy(`${statusText(pr.status)} ${Math.round(pr.progress * 100)} %`), ['11']);
      const { data, found } = parseDietSheet(text);
      setP((old) => ({
        ...old,
        ...data,
        descanso: { ...old.descanso, ...data.descanso },
        entreno: { ...old.entreno, ...data.entreno },
      }));
      setFound(found);
    } catch {
      toast('No se ha podido leer la foto');
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    saveProfile(p);
    onSaved(p);
    toast('Perfil guardado');
  };

  const shareLink = async () => {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = `${location.origin}${location.pathname}#perfil=${b64}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado: ábrelo en otro dispositivo para cargar tu perfil');
    } catch {
      prompt('Copia este enlace', url);
    }
  };

  const Num = ({ label, k, unit }: { label: string; k: keyof Profile; unit: string }) => (
    <NumField label={label} unit={unit} value={p[k] as number} onCommit={(v) => set(k, v as never)} />
  );

  return (
    <div className="page">
      <h1>Mi perfil</h1>
      <p className="muted">Los datos de tu última cita con el dietista. Se guardan solo en este móvil.</p>

      <button className="btn primary wide" onClick={() => file.current?.click()} disabled={!!busy}>
        <Camera size={18} /> {busy ?? 'Leer la hoja del dietista (foto o captura)'}
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readSheet(f); e.target.value = ''; }} />
      {found && (
        <p className="note">
          {found.length ? <>He leído: {found.join(', ')}. Revisa los números y pulsa <b>Guardar</b>.</> : 'No he encontrado datos en la foto. Prueba con una captura más nítida o rellénalo a mano.'}
        </p>
      )}

      <div className="card">
        <h2>Composición corporal</h2>
        <label className="field">
          <span>Fecha de la antropometría</span>
          <input type="date" value={p.fecha} onChange={(e) => set('fecha', e.target.value)} />
        </label>
        <div className="two">
          {Num({ label: "Peso", k: "peso", unit: "kg" })}
          {Num({ label: "Talla", k: "talla", unit: "cm" })}
          {Num({ label: "Masa libre de grasa", k: "mlg", unit: "kg" })}
          {Num({ label: "Grasa", k: "pctGrasa", unit: "%" })}
          {Num({ label: "Kg de grasa", k: "kgGrasa", unit: "kg" })}
          <div className="field"><span>IMC</span><div className="readonly">{p.talla ? fmt(imc(p)) : '—'}</div></div>
        </div>
      </div>

      <div className="card">
        <h2>Gasto y objetivo</h2>
        <div className="two">
          {Num({ label: "GMT + NEAT", k: "gmtNeat", unit: "kcal" })}
          {Num({ label: "Gasto del entreno", k: "gastoEntreno", unit: "kcal" })}
        </div>
        <label className="field">
          <span>Objetivo</span>
          <select value={p.objetivo} onChange={(e) => set('objetivo', e.target.value as Objetivo)}>
            {Object.entries(OBJETIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <div className="two">
          {Num({ label: "Déficit / superávit", k: "deficitPct", unit: "%" })}
          {Num({ label: "Días de entreno", k: "diasEntrenoSemana", unit: "/sem" })}
        </div>
      </div>

      {(['descanso', 'entreno'] as const).map((day) => {
        const d = p[day];
        const diff = macroKcal(d) - d.kcal;
        return (
          <div className="card" key={day}>
            <h2>{day === 'entreno' ? 'Días de entreno' : 'Días sin entreno'}</h2>
            <div className="two">
              <label className="field">
                <span>Calorías</span>
                <div className="with-unit">
                  <input inputMode="numeric" defaultValue={str(d.kcal)} key={`${day}k-${d.kcal}`} onBlur={(e) => setDay(day, { kcal: num(e.target.value) })} />
                  <em>kcal</em>
                </div>
              </label>
              <label className="field">
                <span>Raciones HC·P·G</span>
                <input
                  defaultValue={d.raciones ?? ''}
                  key={`${day}r-${d.raciones}`}
                  placeholder="16.12.5"
                  onBlur={(e) => {
                    const g = racionesToGrams(e.target.value);
                    setDay(day, g ? { raciones: e.target.value, ...g } : { raciones: e.target.value });
                  }}
                />
              </label>
            </div>
            <div className="three">
              {(['hc', 'prot', 'grasa'] as const).map((k) => (
                <label className="field" key={k}>
                  <span>{{ hc: 'Hidratos', prot: 'Proteína', grasa: 'Grasa' }[k]}</span>
                  <div className="with-unit">
                    <input inputMode="numeric" defaultValue={str(d[k])} key={`${day}${k}-${d[k]}`} onBlur={(e) => setDay(day, { [k]: num(e.target.value) })} />
                    <em>g</em>
                  </div>
                </label>
              ))}
            </div>
            <p className="muted small">
              Los macros suman {fmt(macroKcal(d), 0)} kcal{Math.abs(diff) > 60 ? ` (${diff > 0 ? '+' : ''}${fmt(diff, 0)} respecto a las calorías: revisa los gramos)` : ''}.
            </p>
          </div>
        );
      })}
      <p className="note small">
        Las raciones se leen como hidratos · proteína · grasa, a 10 g por ración (16.12.5 = 160 g de hidratos, 120 g de proteína y 50 g de grasa). Es una suposición que cuadra con las calorías de la hoja: confírmala con tu dietista y, si el orden es otro, cambia los gramos.
      </p>

      <div className="actions sticky">
        <button className="btn ghost" onClick={shareLink}><Link2 size={16} /> Copiar enlace</button>
        <button className="btn primary" onClick={save}><Save size={16} /> Guardar</button>
      </div>

      {citas.length > 0 && (
        <div className="card">
          <h2>Evolución por citas</h2>
          <table className="nutri-table">
            <thead><tr><th>Fecha</th><th>Peso</th><th>% grasa</th><th>MLG</th></tr></thead>
            <tbody>
              {[...citas].reverse().map((c) => (
                <tr key={c.fecha}>
                  <td>{new Date(c.fecha + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td>{fmt(c.peso)} kg</td>
                  <td>{fmt(c.pctGrasa)} %</td>
                  <td>{fmt(c.mlg)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="version">Versión {__APP_VERSION__}</p>
    </div>
  );
}

function NumField({ label, unit, value, onCommit }: { label: string; unit: string; value: number | undefined; onCommit: (v: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="with-unit">
        <input inputMode="decimal" defaultValue={str(value)} key={String(value)} onBlur={(e) => onCommit(num(e.target.value))} />
        <em>{unit}</em>
      </div>
    </label>
  );
}
