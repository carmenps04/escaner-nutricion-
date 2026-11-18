import { Dumbbell, Sofa } from 'lucide-react';
import { setTodayOverride, todayLabel, type Today } from '../lib/training.ts';

/** «Hoy entrenas · Pierna a las 14:00» con un botón para cambiarlo solo por hoy. */
export default function TodayChip({ hoy, onChange }: { hoy: Today; onChange: () => void }) {
  return (
    <div className={`today ${hoy.entreno ? 'on' : ''}`}>
      {hoy.entreno ? <Dumbbell size={18} /> : <Sofa size={18} />}
      <span className="today-text">
        {todayLabel(hoy)}
        {hoy.manual && <small>Cambiado solo para hoy</small>}
      </span>
      {hoy.manual ? (
        <button className="link" onClick={() => { setTodayOverride(null); onChange(); }}>Deshacer</button>
      ) : (
        <button className="link" onClick={() => { setTodayOverride(!hoy.entreno); onChange(); }}>
          {hoy.entreno ? 'Hoy no entreno' : 'Hoy sí entreno'}
        </button>
      )}
    </div>
  );
}
