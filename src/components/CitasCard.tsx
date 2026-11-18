import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { deleteCita, loadCitas, updateCita, type CitaResumen } from '../lib/profile.ts';
import { fmt } from '../lib/evaluate.ts';

const fecha = (f: string) => new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const num = (s: string) => {
  const t = s.replace(',', '.').trim();
  return t === '' || !isFinite(+t) ? 0 : +t;
};
const str = (v: number) => String(v).replace('.', ',');

/** Evolución por citas, con edición y borrado de cada una. `onChange` avisa para actualizar el perfil. */
export default function CitasCard({ onChange }: { onChange: () => void }) {
  const [citas, setCitas] = useState(loadCitas);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = () => {
    setCitas(loadCitas());
    setEditing(null);
    setConfirming(null);
    onChange();
  };

  if (!citas.length) return null;
  return (
    <section className="card">
      <h2 className="card-title">Evolución por citas</h2>
      <div className="list">
        {[...citas].reverse().map((c) =>
          editing === c.fecha ? (
            <CitaEditor key={c.fecha} cita={c} onCancel={() => setEditing(null)} onSave={(n) => { updateCita(c.fecha, n); refresh(); }} />
          ) : confirming === c.fecha ? (
            <div key={c.fecha} className="cita-confirm">
              <span>¿Borrar la cita del {fecha(c.fecha)}?</span>
              <button className="btn ghost small-btn" onClick={() => setConfirming(null)}>Cancelar</button>
              <button className="btn danger small-btn" onClick={() => { deleteCita(c.fecha); refresh(); }}>Borrar</button>
            </div>
          ) : (
            <div key={c.fecha} className="list-item cita">
              <div className="cita-info">
                <strong>{fecha(c.fecha)}</strong>
                <span>{fmt(c.peso)} kg · {fmt(c.pctGrasa)} % grasa · MLG {fmt(c.mlg)} kg</span>
              </div>
              <button className="icon-btn" aria-label={`Editar la cita del ${fecha(c.fecha)}`} onClick={() => { setEditing(c.fecha); setConfirming(null); }}>
                <Pencil size={16} />
              </button>
              <button className="icon-btn" aria-label={`Borrar la cita del ${fecha(c.fecha)}`} onClick={() => { setConfirming(c.fecha); setEditing(null); }}>
                <Trash2 size={16} />
              </button>
            </div>
          ),
        )}
      </div>
      <p className="small muted">La composición corporal del perfil es siempre la de la cita más reciente.</p>
    </section>
  );
}

function CitaEditor({ cita, onSave, onCancel }: { cita: CitaResumen; onSave: (c: CitaResumen) => void; onCancel: () => void }) {
  const [f, setF] = useState(cita.fecha);
  const [v, setV] = useState({ peso: str(cita.peso), pctGrasa: str(cita.pctGrasa), kgGrasa: str(cita.kgGrasa), mlg: str(cita.mlg) });
  const field = (k: keyof typeof v, label: string, unit: string) => (
    <label className="field">
      <span>{label}</span>
      <div className="with-unit">
        <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        <em>{unit}</em>
      </div>
    </label>
  );
  return (
    <div className="cita-editor">
      <label className="field">
        <span>Fecha</span>
        <input type="date" value={f} onChange={(e) => setF(e.target.value)} />
      </label>
      <div className="grid-2">
        {field('peso', 'Peso', 'kg')}
        {field('pctGrasa', 'Grasa', '%')}
        {field('kgGrasa', 'Kg de grasa', 'kg')}
        {field('mlg', 'Masa libre de grasa', 'kg')}
      </div>
      <div className="cita-actions">
        <button className="btn ghost small-btn" onClick={onCancel}><X size={16} /> Cancelar</button>
        <button
          className="btn primary small-btn"
          disabled={!f}
          onClick={() => onSave({ fecha: f, peso: num(v.peso), pctGrasa: num(v.pctGrasa), kgGrasa: num(v.kgGrasa), mlg: num(v.mlg) })}
        >
          <Check size={16} /> Guardar cita
        </button>
      </div>
    </div>
  );
}
