// Cuenta y sincronización con Firebase. El SDK se descarga solo si se usa la cuenta.
import type { Auth, User } from 'firebase/auth';
import type { Firestore, Unsubscribe } from 'firebase/firestore';
import {
  DIARIO, META, clearLocal, hash, isDayId, isSyncKey, loadMeta, localChanges, mergeUnit, readUnits, saveMeta, writeUnit, type KV,
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
async function link(u: User, fromServer = false) {
  const s = session!;
  let m = loadMeta(raw);
  if (m.uid && m.uid !== u.uid) {
    // Otra cuenta en este dispositivo: no se mezclan datos de personas distintas.
    clearLocal(raw);
    m = { uid: null, synced: {}, localT: {} };
  }
  // fromServer: se pide al servidor aunque haya copia local (para «Sincronizar ahora»).
  const get = fromServer ? s.fs.getDocsFromServer : s.fs.getDocs;
  const [a, b] = await Promise.all([get(datos(s)), get(dias(s))]);
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
/**
 * Borra de este dispositivo todo lo de la app: datos, estado de sincronización, el ajuste de «hoy» y
 * las búsquedas de Open Food Facts guardadas para usar sin conexión (dicen qué productos has mirado).
 */
async function wipeDevice(): Promise<void> {
  clearLocal(raw);
  raw.removeItem(META);
  raw.removeItem('escaner.hoy.v1');
  try { sessionStorage.removeItem('escaner.perfil.seccion'); } catch { /* ignorar */ }
  try { await caches.delete('off-api-v1'); } catch { /* sin caché */ }
}

/**
 * Cierra la sesión. Sin wipeLocal, los datos se quedan en este dispositivo (sin sincronizar); con
 * wipeLocal se borran también de aquí (para un ordenador o móvil prestado).
 */
export async function signOut(wipeLocal = false): Promise<void> {
  const { auth, mod } = await loadAuth();
  // Se deja de escuchar antes: si no, un cambio que llegue mientras tanto volvería a escribir datos.
  session?.unsub.forEach((f) => f());
  session = null;
  if (timer) clearTimeout(timer);
  await mod.signOut(auth);
  if (wipeLocal) {
    await wipeDevice();
  } else {
    const m = loadMeta(raw);
    saveMeta(raw, { ...m, localT: {} });
  }
}

/**
 * Borra la cuenta y todo lo que hay en la nube (derecho de supresión). Firebase pide haber entrado
 * hace poco para borrar una cuenta, por eso se vuelve a pedir la contraseña.
 * Con wipeLocal también se borran los datos de este dispositivo; si no, se quedan aquí sin cuenta.
 */
export async function deleteAccount(password: string, wipeLocal: boolean): Promise<void> {
  const { auth, mod } = await loadAuth();
  const u = auth.currentUser;
  if (!u?.email) throw new Error('No hay ninguna sesión iniciada.');
  try {
    await mod.reauthenticateWithCredential(u, mod.EmailAuthProvider.credential(u.email, password));
  } catch (e) {
    throw new Error(authError(e));
  }
  const fs = await import('firebase/firestore');
  const { getApps } = await import('firebase/app');
  const db = fs.getFirestore(getApps()[0]);
  // Se deja de escuchar antes de borrar: si no, los borrados de la nube vaciarían este dispositivo.
  session?.unsub.forEach((f) => f());
  session = null;
  if (timer) clearTimeout(timer);
  try {
    for (const col of ['datos', 'diario']) {
      const snap = await fs.getDocs(fs.collection(db, 'usuarios', u.uid, col));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = fs.writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
  } catch (e) {
    throw new Error(`No se han podido borrar los datos de la nube: ${firestoreError(e)} La cuenta no se ha borrado; prueba otra vez.`);
  }
  try {
    await mod.deleteUser(u);
  } catch (e) {
    throw new Error(`Los datos de la nube están borrados, pero la cuenta no: ${authError(e)}`);
  }
  if (wipeLocal) await wipeDevice();
  else saveMeta(raw, { uid: null, synced: {}, localT: {} });
  setStatus({ state: 'fuera', email: undefined, last: undefined, error: undefined });
  notify();
}

/**
 * «Sincronizar ahora»: siempre consulta la nube (trae lo cambiado en otros dispositivos), sube lo
 * pendiente y actualiza la hora. Si algo falla, lanza el error para enseñarlo.
 */
export async function syncNow(): Promise<void> {
  if (!navigator.onLine) throw new Error('Sin conexión. Se sincronizará cuando vuelva internet.');
  if (!session) {
    if (!loadMeta(raw).uid) throw new Error('No has iniciado sesión.');
    // La cuenta aún se está cargando: se espera un poco a que esté lista.
    await loadAuth();
    for (let i = 0; i < 40 && !session; i++) await new Promise((r) => setTimeout(r, 200));
    if (!session) throw new Error('No se ha podido conectar con tu cuenta. Prueba otra vez en unos segundos.');
  }
  const s = session;
  setStatus({ state: 'sincronizando', error: undefined });
  try {
    await link(s.user, true);
    if (!s.linked) { s.linked = true; listen(); }
  } catch (e) {
    const error = firestoreError(e);
    setStatus({ state: navigator.onLine ? 'error' : 'sin-conexion', error });
    throw new Error(error);
  }
  await push();
  if (getStatus().state === 'error') throw new Error(getStatus().error ?? 'No se ha podido sincronizar.');
  const m = loadMeta(raw);
  m.last = Date.now();
  saveMeta(raw, m);
  setStatus({ state: 'al-dia', last: m.last, error: undefined });
}

const code = (e: unknown) => String((e as { code?: string })?.code ?? '');
function authError(e: unknown): string {
  switch (code(e)) {
    case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use': return 'Ya hay una cuenta con ese correo. Pulsa «Entrar».';
    case 'auth/weak-password': return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/invalid-email': return 'El correo no es válido.';
    case 'auth/missing-password': return 'Escribe la contraseña.';
    case 'auth/requires-recent-login': return 'Por seguridad, cierra sesión, vuelve a entrar y repite.';
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
