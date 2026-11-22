import { useEffect, useState } from 'react';
import { ArrowRight, Check, ClipboardCopy, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { APP_URL, backupLink, hasLocalData, KEYS } from '../lib/backup.ts';
import { loadMeta, META } from '../lib/syncCore.ts';
import { copyLink, ExportForm } from './DataCard.tsx';

/**
 * Lo que se ve en la dirección antigua (carmenps04.github.io/escaner-nutricion-/) tras la mudanza a
 * su propia dirección. Esa dirección la comparten todas las webs de carmenps04.github.io, que pueden
 * leer lo que se guarda en ella: por eso se ayuda a llevarse los datos y a borrarlos de aquí.
 */
export default function Mudanza() {
  const [hasData, setHasData] = useState(hasLocalData);
  const meta = loadMeta(localStorage);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState<null | 'copy' | 'wipe'>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiped, setWiped] = useState(false);

  // Los enlaces antiguos con datos (#datos=…, #perfil=…) se llevan tal cual a la nueva dirección.
  // Lo que va tras «#» no se envía a ningún servidor.
  useEffect(() => {
    if (/(?:datos|perfil)=/.test(location.hash)) location.replace(APP_URL + location.hash);
  }, []);

  const copy = async (pass: string) => {
    setBusy('copy');
    const r = await copyLink(backupLink(pass, APP_URL));
    setBusy(null);
    setExporting(false);
    setCopied(r.copied ? '' : r.link);
  };

  const wipe = async () => {
    setBusy('wipe');
    try {
      if (meta.uid) {
        // Con cuenta: se cierra la sesión (borra solo la de esta app) y se borran los datos.
        const { signOut } = await import('../lib/cloud.ts');
        await signOut(true);
      }
      for (const k of [...KEYS, META, 'escaner.hoy.v1']) localStorage.removeItem(k);
      for (const k of await caches.keys()) if (/^(shell-|ocr-|off-api-)/.test(k)) await caches.delete(k);
    } catch { /* lo que no se pueda borrar no impide seguir */ }
    await unregisterOldWorker();
    setBusy(null);
    setConfirmWipe(false);
    setHasData(hasLocalData());
    setWiped(true);
  };

  return (
    <main className="mudanza">
      <div className="page narrow">
        <header className="page-head">
          <div>
            <h1>La app se ha mudado</h1>
            <p>El escáner nutricional tiene ahora su propia dirección, más segura.</p>
          </div>
        </header>

        <section className="card">
          <a className="btn primary wide" href={APP_URL}>Abrir {APP_URL.replace('https://', '').replace(/\/$/, '')} <ArrowRight size={16} /></a>
          <p className="small muted">Si la tenías en la pantalla de inicio, quita el icono antiguo y añade el nuevo: abre la nueva dirección en Safari, pulsa Compartir y «Añadir a pantalla de inicio».</p>
        </section>

        {hasData && (
          <section className="card">
            <h2 className="card-title">Tus datos de esta dirección</h2>
            {meta.uid ? (
              <p>Tienes cuenta{meta.email ? <> (<b>{meta.email}</b>)</> : null}: entra en la nueva dirección con tu correo y contraseña y aparecerán tus datos.</p>
            ) : (
              <>
                <p>No tienes cuenta, así que tus datos solo están en este navegador. Para llevártelos, cópialos cifrados y abre el enlace en la nueva dirección.</p>
                {exporting ? (
                  <ExportForm kind="copy" busy={busy === 'copy'} onCancel={() => setExporting(false)} onSubmit={copy} />
                ) : copied === null ? (
                  <button className="btn ghost" onClick={() => setExporting(true)}><ClipboardCopy size={16} /> Copiar mis datos cifrados</button>
                ) : copied === '' ? (
                  <p className="note"><Check size={14} style={{ verticalAlign: '-2px' }} /> Copiado. Pega el enlace en el navegador (o en la app nueva: Perfil → Datos → Pegar datos) y escribe la contraseña.</p>
                ) : (
                  <label className="field"><span>No se ha podido copiar solo: copia este enlace</span><textarea rows={3} readOnly value={copied} onFocus={(e) => e.target.select()} /></label>
                )}
              </>
            )}

            <p className="small muted"><ShieldCheck size={13} style={{ verticalAlign: '-2px' }} /> Esta dirección la comparten otras webs de carmenps04.github.io. Cuando tengas tus datos en la nueva, bórralos de aquí.</p>
            {!confirmWipe ? (
              <button className="link danger-link" onClick={() => setConfirmWipe(true)}><Trash2 size={14} style={{ verticalAlign: '-2px' }} /> Borrar los datos de esta dirección</button>
            ) : (
              <div className="cita-confirm">
                <span>{meta.uid ? 'Se cierra la sesión y se borran los datos de esta dirección. En tu cuenta siguen guardados.' : 'Se borran los datos de esta dirección. Si no los has copiado, se pierden.'}</span>
                <button className="btn ghost small-btn" disabled={!!busy} onClick={() => setConfirmWipe(false)}>Cancelar</button>
                <button className="btn danger small-btn" disabled={!!busy} onClick={() => void wipe()}>{busy === 'wipe' && <Loader2 className="spin" size={15} />} Borrar</button>
              </div>
            )}
          </section>
        )}
        {wiped && <p className="note"><Check size={14} style={{ verticalAlign: '-2px' }} /> Datos borrados de esta dirección.</p>}
      </div>
    </main>
  );
}

/** Quita el modo sin conexión de la app antigua (solo el de esta app, no el de otras webs). */
export async function unregisterOldWorker(): Promise<void> {
  try {
    const scope = new URL('./', location.href).href;
    for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) if (r.scope === scope) await r.unregister();
  } catch { /* sin service worker */ }
}
