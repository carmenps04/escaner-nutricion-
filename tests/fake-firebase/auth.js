const cbs = [];
const auth = { languageCode: null, currentUser: null };
const err = (code) => Object.assign(new Error(code), { code });
async function call(body) {
  const r = await fetch('/fake-db/auth', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) throw err(j.error);
  return j;
}
function setUser(u) {
  auth.currentUser = u;
  if (u) localStorage.setItem('fake.user', JSON.stringify(u)); else localStorage.removeItem('fake.user');
  cbs.forEach((cb) => cb(u));
}
export function getAuth() { return auth; }
export function onAuthStateChanged(_a, cb) {
  cbs.push(cb);
  const u = JSON.parse(localStorage.getItem('fake.user') || 'null');
  auth.currentUser = u;
  setTimeout(() => cb(auth.currentUser), 10);
  return () => {};
}
export async function signInWithEmailAndPassword(_a, email, password) { const u = await call({ mode: 'in', email, password }); setUser(u); return { user: u }; }
export async function createUserWithEmailAndPassword(_a, email, password) { const u = await call({ mode: 'up', email, password }); setUser(u); return { user: u }; }
export async function sendPasswordResetEmail() {}
export async function signOut() { setUser(null); }
