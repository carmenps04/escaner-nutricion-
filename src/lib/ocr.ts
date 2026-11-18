// Lectura de texto en fotos dentro del propio navegador (Tesseract.js), como en la app del gimnasio.
// Los archivos del lector se sirven desde ./ocr/ (los copia vite.config.ts al compilar).

export interface OcrProgress {
  progress: number; // 0–1
  status: string;
}

/**
 * Prepara la foto. Se usa el canal más oscuro de cada píxel (mínimo de R, G y B): así el texto de
 * color (azul, verde, rojo) sobre fondos de color claro queda oscuro sobre claro, que es lo que mejor
 * lee el OCR. Luego se estira el contraste y se amplía si la imagen es pequeña.
 */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(3, Math.max(1, 2400 / bmp.width));
  // Fotos muy grandes de la cámara se reducen para no agotar la memoria del iPhone.
  const s = bmp.width * scale > 3200 ? 3200 / bmp.width : scale;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const px = img.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const m = Math.min(px[i], px[i + 1], px[i + 2]);
    px[i] = m;
    sum += m;
  }
  const dark = sum / (px.length / 4) < 100; // fondo oscuro: se invierte
  for (let i = 0; i < px.length; i += 4) {
    let m = px[i];
    if (dark) m = 255 - m;
    const v = Math.max(0, Math.min(255, ((m - 40) * 255) / 125));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Lee el texto de una imagen con uno o varios modos de segmentación de Tesseract:
 * «6» lee por filas (tablas nutricionales); «11» busca texto disperso (la hoja del dietista, con
 * celdas de colores). Devuelve un texto por modo. Se prepara la imagen una sola vez.
 */
export async function readImage(file: Blob, onProgress?: (p: OcrProgress) => void, modes: string[] = ['11']): Promise<string[]> {
  const { createWorker } = await import('tesseract.js');
  const base = new URL('./ocr/', window.location.href.split('#')[0]).href;
  const worker = await createWorker('spa', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base.replace(/\/$/, ''),
    logger: (m: { status: string; progress: number }) => onProgress?.({ progress: m.progress ?? 0, status: m.status }),
  });
  try {
    const canvas = await prepare(file);
    const out: string[] = [];
    for (const mode of modes) {
      await worker.setParameters({ tessedit_pageseg_mode: mode as never });
      const { data } = await worker.recognize(canvas);
      out.push(data.text);
    }
    return out;
  } finally {
    await worker.terminate();
  }
}

export function statusText(s: string): string {
  if (s.includes('loading')) return 'Preparando el lector…';
  if (s.includes('initializ')) return 'Iniciando el lector…';
  if (s.includes('recognizing')) return 'Leyendo la foto…';
  return 'Procesando…';
}
