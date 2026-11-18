import { useCallback, useRef, useState } from 'react';
import { Barcode, Camera, History as HistoryIcon, Keyboard, Loader2, PenLine, ScanLine, Trash2, User, Image as ImageIcon } from 'lucide-react';
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

type View =
  | { name: 'scan' }
  | { name: 'camera' }
  | { name: 'form'; product: Product; ocrText?: string; note?: string }
  | { name: 'result'; product: Product }
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
  const labelInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const pendingCode = useRef<string | undefined>(undefined);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  }, []);

  const showResult = (p: Product) => {
    addToHistory(p);
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
    } else toast(r.message);
  }, []);

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
      const merged: Product = { ...base, liquid: base.source === 'openfoodfacts' ? base.liquid : liquid, n: { ...base.n, ...Object.fromEntries(Object.entries(n).filter(([, v]) => v != null)) }, source: base.source === 'openfoodfacts' ? 'openfoodfacts' : 'foto' };
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
  };

  const submitForm = (p: Product) => {
    if (p.code) saveCustom(p);
    pendingCode.current = undefined;
    showResult(p);
  };

  const tab = view.name === 'history' ? 'history' : view.name === 'profile' ? 'profile' : 'scan';

  return (
    <div className="app">
      <main>
        {view.name === 'scan' && (
          <div className="page">
            <h1>Escanear</h1>
            {!configured && (
              <button className="setup" onClick={() => setView({ name: 'profile' })}>
                <strong>Primero, tu perfil</strong>
                <span>Haz una foto a la hoja de tu dietista para cargar tus calorías y macros. Sin eso, la valoración usa valores de ejemplo.</span>
              </button>
            )}
            <button className="scan-main" onClick={() => setView({ name: 'camera' })} disabled={!!busy}>
              <ScanLine size={44} />
              <strong>Escanear código de barras</strong>
              <span>Con la cámara</span>
            </button>
            <div className="grid">
              <button className="tile" onClick={() => { pendingCode.current = undefined; labelInput.current?.click(); }} disabled={!!busy}>
                <Camera size={24} /> Foto de la tabla nutricional
              </button>
              <button className="tile" onClick={() => codeInput.current?.click()} disabled={!!busy}>
                <ImageIcon size={24} /> Foto del código de barras
              </button>
              <button className="tile" onClick={askCode} disabled={!!busy}>
                <Keyboard size={24} /> Escribir el código
              </button>
              <button className="tile" onClick={() => setView({ name: 'form', product: blank() })} disabled={!!busy}>
                <PenLine size={24} /> Valores a mano
              </button>
            </div>
            {busy && <p className="busy"><Loader2 className="spin" size={18} /> {busy}</p>}
            <RecentList onOpen={(p) => setView({ name: 'result', product: p })} profile={profile} limit={4} />
          </div>
        )}

        {view.name === 'camera' && <Scanner onCode={handleCode} onClose={() => setView({ name: 'scan' })} />}

        {view.name === 'form' && (
          <>
            {busy && <p className="busy floating"><Loader2 className="spin" size={18} /> {busy}</p>}
            <ProductForm
              key={JSON.stringify(view.product) + (view.ocrText ?? '')}
              initial={view.product}
              ocrText={view.ocrText}
              note={view.note}
              onSubmit={submitForm}
              onCancel={() => setView({ name: 'scan' })}
            />
            {!view.ocrText && (
              <div className="page tight">
                <button className="btn ghost wide" onClick={() => labelInput.current?.click()} disabled={!!busy}>
                  <Camera size={18} /> Rellenar con una foto de la tabla nutricional
                </button>
              </div>
            )}
          </>
        )}

        {view.name === 'result' && (
          <ResultView
            product={view.product}
            profile={profile}
            onEdit={() => setView({ name: 'form', product: view.product })}
            onBack={() => setView({ name: 'scan' })}
          />
        )}

        {view.name === 'history' && (
          <div className="page">
            <h1>Historial</h1>
            <RecentList onOpen={(p) => setView({ name: 'result', product: p })} profile={profile} deletable />
          </div>
        )}

        {view.name === 'profile' && (
          <ProfilePage
            profile={profile}
            toast={toast}
            onSaved={(p) => { setProfile(p); setConfigured(true); }}
          />
        )}
      </main>

      <input ref={labelInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readLabel(f); e.target.value = ''; }} />
      <input ref={codeInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) barcodePhoto(f); e.target.value = ''; }} />

      {msg && <div className="toast">{msg}</div>}

      {view.name !== 'camera' && (
        <nav className="tabs">
          <button className={tab === 'scan' ? 'on' : ''} onClick={() => setView({ name: 'scan' })}><Barcode size={22} />Escanear</button>
          <button className={tab === 'history' ? 'on' : ''} onClick={() => setView({ name: 'history' })}><HistoryIcon size={22} />Historial</button>
          <button className={tab === 'profile' ? 'on' : ''} onClick={() => setView({ name: 'profile' })}><User size={22} />Perfil</button>
        </nav>
      )}
    </div>
  );
}

function RecentList({ onOpen, profile, limit, deletable }: { onOpen: (p: Product) => void; profile: Profile; limit?: number; deletable?: boolean }) {
  const [items, setItems] = useState(loadHistory);
  const list = limit ? items.slice(0, limit) : items;
  if (!list.length) return deletable ? <p className="muted">Aún no has escaneado nada.</p> : null;
  return (
    <div className="recent">
      {limit && <h2 className="section">Últimos productos</h2>}
      {list.map(({ product }) => {
        const v = evaluate(product, profile).verdict;
        return (
          <div key={(product.code ?? '') + product.name} className="recent-item">
            <button onClick={() => onOpen(product)}>
              <span className={`dot v-${v}`} />
              <span className="recent-name">{product.name}<small>{product.brand}</small></span>
              <span className={`pill v-${v}`}>{VERDICT_TEXT[v]}</span>
            </button>
            {deletable && (
              <button className="icon" aria-label="Borrar" onClick={() => { removeFromHistory(product); setItems(loadHistory()); }}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
