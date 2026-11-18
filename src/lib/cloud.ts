// Cuenta y sincronización con Firebase. El SDK se descarga solo si se usa la cuenta.
import type { Auth, User } from 'firebase/auth';
import type { Firestore, Unsubscribe } from 'firebase/firestore';
import {
  DIARIO, clearLocal, hash, isDayId, isSyncKey, loadMeta, localChanges, mergeUnit, readUnits, saveMeta, writeUnit, type KV,
} from './syncCore.ts';

// La configuración web de Firebase es pública por diseño: lo que protege los datos son las reglas
// de Firestore (cada cuenta solo puede leer y escribir en usuarios/{su uid}).
const CONFIG = {
  apiKey: 'AIzaSyDW7ScbyvF3IN1DVkjFq3WJmAwfMDoYGuM',
  authDomain: 'escaner-nutricion.firebaseapp.com',
  projectId: 'escaner-nutricion',
  storageBucket: 'escaner-nutricion.firebasestorage.app',
  messagingSenderId: '974652292420',
  appId: '1:974652292420:web:3243b24317d67a77bdab11',
};

export type SyncState = 'fuera' | 'conectando' | 'sincronizando' | 'al-dia' | 'sin-conexion' | 'error';
export interface SyncStatus { state: SyncState; email?: string; last?: number; error?: string }

let status: SyncStatus = { state: 'fuera' };
const listeners = new Set<(s: SyncStatus) => void>();
const setStatus = (s: Partial<SyncStatus>) => {
  status = { ...status, ...s };
  listeners.forEach((l) => l(status));
};
export const getStatus = () => status;
export function onStatus(l: (s: SyncStatus) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ── localStorage sin pasar por el aviso de cambios ──
const proto = Storage.prototype;
const rawSet = proto.setItem;
const rawRemove = proto.removeItem;
const raw: KV = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { rawSet.call(localStorage, k, v); } catch { /* lleno */ } },
  removeItem: (k) => { try { rawRemove.call(localStorage, k); } catch { /* ignorar */ } },
};

let hooked = false;
/** Cada cambio en los datos de la app programa una subida (si hay cuenta). */
function hookStorage() {
  if (hooked) return;
  hooked = true;
  proto.setItem = function (k: string, v: string) {
    rawSet.call(this, k, v);
    if (this === localStorage && isSyncKey(k)) changed(k);
  };
  proto.removeItem = function (k: string) {
    rawRemove.call(this, k);
    if (this === localStorage && isSyncKey(k)) changed(k);
  };
}

let timer: ReturnType<typeof setTimeout> | null = null;
function changed(_k: string) {
  if (!session) return;
  const m = loadMeta(raw);
  const now = Date.now();
  const { changed: c, removed } = localChanges(readUnits(raw), m);
  for (const id of [...c, ...removed]) m.localT[id] ??= now;
  saveMeta(raw, m);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void push(); }, 1200);
}

// ── Firebase (carga diferida) ──
interface Session { uid: string; user: User; db: Firestore; fs: typeof import('firebase/firestore'); unsub: Unsubscribe[]; linked: boolean }
let session: Session | null = null;
let authP: Promise<{ auth: Auth; mod: typeof import('firebase/auth') }> | null = null;

function loadAuth() {
  if (!authP) {
    authP = (async () => {
      const [{ initializeApp, getApps }, mod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const app = getApps()[0] ?? initializeApp(CONFIG);
      const auth = mod.getAuth(app);
      mod.onAuthStateChanged(auth, (u) => { void onUser(u); });
      return { auth, mod };
    })();
  }
  return authP;
}

/** Al abrir la app: si este dispositivo ya estaba enlazado a una cuenta, retoma la sincronización. */
export function initCloud(): void {
  hookStorage();
  window.addEventListener('online', () => { if (session) void (session.linked ? push() : connect()); });
  window.addEventListener('offline', () => { if (session) setStatus({ state: 'sin-conexion' }); });
  const m = loadMeta(raw);
  if (m.uid) {
    setStatus({ state: 'conectando', email: m.email, last: m.last });
    loadAuth().catch(() => setStatus({ state: navigator.onLine ? 'error' : 'sin-conexion', error: navigator.onLine ? 'No se ha podido cargar la sincronización.' : undefined }));
  }
}

const notify = () => window.dispatchEvent(new Event('escaner-sync'));

let seq = 0;
async function onUser(u: User | null) {
  const my = ++seq;
  session?.unsub.forEach((f) => f());
  session = null;
  if (!u) {
    setStatus({ state: 'fuera', email: undefined });
    return;
  }
  setStatus({ state: 'sincronizando', email: u.email ?? undefined, error: undefined });
  try {
    const fs = await import('firebase/firestore');
    const { getApps } = await import('firebase/app');
    if (my !== seq) return; // llegó otro cambio de sesión mientras tanto
    const db = fs.getFirestore(getApps()[0]);
    session = { uid: u.uid, user: u, db, fs, unsub: [], linked: false };
    await connect();
  } catch (e) {
    setStatus({ state: 'error', error: firestoreError(e) });
  }
}

/** Enlaza y escucha. Si falla (por ejemplo, sin conexión), se reintenta al volver internet. */
async function connect() {
  const s = session;
  if (!s || s.linked) return;
  try {
    await link(s.user);
    s.linked = true;
    listen();
    await push();
  } catch (e) {
    setStatus({ state: navigator.onLine ? 'error' : 'sin-conexion', error: firestoreError(e) });
  }
}

const datos = (s: Session) => s.fs.collection(s.db, 'usuarios', s.uid, 'datos');
const dias = (s: Session) => s.fs.collection(s.db, 'usuarios', s.uid, 'diario');
const ref = (s: Session, id: string) => (isDayId(id) ? s.fs.doc(dias(s), id.slice(7)) : s.fs.doc(datos(s), id));

/** Enlaza este dispositivo con la cuenta: la primera vez junta lo que hay aquí con lo de la nube. */
async function link(u: User) {
  const s = session!;
  let m = loadMeta(raw);
  if (m.uid && m.uid !== u.uid) {
    // Otra cuenta en este dispositivo: no se mezclan datos de personas distintas.
    clearLocal(raw);
    m = { uid: null, synced: {}, localT: {} };
  }
  const [a, b] = await Promise.all([s.fs.getDocs(datos(s)), s.fs.getDocs(dias(s))]);
  const remote: Record<string, { v: string; t: number }> = {};
  a.forEach((d) => { remote[d.id] = d.data() as { v: string; t: number }; });
  b.forEach((d) => { remote[`diario/${d.id}`] = d.data() as { v: string; t: number }; });
  const local = readUnits(raw);
  const firstTime = m.uid !== u.uid;

  for (const [id, r] of Object.entries(remote)) {
    const l = local[id];
    const localEdited = l != null && m.synced[id] !== hash(l);
    if (l == null) {
      // Si aquí se borró y aún no se ha subido el borrado, se respeta el borrado.
      if (!firstTime && id in m.localT) continue;
      writeUnit(raw, id, r.v);
    } else if (firstTime) {
      const merged = mergeUnit(id, l, r.v);
      writeUnit(raw, id, merged);
      if (merged !== r.v) m.localT[id] = Date.now();
      else m.synced[id] = hash(r.v);
      continue;
    } else if (localEdited && (m.localT[id] ?? 0) > r.t) {
      continue; // lo de aquí es más nuevo: se sube
    } else {
      writeUnit(raw, id, r.v);
    }
    m.synced[id] = hash(r.v);
    delete m.localT[id];
  }
  // Lo que se borró en otro dispositivo (estaba sincronizado y ya no está en la nube).
  for (const id of Object.keys(m.synced)) {
    if (!(id in remote) && !(id in m.localT)) {
      writeUnit(raw, id, null);
      delete m.synced[id];
    }
  }
  m.uid = u.uid;
  m.email = u.email ?? undefined;
  saveMeta(raw, m);
  notify();
}

/** Sube lo que ha cambiado en este dispositivo. */
async function push() {
  const s = session;
  if (!s || !s.linked) return;
  if (!navigator.onLine) { setStatus({ state: 'sin-conexion' }); return; }
  const m = loadMeta(raw);
  const units = readUnits(raw);
  const { changed: c, removed } = localChanges(units, m);
  if (!c.length && !removed.length) { setStatus({ state: 'al-dia', last: m.last ?? Date.now() }); return; }
  setStatus({ state: 'sincronizando' });
  try {
    const batch = s.fs.writeBatch(s.db);
    const t = Date.now();
    for (const id of c) batch.set(ref(s, id), { v: units[id], t });
    for (const id of removed) batch.delete(ref(s, id));
    await batch.commit();
    const after = loadMeta(raw);
    for (const id of c) { after.synced[id] = hash(units[id]); delete after.localT[id]; }
    for (const id of removed) { delete after.synced[id]; delete after.localT[id]; }
    after.last = Date.now();
    saveMeta(raw, after);
    setStatus({ state: 'al-dia', last: after.last, error: undefined });
    // Si algo cambió mientras se subía, otra vuelta.
    const again = localChanges(readUnits(raw), after);
    if (again.changed.length || again.removed.length) void push();
  } catch (e) {
    setStatus({ state: navigator.onLine ? 'error' : 'sin-conexion', error: firestoreError(e) });
  }
}

/** Cambios hechos en otros dispositivos, en directo. */
function listen() {
  const s = session!;
  const apply = (id: string, data: { v: string; t: number } | null) => {
    const m = loadMeta(raw);
    const local = readUnits(raw)[id];
    if (data) {
      const h = hash(data.v);
      if (m.synced[id] === h) return;
      if (local != null && hash(local) === h) { m.synced[id] = h; delete m.localT[id]; saveMeta(raw, m); return; }
      if (local != null && m.synced[id] !== hash(local) && (m.localT[id] ?? 0) > data.t) return;
      writeUnit(raw, id, data.v);
      m.synced[id] = h;
      delete m.localT[id];
    } else {
      if (m.synced[id] == null) return;
      if (local != null && hash(local) === m.synced[id]) writeUnit(raw, id, null);
      delete m.synced[id];
    }
    saveMeta(raw, m);
    return true;
  };
  const handler = (prefix: string) => (snap: import('firebase/firestore').QuerySnapshot) => {
    let any = false;
    snap.docChanges().forEach((ch) => {
      const id = prefix + ch.doc.id;
      any = (ch.type === 'removed' ? apply(id, null) : apply(id, ch.doc.data() as { v: string; t: number })) || any;
    });
    if (any) notify();
    const m = loadMeta(raw);
    if (status.state !== 'error') setStatus({ state: navigator.onLine ? 'al-dia' : 'sin-conexion', last: m.last });
  };
  const onErr = (e: unknown) => setStatus({ state: 'error', error: firestoreError(e) });
  s.unsub.push(s.fs.onSnapshot(datos(s), { includeMetadataChanges: false }, handler(''), onErr));
  s.unsub.push(s.fs.onSnapshot(dias(s), { includeMetadataChanges: false }, handler('diario/'), onErr));
}

// ── Acciones de la cuenta ──
export async function signIn(email: string, password: string): Promise<void> {
  const { auth, mod } = await loadAuth();
  try { await mod.signInWithEmailAndPassword(auth, email.trim(), password); } catch (e) { throw new Error(authError(e)); }
}
export async function signUp(email: string, password: string): Promise<void> {
  const { auth, mod } = await loadAuth();
  try { await mod.createUserWithEmailAndPassword(auth, email.trim(), password); } catch (e) { throw new Error(authError(e)); }
}
export async function resetPassword(email: string): Promise<void> {
  const { auth, mod } = await loadAuth();
  auth.languageCode = 'es';
  try { await mod.sendPasswordResetEmail(auth, email.trim()); } catch (e) { throw new Error(authError(e)); }
}
/** Cierra la sesión. Los datos se quedan en este dispositivo. */
export async function signOut(): Promise<void> {
  const { auth, mod } = await loadAuth();
  await mod.signOut(auth);
  const m = loadMeta(raw);
  saveMeta(raw, { ...m, localT: {} });
}
export async function syncNow(): Promise<void> {
  if (session) await (session.linked ? push() : connect());
}

const code = (e: unknown) => String((e as { code?: string })?.code ?? '');
function authError(e: unknown): string {
  switch (code(e)) {
    case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use': return 'Ya hay una cuenta con ese correo. Pulsa «Entrar».';
    case 'auth/weak-password': return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/invalid-email': return 'El correo no es válido.';
    case 'auth/missing-password': return 'Escribe la contraseña.';
    case 'auth/too-many-requests': return 'Demasiados intentos. Espera unos minutos.';
    case 'auth/network-request-failed': return 'Sin conexión. Prueba cuando tengas internet.';
    case 'auth/operation-not-allowed': return 'El inicio de sesión con correo no está activado en Firebase.';
    case 'auth/unauthorized-domain': return 'Esta web no está autorizada en Firebase (dominios autorizados).';
    default: return 'No se ha podido completar. Prueba otra vez.';
  }
}
function firestoreError(e: unknown): string {
  const c = code(e);
  if (c === 'permission-denied') return 'Firebase no deja leer o guardar los datos (revisa las reglas).';
  if (c === 'not-found' || c === 'failed-precondition') return 'La base de datos de Firebase no está creada.';
  if (c === 'unavailable') return 'Sin conexión con Firebase. Se sincronizará al volver.';
  return 'No se ha podido sincronizar. Se reintentará.';
}
export { DIARIO };
