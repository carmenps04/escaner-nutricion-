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

/**
 * Copia cifrada: los datos van cifrados con AES-GCM (256 bits) y una clave sacada de la contraseña
 * con PBKDF2-SHA256 (600 000 vueltas, lo que recomienda OWASP). Sin la contraseña no se puede leer;
 * si se olvida, la copia no se puede recuperar. Todo se hace en el navegador (WebCrypto).
 */
export interface Encrypted {
  app: 'escaner-nutricion';
  version: 2;
  fecha: string;
  cifrado: { kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; data: string };
}

export const isEncrypted = (b: Backup | Encrypted): b is Encrypted => 'cifrado' in b;
export const MIN_PASS = 8;
const ITER = 600_000;

const bytesToB64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64ToBytes = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function deriveKey(pass: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(b: Backup, pass: string): Promise<Encrypted> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, ITER);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(b))));
  return { app: 'escaner-nutricion', version: 2, fecha: b.fecha, cifrado: { kdf: 'PBKDF2-SHA256', iter: ITER, salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(data) } };
}

/** Descifra una copia; null si la contraseña no es la correcta (o la copia está dañada). */
export async function decryptBackup(e: Encrypted, pass: string): Promise<Backup | null> {
  try {
    const c = e.cifrado;
    // Tope de vueltas: una copia manipulada no puede dejar el móvil colgado.
    if (!(c.iter >= 100_000 && c.iter <= 5_000_000)) return null;
    const key = await deriveKey(pass, b64ToBytes(c.salt), c.iter);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(c.iv) }, key, b64ToBytes(c.data));
    const b = JSON.parse(new TextDecoder().decode(plain));
    return b?.app === 'escaner-nutricion' && b.datos ? b : null;
  } catch {
    return null;
  }
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

/**
 * Enlace con todos los datos, cifrados con la contraseña, tras «#datos=». Lo que va tras «#» no se
 * envía a ningún servidor al abrirlo, pero el enlace queda guardado donde se pegue: por eso va cifrado.
 */
export async function backupLink(pass: string): Promise<string> {
  return `${location.origin}${location.pathname}#datos=${toB64(JSON.stringify(await encryptBackup(makeBackup(), pass)))}`;
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
const asBackup = (b: any): Backup | Encrypted | null => {
  if (b?.app !== 'escaner-nutricion') return null;
  if (b.cifrado && typeof b.cifrado.data === 'string' && typeof b.cifrado.salt === 'string' && typeof b.cifrado.iv === 'string') return b as Encrypted;
  return b.datos && typeof b.datos === 'object' ? (b as Backup) : null;
};

export function parseBackup(text: string): Backup | Encrypted | null {
  const t = text.trim();
  if (!t) return null;
  try {
    if (t.startsWith('{')) return asBackup(JSON.parse(t));
    const datos = t.match(/datos=([A-Za-z0-9_\-+/=]+)/);
    if (datos) return asBackup(JSON.parse(fromB64(datos[1])));
    const perfil = t.match(/perfil=([A-Za-z0-9_\-+/=]+)/);
    if (perfil) {
      const p = JSON.parse(fromB64(perfil[1]));
      if (!p?.peso || !p?.descanso?.kcal) return null;
      return { app: 'escaner-nutricion', version: 1, fecha: new Date().toISOString(), datos: { 'escaner.perfil.v1': JSON.stringify(p) } };
    }
    // Código suelto (sin enlace)
    return asBackup(JSON.parse(fromB64(t)));
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
    // Solo las claves de la app y solo texto: una copia manipulada no puede escribir otra cosa.
    if (KEYS.includes(k) && typeof v === 'string') {
      try { localStorage.setItem(k, v); } catch { /* almacenamiento lleno */ }
    }
  }
  return summarize(b);
}

export async function downloadBackup(pass: string): Promise<void> {
  const blob = new Blob([JSON.stringify(await encryptBackup(makeBackup(), pass), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `escaner-nutricion-copia-cifrada-${new Date().toISOString().slice(0, 10)}.json`;
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
