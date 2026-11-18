const err = (code) => Object.assign(new Error(code), { code });
async function req(path, body) {
  if (!navigator.onLine) throw err('unavailable');
  const r = await fetch('/fake-db/' + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (j.error) throw err(j.error);
  return j;
}
const uid = () => JSON.parse(localStorage.getItem('fake.user') || 'null')?.uid;
export function getFirestore() { return {}; }
export function collection(_db, ...p) { return { path: p.join('/') }; }
export function doc(coll, id) { return { path: coll.path + '/' + id, id }; }
const snap = (list) => ({ forEach: (f) => list.forEach((d) => f({ id: d.id, data: () => d.data })) });
export async function getDocs(coll) { return snap((await req('list?path=' + encodeURIComponent(coll.path) + '&uid=' + uid())).docs); }
export function writeBatch() {
  const ops = [];
  return {
    set: (ref, data) => ops.push({ op: 'set', path: ref.path, data }),
    delete: (ref) => ops.push({ op: 'delete', path: ref.path }),
    commit: () => req('commit?uid=' + uid(), { ops }),
  };
}
export function onSnapshot(coll, _opts, next, onErr) {
  let prev = null, stop = false;
  const tick = async () => {
    if (stop) return;
    try {
      if (navigator.onLine) {
        const { docs } = await req('list?path=' + encodeURIComponent(coll.path) + '&uid=' + uid());
        const cur = new Map(docs.map((d) => [d.id, d.data]));
        const changes = [];
        for (const [id, data] of cur) {
          const p = prev?.get(id);
          if (!prev || !p) changes.push({ type: 'added', doc: { id, data: () => data } });
          else if (JSON.stringify(p) !== JSON.stringify(data)) changes.push({ type: 'modified', doc: { id, data: () => data } });
        }
        if (prev) for (const [id, data] of prev) if (!cur.has(id)) changes.push({ type: 'removed', doc: { id, data: () => data } });
        prev = cur;
        if (changes.length || !window.__firstSnap) next({ metadata: { hasPendingWrites: false }, docChanges: () => changes });
      }
    } catch (e) { onErr?.(e); }
    setTimeout(tick, 400);
  };
  tick();
  return () => { stop = true; };
}
