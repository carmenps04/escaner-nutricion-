import { useEffect, useRef, useState } from 'react';
import { ClipboardCopy, ClipboardPaste, Download, Upload, Smartphone } from 'lucide-react';
import { applyBackup, backupLink, describe, downloadBackup, parseBackup, type Backup } from '../lib/backup.ts';

interface Props {
  toast: (m: string) => void;
  /** Código recibido por enlace (#datos=…), pendiente de confirmar. */
  pending?: string | null;
  onPendingDone: () => void;
}

/** Pasar los datos entre Safari, la app de la pantalla de inicio y otros dispositivos, y copias de seguridad. */
export default function DataCard({ toast, pending, onPendingDone }: Props) {
  const [text, setText] = useState('');
  const [candidate, setCandidate] = useState<Backup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pending) return;
    const b = parseBackup(pending);
    if (b) setCandidate(b);
    else setError('El enlace no contiene datos válidos.');
    onPendingDone();
  }, [pending, onPendingDone]);

  const copy = async () => {
    const link = backupLink();
    try {
      await navigator.clipboard.writeText(link);
      toast('Datos copiados. Ahora ábrela desde el otro sitio y pulsa «Pegar datos».');
    } catch {
      setText(link);
      toast('No se ha podido copiar solo: selecciona el texto del cuadro y cópialo.');
    }
  };

  const tryParse = (t: string) => {
    const b = parseBackup(t);
    if (!b) {
      setError('Ese texto no es un código de datos de la app. Copia los datos de nuevo y pégalos completos.');
      setCandidate(null);
      return;
    }
    setError(null);
    setCandidate(b);
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

  const confirm = () => {
    if (!candidate) return;
    applyBackup(candidate);
    toast('Datos cargados');
    // Se recarga para que todas las pantallas lean los datos nuevos.
    setTimeout(() => location.reload(), 600);
  };

  const s = candidate ? describe(candidate) : null;

  return (
    <section className="card">
      <h2 className="card-title"><Smartphone size={15} /> Tus datos</h2>
      <p className="small muted">Copia de seguridad o traspaso sin cuenta: copia los datos aquí y pégalos en el otro sitio (la app de inicio, otro móvil o el ordenador).</p>

      <div className="data-actions">
        <button className="btn ghost" onClick={copy}><ClipboardCopy size={16} /> Copiar mis datos</button>
        <button className="btn ghost" onClick={paste}><ClipboardPaste size={16} /> Pegar datos</button>
      </div>

      <label className="field">
        <span>O pega aquí el código</span>
        <textarea rows={2} value={text} onChange={(e) => { setText(e.target.value); setError(null); setCandidate(null); }} placeholder="https://carmenps04.github.io/…#datos=…" />
      </label>
      {text && !candidate && <button className="btn primary small-btn data-load" onClick={() => tryParse(text)}>Cargar</button>}
      {error && <p className="small over">{error}</p>}

      {candidate && s && (
        <div className="cita-confirm data-confirm">
          <span>
            Se cargarán: {[s.perfil && 'tu perfil', s.productos && `${s.productos} ${s.productos === 1 ? 'producto' : 'productos'}`, s.dias && `${s.dias} ${s.dias === 1 ? 'día' : 'días'} de diario`, s.citas && `${s.citas} ${s.citas === 1 ? 'cita' : 'citas'}`, s.plan && 'el plan del dietista'].filter(Boolean).join(', ')}.
            Sustituye eso mismo en este dispositivo; lo demás no se toca.
          </span>
          <button className="btn ghost small-btn" onClick={() => { setCandidate(null); setText(''); }}>Cancelar</button>
          <button className="btn primary small-btn" onClick={confirm}>Cargar datos</button>
        </div>
      )}

      <div className="data-file">
        <button className="link" onClick={downloadBackup}><Download size={14} style={{ verticalAlign: '-2px' }} /> Descargar copia de seguridad</button>
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
