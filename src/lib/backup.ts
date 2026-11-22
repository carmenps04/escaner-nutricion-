// Copia de seguridad y traspaso de datos entre Safari, la app de inicio y otros dispositivos.
// Todo vive en localStorage; aquí se empaqueta en un código de texto o en un archivo .json.

export const KEYS = [
  'escaner.perfil.v1',
  'escaner.citas.v1',
  'escaner.historial.v1',
  'escaner.propios.v1',
  'escaner.diario.v1',
  'escaner.orden',
  'escaner.plan.v1',
  'escaner.resumen.v1',
];

export interface Backup {
  app: 'escaner-nutricion';
  version: 1;
  fecha: string;
  datos: Record<string, string>;
}

export function makeBackup(): Backup {
  const datos: Record<string, string> = {};
  for (const k of KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) datos[k] = v;
    } catch { /* ignorar */ }
  }
  return { app: 'escaner-nutricion', version: 1, fecha: new Date().toISOString(), datos };
}

const toB64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** Enlace con todos los datos tras «#datos=». Lo que va tras «#» no se envía a ningún servidor. */
export function backupLink(): string {
  return `${location.origin}${location.pathname}#datos=${toB64(JSON.stringify(makeBackup()))}`;
}

export interface ImportSummary {
  perfil: boolean;
  productos: number;
  dias: number;
  citas: number;
  plan: boolean;
}

function summarize(b: Backup): ImportSummary {
  const count = (k: string, f: (v: any) => number) => {
    try { return b.datos[k] ? f(JSON.parse(b.datos[k])) : 0; } catch { return 0; }
  };
  return {
    perfil: !!b.datos['escaner.perfil.v1'],
    productos: count('escaner.historial.v1', (v) => v.length),
    dias: count('escaner.diario.v1', (v) => Object.keys(v).length),
    citas: count('escaner.citas.v1', (v) => v.length),
    plan: !!b.datos['escaner.plan.v1'],
  };
}

/**
 * Entiende: un enlace o código con «datos=» (todo), uno antiguo con «perfil=» (solo el perfil), el
 * código suelto o el contenido de un archivo de copia (.json).
 */
export function parseBackup(text: string): Backup | null {
  const t = text.trim();
  if (!t) return null;
  try {
    if (t.startsWith('{')) {
      const b = JSON.parse(t);
      return b?.app === 'escaner-nutricion' && b.datos ? b : null;
    }
    const datos = t.match(/datos=([A-Za-z0-9_\-+/=]+)/);
    if (datos) {
      const b = JSON.parse(fromB64(datos[1]));
      return b?.app === 'escaner-nutricion' && b.datos ? b : null;
    }
    const perfil = t.match(/perfil=([A-Za-z0-9_\-+/=]+)/);
    if (perfil) {
      const p = JSON.parse(fromB64(perfil[1]));
      if (!p?.peso || !p?.descanso?.kcal) return null;
      return { app: 'escaner-nutricion', version: 1, fecha: new Date().toISOString(), datos: { 'escaner.perfil.v1': JSON.stringify(p) } };
    }
    // Código suelto (sin enlace)
    const b = JSON.parse(fromB64(t));
    return b?.app === 'escaner-nutricion' && b.datos ? b : null;
  } catch {
    return null;
  }
}

export function describe(b: Backup): ImportSummary {
  return summarize(b);
}

/** Sustituye los datos de este dispositivo por los de la copia. */
export function applyBackup(b: Backup): ImportSummary {
  for (const [k, v] of Object.entries(b.datos)) {
    if (KEYS.includes(k)) {
      try { localStorage.setItem(k, v); } catch { /* almacenamiento lleno */ }
    }
  }
  return summarize(b);
}

export function downloadBackup(): void {
  const blob = new Blob([JSON.stringify(makeBackup(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `escaner-nutricion-copia-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** ¿Se está usando desde el icono de la pantalla de inicio? */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Pide al navegador que no borre los datos por falta de espacio (si lo permite). */
export function askPersistence(): void {
  try {
    navigator.storage?.persist?.().catch(() => undefined);
  } catch { /* no disponible */ }
}
