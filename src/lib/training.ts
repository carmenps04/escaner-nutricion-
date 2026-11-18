// Días de entreno de la semana y ajuste puntual de «hoy».

import type { Profile } from './profile.ts';

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export interface TrainingDay {
  /** 0 = lunes … 6 = domingo */
  dow: number;
  sesion?: string;
  /** «07:00», «14:00»… */
  hora?: string;
}

export interface Today {
  entreno: boolean;
  sesion?: string;
  hora?: string;
  /** true si se ha cambiado a mano solo para hoy. */
  manual: boolean;
}

const KEY = 'escaner.hoy.v1';

export const dowOf = (d: Date) => (d.getDay() + 6) % 7;
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Qué toca hoy según la semana del perfil y el ajuste manual del día (si lo hay). */
export function today(profile: Profile, now = new Date(), override = readOverride(now)): Today {
  const plan = (profile.semana ?? []).find((t) => t.dow === dowOf(now));
  if (override != null) return { entreno: override, sesion: override ? plan?.sesion : undefined, hora: override ? plan?.hora : undefined, manual: true };
  return { entreno: !!plan, sesion: plan?.sesion, hora: plan?.hora, manual: false };
}

function readOverride(now: Date): boolean | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { date: string; entreno: boolean };
    return o.date === isoDay(now) ? o.entreno : null;
  } catch {
    return null;
  }
}

/** Cambia solo el día de hoy; mañana vuelve a mandar la semana del perfil. */
export function setTodayOverride(entreno: boolean | null, now = new Date()): void {
  try {
    if (entreno == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ date: isoDay(now), entreno }));
  } catch { /* ignorar */ }
}

export function todayLabel(t: Today): string {
  if (!t.entreno) return 'Hoy descansas';
  return ['Hoy entrenas', t.sesion, t.hora && `a las ${t.hora}`].filter(Boolean).join(' · ').replace(' · a las', ' a las');
}

/**
 * Consejo de momento del día según el tipo de producto y el entreno de hoy.
 * kind: 'hc' = sobre todo hidratos con poca grasa; 'grasa' = sobre todo grasa.
 */
export function timingAdvice(kind: 'hc' | 'grasa' | null, t: Today): string | null {
  if (!kind) return null;
  const h = t.hora ? parseInt(t.hora, 10) : NaN;
  if (kind === 'hc') {
    if (!t.entreno) return 'Son sobre todo hidratos y hoy no entrenas: si puedes, guárdalo para un día de entreno.';
    if (isNaN(h)) return 'Son sobre todo hidratos: hoy entrenas, así que encaja antes o después del entreno.';
    if (h < 11) return `Son sobre todo hidratos: como hoy entrenas a las ${t.hora}, mejor en el desayuno de después de entrenar.`;
    return `Son sobre todo hidratos: como hoy entrenas a las ${t.hora}, encaja en la comida de antes o en la merienda de después.`;
  }
  if (t.entreno && !isNaN(h)) {
    return h < 11
      ? 'Es sobre todo grasa: mejor en la comida o la cena, no justo después de entrenar.'
      : 'Es sobre todo grasa: mejor en la cena o en el desayuno, lejos del entreno de mediodía.';
  }
  return 'Es sobre todo grasa: mejor lejos del entreno y sin juntarlo con otras grasas en la misma comida.';
}
