import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, LogOut, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { deleteAccount, getStatus, onStatus, resetPassword, signIn, signOut, signUp, syncNow, type SyncStatus } from '../lib/cloud.ts';

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(getStatus);
  useEffect(() => onStatus(setS), []);
  return s;
}

const hora = (t?: number) => (t ? new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '');

/** Entrar con correo y contraseña para tener los datos en todos los dispositivos. */
export default function AccountCard({ toast }: { toast: (m: string) => void }) {
  const s = useSyncStatus();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState<null | 'in' | 'up' | 'reset' | 'sync' | 'delete'>(null);
  const [consent, setConsent] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wipeLocal, setWipeLocal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const logged = s.state !== 'fuera' && !!s.email;

  const run = async (kind: 'in' | 'up' | 'reset' | 'sync' | 'delete', fn: () => Promise<void>, ok?: string) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      if (ok) toast(ok);
      if (kind !== 'reset' && kind !== 'sync') setPass('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (logged) {
    const line =
      s.state === 'sincronizando' || s.state === 'conectando' ? 'Sincronizando…'
      : s.state === 'sin-conexion' ? 'Sin conexión: se sincroniza cuando vuelva internet.'
      : s.state === 'error' ? s.error ?? 'No se ha podido sincronizar.'
      : `Sincronizado${s.last ? ` a las ${hora(s.last)}` : ''}.`;
    return (
      <section className="card account">
        <h2 className="card-title"><UserRound size={15} /> Tu cuenta</h2>
        <p className="account-email">{s.email}</p>
        <p className={`account-state ${s.state === 'error' ? 'over' : ''}`}>
          {s.state === 'sincronizando' || s.state === 'conectando' ? <Loader2 className="spin" size={15} /> : s.state === 'al-dia' ? <Cloud size={15} /> : <CloudOff size={15} />}
          {line}
        </p>
        <p className="small muted">Tus datos se guardan en este dispositivo y en tu cuenta. En otro móvil u ordenador, entra con el mismo correo y contraseña.</p>
        <div className="account-actions">
          <button className="btn ghost small-btn" disabled={!!busy || s.state === 'sincronizando'} onClick={() => run('sync', syncNow, 'Sincronizado')}>
            {busy === 'sync' ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />} Sincronizar ahora
          </button>
          <button className="btn ghost small-btn" disabled={!!busy} onClick={() => run('in', signOut, 'Sesión cerrada')}>
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
        {error && !deleting && <p className="note warn-note">{error}</p>}
        <p className="small muted">Al cerrar sesión, los datos se quedan en este dispositivo pero dejan de sincronizarse.</p>
        <Privacy />
        {!deleting ? (
          <button className="link danger-link" onClick={() => { setDeleting(true); setError(null); setPass(''); }}>
            <Trash2 size={14} style={{ verticalAlign: '-2px' }} /> Borrar mi cuenta y mis datos
          </button>
        ) : (
          <form className="delete-account" onSubmit={(e) => {
            e.preventDefault();
            if (!pass) return;
            void run('delete', () => deleteAccount(pass, wipeLocal), wipeLocal ? 'Cuenta y datos borrados' : 'Cuenta borrada; los datos siguen en este dispositivo');
          }}>
            <strong>Borrar la cuenta {s.email}</strong>
            <p className="small">Se borran para siempre la cuenta y todo lo guardado en la nube (perfil, citas, diario, productos y resúmenes). No se puede deshacer. Si quieres conservar algo, descarga antes una copia en «Tus datos».</p>
            <label className="check">
              <input type="checkbox" checked={wipeLocal} onChange={(e) => setWipeLocal(e.target.checked)} />
              <span>Borrar también los datos de este dispositivo</span>
            </label>
            <label className="field">
              <span>Escribe tu contraseña para confirmar</span>
              <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            </label>
            {error && <p className="note warn-note">{error}</p>}
            <div className="cita-actions">
              <button type="button" className="btn ghost small-btn" disabled={!!busy} onClick={() => { setDeleting(false); setPass(''); setError(null); }}>Cancelar</button>
              <button type="submit" className="btn danger small-btn" disabled={!pass || !!busy}>
                {busy === 'delete' && <Loader2 className="spin" size={15} />} Borrar para siempre
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  const valid = /\S+@\S+\.\S+/.test(email) && pass.length >= 6;
  return (
    <section className="card account">
      <h2 className="card-title"><UserRound size={15} /> Tu cuenta</h2>
      <p className="small muted">Entra con tu correo para tener tus datos en todos tus dispositivos. Lo que ya tengas en este dispositivo se junta con lo de tu cuenta.</p>
      <form className="account-form" onSubmit={(e) => { e.preventDefault(); if (valid) void run('in', () => signIn(email, pass), 'Sesión iniciada'); }}>
        <label className="field">
          <span>Correo</span>
          <input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 6 caracteres" />
        </label>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Para crear una cuenta: acepto que mis datos de salud (peso, composición corporal, plan y diario) se guarden en mi cuenta para sincronizarlos.</span>
        </label>
        <Privacy />
        {error && <p className="note warn-note">{error}</p>}
        <div className="account-actions">
          <button type="submit" className="btn primary small-btn" disabled={!valid || !!busy}>
            {busy === 'in' && <Loader2 className="spin" size={15} />} Entrar
          </button>
          <button type="button" className="btn ghost small-btn" disabled={!valid || !consent || !!busy} title={consent ? undefined : 'Marca la casilla de arriba para crear la cuenta'} onClick={() => run('up', () => signUp(email, pass), 'Cuenta creada')}>
            {busy === 'up' && <Loader2 className="spin" size={15} />} Crear cuenta
          </button>
        </div>
        <button type="button" className="link" disabled={!!busy} onClick={() => {
          if (!/\S+@\S+\.\S+/.test(email)) { setError('Escribe tu correo arriba y vuelve a pulsar.'); return; }
          void run('reset', () => resetPassword(email), 'Te hemos enviado un correo para cambiarla');
        }}>He olvidado la contraseña</button>
      </form>
    </section>
  );
}

/** Qué se guarda, dónde y cómo borrarlo. */
function Privacy() {
  return (
    <details className="privacy">
      <summary><ShieldCheck size={14} /> Privacidad: qué se guarda y dónde</summary>
      <ul>
        <li><b>Qué:</b> tu correo, el perfil y las citas del dietista (peso, composición corporal, calorías y macros), el plan, el diario de comidas, los productos escaneados y los resúmenes. Son datos de salud.</li>
        <li><b>Para qué:</b> solo para que la app funcione y tengas los mismos datos en tus dispositivos. No se usan para publicidad ni se comparten.</li>
        <li><b>Dónde:</b> en tu dispositivo y, si tienes cuenta, en Firebase (Google), en servidores de la Unión Europea. Solo se pueden leer con tu cuenta.</li>
        <li><b>Fuera de la app:</b> al buscar un código de barras se envía ese código a Open Food Facts. Las fotos de etiquetas y de la hoja del dietista se leen en el propio móvil y no se envían a ningún sitio.</li>
        <li><b>Tus derechos:</b> puedes descargar una copia en «Tus datos» y borrar la cuenta con todos sus datos desde aquí cuando quieras.</li>
      </ul>
    </details>
  );
}
