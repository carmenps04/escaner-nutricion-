// Perfil: los datos que da el dietista en cada cita.

export type Objetivo = 'deficit' | 'mantenimiento' | 'volumen' | 'recomposicion';

export const OBJETIVOS: Record<Objetivo, string> = {
  deficit: 'Perder grasa (déficit)',
  mantenimiento: 'Mantener',
  volumen: 'Ganar masa muscular (superávit)',
  recomposicion: 'Recomposición (perder grasa y ganar músculo)',
};

/** Objetivo diario para un tipo de día. Macros en gramos. */
export interface DayPlan {
  kcal: number;
  hc: number;
  prot: number;
  grasa: number;
  /** Texto original de las raciones del dietista, p. ej. «16.12.5». */
  raciones?: string;
}

export interface Profile {
  fecha: string; // fecha de antropometría (AAAA-MM-DD)
  peso: number;
  talla: number; // cm
  mlg: number; // masa libre de grasa (kg)
  pctGrasa: number;
  kgGrasa: number;
  gmtNeat: number; // gasto metabólico total + NEAT (kcal)
  gastoEntreno: number; // kcal extra en días de gimnasio
  protGKg?: number;
  objetivo: Objetivo;
  deficitPct?: number;
  diasEntrenoSemana: number;
  descanso: DayPlan;
  entreno: DayPlan;
}

/**
 * Valores de ejemplo para el formulario vacío. Los datos reales no van en el código (el repositorio es
 * público): se guardan solo en el móvil, desde el formulario, la foto de la hoja o un enlace #perfil=.
 */
export const DEFAULT_PROFILE: Profile = {
  fecha: new Date().toISOString().slice(0, 10),
  peso: 70,
  talla: 165,
  mlg: 50,
  pctGrasa: 28.6,
  kgGrasa: 20,
  gmtNeat: 1900,
  gastoEntreno: 300,
  objetivo: 'deficit',
  deficitPct: 20,
  diasEntrenoSemana: 4,
  descanso: { kcal: 1520, raciones: '16.11.5', ...racionesToGrams('16.11.5')! },
  entreno: { kcal: 1800, raciones: '19.13.6', ...racionesToGrams('19.13.6')! },
};

/**
 * Convierte las raciones del dietista «HC.P.G» a gramos (1 ración = 10 g del macronutriente).
 * Con esta lectura, 16.12.5 = 160 g HC, 120 g proteína y 50 g grasa ≈ 1570 kcal, que cuadra con las kcal
 * que da la hoja para ese día. El orden HC·P·G es una suposición: si el dietista usa otro, se corrige a mano.
 */
export function racionesToGrams(text: string): { hc: number; prot: number; grasa: number } | null {
  const m = text.match(/(\d{1,2})\s*[.,·\-/]\s*(\d{1,2})\s*[.,·\-/]\s*(\d{1,2})/);
  if (!m) return null;
  return { hc: +m[1] * 10, prot: +m[2] * 10, grasa: +m[3] * 10 };
}

export function macroKcal(p: Pick<DayPlan, 'hc' | 'prot' | 'grasa'>): number {
  return p.hc * 4 + p.prot * 4 + p.grasa * 9;
}

export function imc(p: Pick<Profile, 'peso' | 'talla'>): number {
  return p.peso / (p.talla / 100) ** 2;
}

const KEY = 'escaner.perfil.v1';
const HIST = 'escaner.citas.v1';

export interface CitaResumen {
  fecha: string;
  peso: number;
  pctGrasa: number;
  mlg: number;
  kgGrasa: number;
}

export function hasProfile(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Carga un perfil desde el enlace «…#perfil=<base64>». Lo que va tras «#» no se envía a ningún
 * servidor: solo lo lee el navegador. Devuelve true si se ha importado.
 */
export function importFromHash(): boolean {
  const m = location.hash.match(/perfil=([A-Za-z0-9_\-+/=]+)/);
  if (!m) return false;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const p = { ...DEFAULT_PROFILE, ...JSON.parse(json) } as Profile;
    if (!p.peso || !p.descanso?.kcal || !p.entreno?.kcal) return false;
    saveProfile(p);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch {
    return false;
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch { /* sin almacenamiento: se usan los valores por defecto */ }
  return DEFAULT_PROFILE;
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    const hist = loadCitas().filter((c) => c.fecha !== p.fecha);
    hist.push({ fecha: p.fecha, peso: p.peso, pctGrasa: p.pctGrasa, mlg: p.mlg, kgGrasa: p.kgGrasa });
    hist.sort((a, b) => a.fecha.localeCompare(b.fecha));
    localStorage.setItem(HIST, JSON.stringify(hist));
  } catch { /* ignorar */ }
}

export function loadCitas(): CitaResumen[] {
  try {
    const raw = localStorage.getItem(HIST);
    if (raw) return JSON.parse(raw);
  } catch { /* ignorar */ }
  return [];
}
