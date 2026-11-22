import { useEffect, useRef, useState } from 'react';
import { ClipboardCopy, ClipboardPaste, Download, Loader2, Lock, Upload, Smartphone } from 'lucide-react';
import {
  applyBackup, backupLink, decryptBackup, describe, downloadBackup, isEncrypted, MIN_PASS, parseBackup, type Backup, type Encrypted,
} from '../lib/backup.ts';

interface Props {
  toast: (m: string) => void;
  /** Código recibido por enlace (#datos=… o #perfil=…), pendiente de confirmar. */
  pending?: string | null;
  onPendingDone: () => void;
}

/** Pasar los datos entre Safari, la app de la pantalla de inicio y otros dispositivos, y copias de seguridad. */
export default function DataCard({ toast, pending, onPendingDone }: Props) {
  const [text, setText] = useState('');
  const [candidate, setCandidate] = useState<Backup | null>(null);
  /** Copia cifrada que espera su contraseña. */
  const [locked, setLocked] = useState<Encrypted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFromLink, setPendingFromLink] = useState(false);
  /** Copiar o descargar: se pide antes la contraseña con la que se cifra. */
  const [exporting, setExporting] = useState<null | 'copy' | 'download'>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const confirmBox = useRef<HTMLDivElement>(null);
  // La confirmación queda debajo de la cuenta: al llegar por un enlace, se lleva a la vista.
  useEffect(() => {
    if (pendingFromLink && (candidate || locked)) confirmBox.current?.scrollIntoView({ block: 'center' });
  }, [pendingFromLink, candidate, locked]);

  const take = (b: Backup | Encrypted) => {
    setError(null);
    if (isEncrypted(b)) { setLocked(b); setCandidate(null); } else { setCandidate(b); setLocked(null); }
  };

  useEffect(() => {
    if (!pending) return;
    const b = parseBackup(pending);
    if (b) { take(b); setPendingFromLink(true); }
    else setError('El enlace no contiene datos válidos.');
    onPendingDone();
  }, [pending, onPendingDone]);

  const tryParse = (t: string) => {
    const b = parseBackup(t);
    if (!b) {
      setError('Ese texto no es un código de datos de la app. Copia los datos de nuevo y pégalos completos.');
      setCandidate(null);
      setLocked(null);
      return;
    }
    setPendingFromLink(false);
    take(b);
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      tryParse(t);
    } catch {
      setError('No he podido leer el portapapeles. Mantén pulsado el cuadro de abajo, pulsa «Pegar» y luego «Cargar».');
    }
  };

  const doExport = async (pass: string) => {
    setBusy(true);
    try {
      if (exporting === 'download') {
        await downloadBackup(pass);
        toast('Copia cifrada descargada');
      } else {
        const link = backupLink(pass);
        try {
          // Safari solo deja copiar durante el toque: se le pasa la promesa en vez de esperar al cifrado.
          if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': link.then((l) => new Blob([l], { type: 'text/plain' })) })]);
          } else {
            await navigator.clipboard.writeText(await link);
          }
          toast('Datos cifrados copiados. Ábrela desde el otro sitio, pulsa «Pegar datos» y escribe la contraseña.');
        } catch {
          setText(await link);
          toast('No se ha podido copiar solo: selecciona el texto del cuadro y cópialo.');
        }
      }
      setExporting(null);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (pass: string) => {
    if (!locked) return;
    setBusy(true);
    const b = await decryptBackup(locked, pass);
    setBusy(false);
    if (!b) { setError('La contraseña no es la de esta copia.'); return; }
    setError(null);
    setLocked(null);
    setCandidate(b);
  };

  const confirm = () => {
    if (!candidate) return;
    applyBackup(candidate);
    toast('Datos cargados');
    // Se recarga para que todas las pantallas lean los datos nuevos.
    setTimeout(() => location.reload(), 600);
  };

  const cancel = () => { setCandidate(null); setLocked(null); setText(''); setError(null); setPendingFromLink(false); };
  const s = candidate ? describe(candidate) : null;
  const linkWarning = pendingFromLink && 'Has abierto un enlace con datos para la app. Cárgalos solo si el enlace es tuyo o te lo ha enviado alguien de confianza. ';

  return (
    <section className="card">
      <h2 className="card-title"><Smartphone size={15} /> Tus datos</h2>
      <p className="small muted">Copia de seguridad o traspaso sin cuenta: copia los datos aquí y pégalos en el otro sitio (la app de inicio, otro móvil o el ordenador). Van cifrados con una contraseña que eliges tú.</p>

      {exporting ? (
        <ExportForm kind={exporting} busy={busy} onCancel={() => setExporting(null)} onSubmit={doExport} />
      ) : (
        <div className="data-actions">
          <button className="btn ghost" onClick={() => { setExporting('copy'); setError(null); }}><ClipboardCopy size={16} /> Copiar mis datos</button>
          <button className="btn ghost" onClick={paste}><ClipboardPaste size={16} /> Pegar datos</button>
        </div>
      )}

      <label className="field">
        <span>O pega aquí el código</span>
        <textarea rows={2} value={text} onChange={(e) => { setText(e.target.value); setError(null); setCandidate(null); setLocked(null); }} placeholder="https://carmenps04.github.io/…#datos=…" />
      </label>
      {text && !candidate && !locked && <button className="btn primary small-btn data-load" onClick={() => tryParse(text)}>Cargar</button>}
      {error && !locked && <p className="small over">{error}</p>}

      {locked && (
        <div className="cita-confirm data-confirm" ref={confirmBox}>
          <UnlockForm warning={linkWarning || ''} fecha={locked.fecha} error={error} busy={busy} onCancel={cancel} onSubmit={unlock} />
        </div>
      )}

      {candidate && s && (
        <div className="cita-confirm data-confirm" ref={confirmBox}>
          <span>
            {linkWarning}
            Se cargarán: {[s.perfil && 'tu perfil', s.productos && `${s.productos} ${s.productos === 1 ? 'producto' : 'productos'}`, s.dias && `${s.dias} ${s.dias === 1 ? 'día' : 'días'} de diario`, s.citas && `${s.citas} ${s.citas === 1 ? 'cita' : 'citas'}`, s.plan && 'el plan del dietista'].filter(Boolean).join(', ')}.
            Sustituye eso mismo en este dispositivo; lo demás no se toca.
          </span>
          <button className="btn ghost small-btn" onClick={cancel}>Cancelar</button>
          <button className="btn primary small-btn" onClick={confirm}>Cargar datos</button>
        </div>
      )}

      <div className="data-file">
        <button className="link" onClick={() => { setExporting('download'); setError(null); }}><Download size={14} style={{ verticalAlign: '-2px' }} /> Descargar copia de seguridad</button>
        <button className="link" onClick={() => file.current?.click()}><Upload size={14} style={{ verticalAlign: '-2px' }} /> Restaurar desde archivo</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) tryParse(await f.text());
        }} />
      </div>
    </section>
  );
}

/** Contraseña para cifrar la copia (dos veces, para no equivocarse). */
function ExportForm({ kind, busy, onSubmit, onCancel }: { kind: 'copy' | 'download'; busy: boolean; onSubmit: (pass: string) => void; onCancel: () => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const short = a.length > 0 && a.length < MIN_PASS;
  const mismatch = b.length > 0 && a !== b;
  const ok = a.length >= MIN_PASS && a === b;
  return (
    <form className="cita-editor export-form" onSubmit={(e) => { e.preventDefault(); if (ok && !busy) onSubmit(a); }}>
      <strong><Lock size={14} style={{ verticalAlign: '-2px' }} /> Contraseña para cifrar la copia</strong>
      <p className="small muted">La pedirá al cargar los datos. Guárdala bien: sin ella la copia no se puede abrir. Mejor una que no uses en otros sitios.</p>
      <div className="grid-2">
        <label className="field"><span>Contraseña</span><input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} placeholder={`Mínimo ${MIN_PASS} caracteres`} /></label>
        <label className="field"><span>Repítela</span><input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></label>
      </div>
      {(short || mismatch) && <p className="small over">{short ? `Debe tener al menos ${MIN_PASS} caracteres.` : 'Las dos contraseñas no coinciden.'}</p>}
      <div className="cita-actions">
        <button type="button" className="btn ghost small-btn" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn primary small-btn" disabled={!ok || busy}>
          {busy && <Loader2 className="spin" size={15} />} {kind === 'copy' ? 'Cifrar y copiar' : 'Cifrar y descargar'}
        </button>
      </div>
    </form>
  );
}

/** Contraseña de una copia cifrada que se quiere cargar. */
function UnlockForm({ warning, fecha, error, busy, onSubmit, onCancel }: { warning: string; fecha: string; error: string | null; busy: boolean; onSubmit: (pass: string) => void; onCancel: () => void }) {
  const [p, setP] = useState('');
  const when = new Date(fecha);
  const fechaTxt = isNaN(+when) ? '' : ` del ${when.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return (
    <form className="unlock-form" onSubmit={(e) => { e.preventDefault(); if (p && !busy) onSubmit(p); }}>
      <span>{warning}<Lock size={14} style={{ verticalAlign: '-2px' }} /> Copia cifrada{fechaTxt}. Escribe su contraseña para ver qué contiene.</span>
      <label className="field">
        <span>Contraseña de la copia</span>
        <input type="password" autoComplete="off" value={p} onChange={(e) => setP(e.target.value)} />
      </label>
      {error && <p className="small over">{error}</p>}
      <div className="cita-actions">
        <button type="button" className="btn ghost small-btn" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn primary small-btn" disabled={!p || busy}>{busy && <Loader2 className="spin" size={15} />} Abrir copia</button>
      </div>
    </form>
  );
}
