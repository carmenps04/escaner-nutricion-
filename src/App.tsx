import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initCloud } from './lib/cloud.ts';
import { Barcode, Camera, History as HistoryIcon, Keyboard, Loader2, NotebookPen, PenLine, ScanLine, Trash2, User, WifiOff, Image as ImageIcon } from 'lucide-react';
import Scanner, { decodeBarcodePhoto } from './components/Scanner.tsx';
import ProductForm from './components/ProductForm.tsx';
import ResultView from './components/ResultView.tsx';
import ProfilePage from './components/ProfilePage.tsx';
import { EMPTY_NUTRIENTS, type Product } from './lib/types.ts';
import { hasProfile, importFromHash, loadProfile, type Profile } from './lib/profile.ts';
import { lookupBarcode } from './lib/off.ts';
import { parseLabel } from './lib/parseLabel.ts';
import { readImage, statusText } from './lib/ocr.ts';
import { addToHistory, getCustom, loadHistory, removeFromHistory, saveCustom } from './lib/storage.ts';
import { evaluate, VERDICT_TEXT } from './lib/evaluate.ts';
import { today } from './lib/training.ts';
import { askPersistence } from './lib/backup.ts';
import TodayChip from './components/TodayChip.tsx';
import DiaryPage from './components/DiaryPage.tsx';
import CompareView from './components/CompareView.tsx';

type View =
  | { name: 'scan' }
  | { name: 'camera' }
  | { name: 'form'; product: Product; ocrText?: string; note?: string }
  | { name: 'result'; product: Product }
  | { name: 'compare'; a: Product; b: Product }
  | { name: 'diary' }
  | { name: 'history' }
  | { name: 'profile' };

const blank = (code?: string): Product => ({ code, name: '', n: { ...EMPTY_NUTRIENTS }, liquid: false, source: 'manual' });

export default function App() {
  const [view, setView] = useState<View>({ name: 'scan' });
  const [profile, setProfile] = useState<Profile>(() => {
    importFromHash();
    return loadProfile();
  });
  const [configured, setConfigured] = useState(hasProfile);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [histVersion, setHistVersion] = useState(0);
  const [todayVersion, setTodayVersion] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  // Cuenta: retoma la sincronización y repinta cuando llegan datos de otro dispositivo.
  useEffect(() => {
    initCloud();
    const onSync = () => {
      setProfile(loadProfile());
      setConfigured(hasProfile());
      setHistVersion((v) => v + 1);
      setSyncVersion((v) => v + 1);
    };
    window.addEventListener('escaner-sync', onSync);
    return () => window.removeEventListener('escaner-sync', onSync);
  }, []);
  const [histSort, setHistSort] = useState<'recent' | 'score'>(() => (localStorage.getItem('escaner.orden') === 'score' ? 'score' : 'recent'));
  useEffect(() => {
    try { localStorage.setItem('escaner.orden', histSort); } catch { /* ignorar */ }
  }, [histSort]);
  const labelInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const pendingCode = useRef<string | undefined>(undefined);
  const main = useRef<HTMLElement>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  }, []);

  // Si la app ya está abierta y se abre el enlace #perfil=…, el navegador no recarga la página:
  // solo cambia el «#». Por eso también se escucha ese cambio.
  useEffect(() => {
    const onHash = () => {
      // «#datos=…»: todos los datos; se piden confirmar en el perfil antes de sustituir nada.
      const m = location.hash.match(/datos=[A-Za-z0-9_\-+/=]+/);
      if (m) {
        setPendingImport(m[0]);
        history.replaceState(null, '', location.pathname + location.search);
        setView({ name: 'profile' });
        return;
      }
      if (importFromHash()) {
        setProfile(loadProfile());
        setConfigured(true);
        setView({ name: 'profile' });
        toast('Perfil cargado');
      }
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [toast]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => askPersistence(), []);

  // Cada pantalla empieza arriba del todo.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.name]);

  const showResult = (p: Product) => {
    addToHistory(p);
    setHistVersion((v) => v + 1);
    setView({ name: 'result', product: p });
  };

  const handleCode = useCallback(async (code: string) => {
    setView({ name: 'scan' });
    const custom = getCustom(code);
    if (custom) return showResult(custom);
    setBusy(`Buscando ${code}…`);
    const r = await lookupBarcode(code);
    setBusy(null);
    if (r.status === 'ok') {
      if (r.incomplete) {
        pendingCode.current = code;
        setView({ name: 'form', product: r.product, note: 'Open Food Facts no tiene todos los valores de este producto. Complétalos o haz una foto de la tabla nutricional.' });
      } else showResult(r.product);
    } else if (r.status === 'not-found') {
      pendingCode.current = code;
      setView({ name: 'form', product: blank(code), note: `El código ${code} no está en Open Food Facts. Haz una foto de la tabla nutricional o escribe los valores; se guardará para la próxima vez.` });
    } else {
      // Sin conexión: si el producto ya se escaneó antes, se valora con los datos guardados.
      const known = loadHistory().find((h) => h.product.code === code)?.product;
      if (known) {
        toast('Sin conexión: uso los datos que guardé la última vez');
        showResult(known);
      } else {
        pendingCode.current = code;
        setView({ name: 'form', product: blank(code), note: `Sin conexión no puedo buscar el código ${code}. Haz una foto de la etiqueta (funciona sin internet una vez usada) o escribe los valores.` });
      }
    }
  }, [toast]);

  const readLabel = async (file: File) => {
    setBusy('Preparando el lector…');
    try {
      const progress = (p: { status: string; progress: number }) => setBusy(`${statusText(p.status)} ${Math.round(p.progress * 100)} %`);
      // Primero lectura por filas; si faltan datos, segunda lectura en modo disperso y se completan huecos.
      let [text] = await readImage(file, progress, ['6']);
      let { n, liquid, found, kcalEstimated } = parseLabel(text);
      if (found < 8) {
        const [text2] = await readImage(file, progress, ['11']);
        const r2 = parseLabel(text2);
        n = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v ?? r2.n[k as keyof typeof n]])) as typeof n;
        liquid = liquid || r2.liquid;
        kcalEstimated = kcalEstimated && r2.kcalEstimated;
        found = Object.values(n).filter((v) => v != null).length;
        text = `${text}\n--- segunda lectura ---\n${text2}`;
      }
      const base = view.name === 'form' ? view.product : blank(pendingCode.current);
      const filled = Object.fromEntries(Object.entries(n).filter(([, v]) => v != null));
      const merged: Product = {
        ...base,
        liquid: base.source === 'openfoodfacts' ? base.liquid : liquid,
        n: { ...base.n, ...filled },
        source: base.source === 'openfoodfacts' ? 'openfoodfacts' : 'foto',
      };
      setView({
        name: 'form',
        product: merged,
        ocrText: text,
        note: (found >= 5 ? 'Revisa que los números coinciden con la etiqueta antes de valorar.' : `Solo he podido leer ${found} valores. Completa el resto mirando la etiqueta, o repite la foto más cerca y con buena luz.`)
          + (kcalEstimated ? ' Las kcal no se leían bien y las he calculado a partir de los macros.' : ''),
      });
    } catch {
      toast('No se ha podido leer la foto');
    } finally {
      setBusy(null);
    }
  };

  const barcodePhoto = async (file: File) => {
    setBusy('Buscando el código en la foto…');
    const code = await decodeBarcodePhoto(file);
    setBusy(null);
    if (code) handleCode(code);
    else toast('No encuentro un código de barras en la foto. Prueba más cerca y recto.');
  };

  const askCode = () => {
    const c = prompt('Número del código de barras (8 o 13 cifras)');
    const code = c?.replace(/\D/g, '');
    if (code && code.length >= 8) handleCode(code);
    else if (c != null) toast('El código debe tener al menos 8 cifras');
  };

  const submitForm = (p: Product) => {
    if (p.code) saveCustom(p);
    pendingCode.current = undefined;
    showResult(p);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hoy = useMemo(() => today(profile), [profile, todayVersion, view.name]);
  const refreshToday = () => setTodayVersion((v) => v + 1);

  const tab = view.name === 'history' || view.name === 'profile' || view.name === 'diary' ? view.name : 'scan';
  const go = (name: 'scan' | 'diary' | 'history' | 'profile') => setView({ name } as View);

  return (
    <div className="app">
      <nav className="nav" aria-label="Secciones">
        <div className="nav-brand"><img src="./favicon.svg" alt="" />Escáner nutricional</div>
        <button className={`nav-item ${tab === 'scan' ? 'on' : ''}`} onClick={() => go('scan')}><Barcode size={22} />Escanear</button>
        <button className={`nav-item ${tab === 'diary' ? 'on' : ''}`} onClick={() => go('diary')}><NotebookPen size={22} />Diario</button>
        <button className={`nav-item ${tab === 'history' ? 'on' : ''}`} onClick={() => go('history')}><HistoryIcon size={22} />Historial</button>
        <button className={`nav-item ${tab === 'profile' ? 'on' : ''}`} onClick={() => go('profile')}><User size={22} />Perfil</button>
        <div className="nav-foot">Versión {__APP_VERSION__}</div>
      </nav>

      <main ref={main}>
        {!online && view.name !== 'camera' && (
          <div className="offline"><WifiOff size={15} /> Sin conexión: puedes valorar productos ya escaneados, fotos de etiquetas y valores a mano.</div>
        )}
        {view.name === 'scan' && (
          <div className="page narrow">
            <header className="page-head">
              <div>
                <h1>Escanear</h1>
                <p>Escanea un producto y te digo si encaja en tu plan.</p>
              </div>
            </header>
            {configured && <TodayChip hoy={hoy} onChange={refreshToday} />}
            {!configured && (
              <button className="setup" onClick={() => go('profile')}>
                <strong>Primero, configura tu perfil</strong>
                <span>Haz una foto a la hoja de tu dietista para cargar tus calorías y macros. Hasta entonces se usan valores de ejemplo.</span>
              </button>
            )}
            <div className="col">
              <button className="scan-main" onClick={() => setView({ name: 'camera' })} disabled={!!busy}>
                <ScanLine size={42} />
                <strong>Escanear código de barras</strong>
                <span>Con la cámara</span>
              </button>
              <div className="tiles">
                <button className="tile" onClick={() => { pendingCode.current = undefined; labelInput.current?.click(); }} disabled={!!busy}>
                  <Camera size={22} /> Foto de la etiqueta
                </button>
                <button className="tile" onClick={() => codeInput.current?.click()} disabled={!!busy}>
                  <ImageIcon size={22} /> Foto del código
                </button>
                <button className="tile" onClick={askCode} disabled={!!busy}>
                  <Keyboard size={22} /> Escribir código
                </button>
                <button className="tile" onClick={() => setView({ name: 'form', product: blank() })} disabled={!!busy}>
                  <PenLine size={22} /> Valores a mano
                </button>
              </div>
              {busy && <p className="busy"><Loader2 className="spin" size={18} /> {busy}</p>}
            </div>
          </div>
        )}

        {view.name === 'camera' && <Scanner onCode={handleCode} onClose={() => go('scan')} />}

        {view.name === 'form' && (
          <>
            {busy && <p className="busy floating"><Loader2 className="spin" size={18} /> {busy}</p>}
            <ProductForm
              key={JSON.stringify(view.product) + (view.ocrText ?? '')}
              initial={view.product}
              ocrText={view.ocrText}
              note={view.note}
              busy={!!busy}
              onPhoto={() => labelInput.current?.click()}
              onSubmit={submitForm}
              onCancel={() => go('scan')}
            />
          </>
        )}

        {view.name === 'result' && (
          <ResultView
            product={view.product}
            profile={profile}
            configured={configured}
            hoy={hoy}
            onTodayChange={refreshToday}
            onOpen={(p) => showResult(p)}
            onCompare={(b) => setView({ name: 'compare', a: view.product, b })}
            onEdit={() => setView({ name: 'form', product: view.product })}
            onBack={() => go('scan')}
          />
        )}

        {view.name === 'compare' && (
          <CompareView a={view.a} b={view.b} profile={profile} hoy={hoy} onOpen={(p) => showResult(p)} onBack={() => setView({ name: 'result', product: view.a })} />
        )}

        {view.name === 'diary' && (
          <DiaryPage profile={profile} hoy={hoy} onOpen={(p) => setView({ name: 'result', product: p })} toast={toast} />
        )}

        {view.name === 'history' && (
          <div className="page narrow">
            <header className="page-head">
              <div>
                <h1>Historial</h1>
                <p>Valorados con tu perfil actual.</p>
              </div>
            </header>
            <div className="seg" role="radiogroup" aria-label="Ordenar">
              <button className={histSort === 'recent' ? 'on' : ''} onClick={() => setHistSort('recent')}>Más recientes</button>
              <button className={histSort === 'score' ? 'on' : ''} onClick={() => setHistSort('score')}>Mejor valorados</button>
            </div>
            <section className="card">
              <RecentList key={histVersion} sort={histSort} onOpen={(p) => setView({ name: 'result', product: p })} profile={profile} deletable />
            </section>
          </div>
        )}

        {view.name === 'profile' && (
          <ProfilePage
            key={JSON.stringify(profile)}
            syncVersion={syncVersion}
            profile={profile}
            configured={configured}
            toast={toast}
            pendingImport={pendingImport}
            onPendingDone={() => setPendingImport(null)}
            onSaved={(p) => { setProfile(p); setConfigured(true); }}
          />
        )}
      </main>

      <input ref={labelInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readLabel(f); e.target.value = ''; }} />
      <input ref={codeInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) barcodePhoto(f); e.target.value = ''; }} />

      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}

function RecentList({ onOpen, profile, sort, deletable }: { onOpen: (p: Product) => void; profile: Profile; sort: 'recent' | 'score'; deletable?: boolean }) {
  const [items, setItems] = useState(loadHistory);
  // El historial se guarda del más reciente al más antiguo; por valoración se ordena por puntuación
  // (y a igual puntuación, el más reciente primero).
  const list = useMemo(() => {
    const rows = items.map((h, i) => ({ ...h, i, e: evaluate(h.product, profile) }));
    if (sort === 'score') rows.sort((a, b) => b.e.score - a.e.score || a.i - b.i);
    return rows;
  }, [items, profile, sort]);
  if (!list.length) return <p className="empty">Aún no has escaneado ningún producto.</p>;
  return (
    <div className="list">
      {list.map(({ product, date, e }) => (
        <div key={(product.code ?? '') + product.name} className="list-item">
          <button onClick={() => onOpen(product)}>
            <span className={`dot v-${e.verdict}`} />
            <span className="list-name">
              {product.name}
              <small>{[product.brand, sort === 'score' ? `${e.score}/100` : new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</small>
            </span>
            <span className={`pill v-${e.verdict}`}>{VERDICT_TEXT[e.verdict]}</span>
          </button>
          {deletable && (
            <button className="icon-btn" aria-label={`Borrar ${product.name}`} onClick={() => { removeFromHistory(product); setItems(loadHistory()); }}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
