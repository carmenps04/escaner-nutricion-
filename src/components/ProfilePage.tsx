import { useEffect, useRef, useState } from 'react';
import { Camera, Dumbbell, Link2, Loader2, Sofa } from 'lucide-react';
import {
  OBJETIVOS, imc, macroKcal, racionesToGrams, saveProfile, syncProfileWithCitas,
  type DayPlan, type Objetivo, type Profile,
} from '../lib/profile.ts';
import { parseDietSheet } from '../lib/parseDietSheet.ts';
import { readImage, statusText } from '../lib/ocr.ts';
import { fmt } from '../lib/evaluate.ts';
import CitasCard from './CitasCard.tsx';
import TrainingCard from './TrainingCard.tsx';

const num = (s: string) => {
  const t = s.replace(',', '.').trim();
  return t === '' || !isFinite(+t) ? 0 : +t;
};
const str = (v: number | undefined) => (v == null ? '' : String(v).replace('.', ','));

interface Props {
  profile: Profile;
  configured: boolean;
  onSaved: (p: Profile) => void;
  toast: (m: string) => void;
}

export default function ProfilePage({ profile, configured, onSaved, toast }: Props) {
  const [p, setP] = useState<Profile>(profile);
  const [busy, setBusy] = useState<string | null>(null);
  const [found, setFound] = useState<string[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const dirty = !configured || JSON.stringify(p) !== JSON.stringify(profile);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((old) => ({ ...old, [k]: v }));
  const setDay = (day: 'descanso' | 'entreno', patch: Partial<DayPlan>) => setP((old) => ({ ...old, [day]: { ...old[day], ...patch } }));

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
      toast('Enlace copiado. Ábrelo en el otro dispositivo para cargar tu perfil.');
    } catch {
      prompt('Copia este enlace', url);
    }
  };

  return (
    <div className={`page ${dirty ? 'has-savebar' : ''}`}>
      <header className="page-head">
        <div>
          <h1>Mi perfil</h1>
          <p>Datos de tu última cita con el dietista. Se guardan solo en este dispositivo.</p>
        </div>
      </header>

      <section className="card">
        <button className="btn primary wide" onClick={() => file.current?.click()} disabled={!!busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <Camera size={18} />}
          {busy ?? 'Leer la hoja del dietista'}
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readSheet(f); e.target.value = ''; }} />
        {found ? (
          <p className="note">
            {found.length ? <>He leído: {found.join(', ')}. Revisa los números y pulsa <b>Guardar</b>.</> : 'No he encontrado datos en la foto. Prueba con una captura más nítida o rellénalo a mano.'}
          </p>
        ) : (
          <p className="small muted">Sirve una foto o una captura del PDF. Después revisa los números antes de guardar.</p>
        )}
      </section>

      <div className="cols">
        <div className="col">
          <PlanCard title="Días sin entreno" icon={<Sofa size={15} />} d={p.descanso} onChange={(patch) => setDay('descanso', patch)} />
          <PlanCard title="Días de entreno" icon={<Dumbbell size={15} />} d={p.entreno} onChange={(patch) => setDay('entreno', patch)} />
          <TrainingCard semana={p.semana ?? []} onChange={(semana) => setP((old) => ({ ...old, semana, diasEntrenoSemana: semana.length }))} />
          <p className="small muted">
            Las raciones se leen como hidratos · proteína · grasa, a 10 g cada una (16.12.5 = 160 g de hidratos, 120 g de proteína y 50 g de grasa). Cuadra con las calorías de la hoja, pero es una suposición: confírmala con tu dietista.
          </p>
        </div>

        <div className="col">
          <section className="card">
            <h2 className="card-title">Composición corporal</h2>
            <label className="field">
              <span>Fecha de la medición</span>
              <input type="date" value={p.fecha} onChange={(e) => set('fecha', e.target.value)} />
            </label>
            <div className="grid-2">
              <NumField label="Peso" unit="kg" value={p.peso} onCommit={(v) => set('peso', v)} />
              <NumField label="Talla" unit="cm" value={p.talla} onCommit={(v) => set('talla', v)} />
              <NumField label="Grasa" unit="%" value={p.pctGrasa} onCommit={(v) => set('pctGrasa', v)} />
              <NumField label="Kg de grasa" unit="kg" value={p.kgGrasa} onCommit={(v) => set('kgGrasa', v)} />
              <NumField label="Masa libre de grasa" unit="kg" value={p.mlg} onCommit={(v) => set('mlg', v)} />
              <div className="field"><span>IMC</span><div className="readonly">{p.talla ? fmt(imc(p)) : '—'}</div></div>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Gasto y objetivo</h2>
            <label className="field">
              <span>Objetivo</span>
              <select value={p.objetivo} onChange={(e) => set('objetivo', e.target.value as Objetivo)}>
                {Object.entries(OBJETIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="grid-2">
              <NumField label="GMT + NEAT" unit="kcal" value={p.gmtNeat} onCommit={(v) => set('gmtNeat', v)} />
              <NumField label="Gasto del entreno" unit="kcal" value={p.gastoEntreno} onCommit={(v) => set('gastoEntreno', v)} />
              <NumField label="Déficit o superávit" unit="%" value={p.deficitPct} onCommit={(v) => set('deficitPct', v)} />
            </div>
          </section>

          <CitasCard onChange={() => onSaved(syncProfileWithCitas(profile))} />

          {configured && (
            <button className="link" onClick={shareLink}><Link2 size={14} style={{ verticalAlign: '-2px' }} /> Copiar enlace para pasar el perfil a otro dispositivo</button>
          )}
        </div>
      </div>

      {dirty && (
        <div className="savebar">
          <span>{configured ? 'Tienes cambios sin guardar' : 'Revisa tus datos y guárdalos'}</span>
          {configured && <button className="btn ghost" onClick={() => { setP(profile); setFound(null); }}>Descartar</button>}
          <button className="btn primary" onClick={save}>Guardar</button>
        </div>
      )}
    </div>
  );
}

function PlanCard({ title, icon, d, onChange }: { title: string; icon: React.ReactNode; d: DayPlan; onChange: (p: Partial<DayPlan>) => void }) {
  const diff = macroKcal(d) - d.kcal;
  return (
    <section className="card">
      <h2 className="card-title">{icon} {title}</h2>
      <div className="grid-2">
        <NumField label="Calorías" unit="kcal" value={d.kcal} onCommit={(v) => onChange({ kcal: v })} />
        <RacionesField value={d.raciones ?? ''} onChange={(r) => {
          const g = racionesToGrams(r);
          onChange(g ? { raciones: r, ...g } : { raciones: r });
        }} />
      </div>
      <div className="grid-3">
        <NumField label="Hidratos" unit="g" value={d.hc} onCommit={(v) => onChange({ hc: v })} />
        <NumField label="Proteína" unit="g" value={d.prot} onCommit={(v) => onChange({ prot: v })} />
        <NumField label="Grasa" unit="g" value={d.grasa} onCommit={(v) => onChange({ grasa: v })} />
      </div>
      <p className={`small ${Math.abs(diff) > 60 ? '' : 'muted'}`}>
        Los macros suman {fmt(macroKcal(d), 0)} kcal{Math.abs(diff) > 60 ? `: ${diff > 0 ? '+' : ''}${fmt(diff, 0)} respecto a las calorías, revisa los gramos.` : '.'}
      </p>
    </section>
  );
}

function NumField({ label, unit, value, onCommit }: { label: string; unit: string; value: number | undefined; onCommit: (v: number) => void }) {
  const [text, setText] = useState(str(value));
  // Si el valor cambia desde fuera (foto de la hoja, descartar), se actualiza el campo.
  useEffect(() => {
    if (num(text) !== (value ?? 0)) setText(str(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="with-unit">
        <input inputMode="decimal" value={text} onChange={(e) => { setText(e.target.value); onCommit(num(e.target.value)); }} />
        <em>{unit}</em>
      </div>
    </label>
  );
}

function RacionesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>Raciones HC·P·G</span>
      <input value={value} placeholder="16.12.5" inputMode="decimal" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
