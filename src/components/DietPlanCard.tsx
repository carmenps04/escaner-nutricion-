import { useState } from 'react';
import { ClipboardList, Dumbbell, Sofa } from 'lucide-react';
import { deletePlan, loadPlan, type DietPlan, type PlanMeal } from '../lib/plan.ts';

const ORDER: PlanMeal[] = ['desayuno', 'mediaManana', 'comida', 'merienda', 'cena'];
const fecha = (f: string) => new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Plan del dietista cargado en el dispositivo: raciones por comida, verdura, fruta y notas. */
export default function DietPlanCard() {
  const [plan, setPlan] = useState<DietPlan | null>(loadPlan);
  const [confirming, setConfirming] = useState(false);

  if (!plan) {
    return (
      <section className="card plan-card">
        <h2 className="card-title"><ClipboardList size={15} /> Plan del dietista</h2>
        <p className="small muted">Aún no hay un plan cargado. Se carga con un enlace o código en «Tus datos». Con él, la app aplica sus límites de verdura, sus raciones de fruta y las raciones de cada comida.</p>
      </section>
    );
  }

  const day = (k: 'descanso' | 'entreno') => (
    <dl>
      {ORDER.map((m) => {
        const d = plan.comidas[k][m];
        return d ? [<dt key={m + 't'}>{d.titulo.replace(/ \(.*\)$/, '')}</dt>, <dd key={m + 'd'}>{d.raciones}</dd>] : null;
      })}
    </dl>
  );

  return (
    <section className="card plan-card">
      <h2 className="card-title"><ClipboardList size={15} /> Plan del dietista</h2>
      <p className="small muted">Del {fecha(plan.fecha)}. Raciones de hidratos · proteína · grasa (10 g cada una).</p>
      <div className="plan-days">
        <div>
          <h3><Sofa size={13} style={{ verticalAlign: '-2px' }} /> Sin entreno</h3>
          {day('descanso')}
        </div>
        <div>
          <h3><Dumbbell size={13} style={{ verticalAlign: '-2px' }} /> Con entreno</h3>
          {day('entreno')}
        </div>
      </div>

      <h3>Verdura</h3>
      <p className="small">{plan.verdura.texto}</p>

      <h3>Fruta: 1 ración (10 g de hidratos)</h3>
      <dl>
        {[...plan.fruta].sort((a, b) => b.gramos - a.gramos).map((f) => [
          <dt key={f.gramos + 't'}>{f.gramos} g</dt>,
          <dd key={f.gramos + 'd'}>{cap(f.frutas.join(', '))}</dd>,
        ])}
      </dl>

      {plan.notas.length > 0 && (
        <>
          <h3>Notas</h3>
          <ul>{plan.notas.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}

      {confirming ? (
        <div className="cita-confirm">
          <span>¿Quitar el plan de este dispositivo?</span>
          <button className="btn ghost small-btn" onClick={() => setConfirming(false)}>Cancelar</button>
          <button className="btn danger small-btn" onClick={() => { deletePlan(); setPlan(null); setConfirming(false); }}>Quitar</button>
        </div>
      ) : (
        <button className="link plan-remove" onClick={() => setConfirming(true)}>Quitar el plan</button>
      )}
    </section>
  );
}
