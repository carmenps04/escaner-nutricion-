import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, LogOut, RefreshCw, UserRound } from 'lucide-react';
import { getStatus, onStatus, resetPassword, signIn, signOut, signUp, syncNow, type SyncStatus } from '../lib/cloud.ts';

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
  const [busy, setBusy] = useState<null | 'in' | 'up' | 'reset' | 'sync'>(null);
  const [error, setError] = useState<string | null>(null);
  const logged = s.state !== 'fuera' && !!s.email;

  const run = async (kind: 'in' | 'up' | 'reset' | 'sync', fn: () => Promise<void>, ok?: string) => {
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
          <button className="btn ghost small-btn" disabled={!!busy || s.state === 'sincronizando'} onClick={() => run('sync', syncNow)}>
            <RefreshCw size={15} /> Sincronizar ahora
          </button>
          <button className="btn ghost small-btn" disabled={!!busy} onClick={() => run('in', signOut, 'Sesión cerrada')}>
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
        <p className="small muted">Al cerrar sesión, los datos se quedan en este dispositivo pero dejan de sincronizarse.</p>
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
        {error && <p className="note warn-note">{error}</p>}
        <div className="account-actions">
          <button type="submit" className="btn primary small-btn" disabled={!valid || !!busy}>
            {busy === 'in' && <Loader2 className="spin" size={15} />} Entrar
          </button>
          <button type="button" className="btn ghost small-btn" disabled={!valid || !!busy} onClick={() => run('up', () => signUp(email, pass), 'Cuenta creada')}>
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
