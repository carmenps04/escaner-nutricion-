import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';

/** Lector de códigos de barras con la cámara trasera (ZXing, funciona en Safari del iPhone). */
export default function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let done = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video.current!,
          (result, _err, ctrl) => {
            if (result && !done) {
              done = true;
              ctrl.stop();
              navigator.vibrate?.(60);
              onCode(result.getText());
            }
          },
        );
        if (done) controls.stop();
      } catch (e) {
        const name = (e as Error)?.name;
        setError(
          name === 'NotAllowedError'
            ? 'No hay permiso para usar la cámara. Actívalo en Ajustes > Safari > Cámara, o usa «Foto del código».'
            : 'No se ha podido abrir la cámara. Prueba con «Foto del código» o escribe el número.',
        );
      }
    })();
    return () => {
      done = true;
      controls?.stop();
    };
  }, [onCode]);

  return (
    <div className="scanner">
      <video ref={video} playsInline muted autoPlay />
      <div className="scanner-frame" aria-hidden />
      <p className="scanner-hint">{error ?? 'Apunta al código de barras del envase'}</p>
      <button className="scanner-close" onClick={onClose} aria-label="Cerrar cámara">
        <X size={22} />
      </button>
    </div>
  );
}

/** Lee el código de barras de una foto ya hecha. */
export async function decodeBarcodePhoto(file: File): Promise<string | null> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  const url = URL.createObjectURL(file);
  try {
    const r = await reader.decodeFromImageUrl(url);
    return r.getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
