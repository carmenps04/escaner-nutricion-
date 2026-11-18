// Peso por unidad a partir de los textos de ración de Open Food Facts:
// «2 galletas (28 g)», «1 barrita (25g)», «25 g (1 barrita)», o la cantidad «6 x 25 g».

export interface Unit {
  weight: number;
  name: string;
}

const g = (s: string) => parseFloat(s.replace(',', '.'));

function singular(w: string): string {
  w = w.toLowerCase();
  if (/ces$/.test(w)) return w.slice(0, -3) + 'z';
  if (/ones$/.test(w)) return w.slice(0, -4) + 'ón';
  if (/(a|e|i|o|u)s$/.test(w)) return w.slice(0, -1);
  if (/es$/.test(w)) return w.slice(0, -2);
  return w;
}

const SKIP = /^(g|gr|gramos?|ml|kg|l|porci[oó]n|raci[oó]n|serving|portion)$/i;

export function parseUnit(serving?: string | null, quantity?: string | null): Unit | null {
  if (serving) {
    // «2 galletas (28 g)»
    let m = serving.match(/(\d+(?:[.,]\d+)?)\s+([a-záéíóúñ]+)[^(\d]*\(\s*(\d+(?:[.,]\d+)?)\s*(?:g|ml)/i);
    if (m && !SKIP.test(m[2])) return { weight: g(m[3]) / g(m[1]), name: singular(m[2]) };
    // «28 g (2 galletas)»
    m = serving.match(/(\d+(?:[.,]\d+)?)\s*(?:g|ml)\s*\(\s*(\d+(?:[.,]\d+)?)\s+([a-záéíóúñ]+)/i);
    if (m && !SKIP.test(m[3])) return { weight: g(m[1]) / g(m[2]), name: singular(m[3]) };
  }
  if (quantity) {
    const m = quantity.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(g|ml)/i);
    if (m) return { weight: g(m[2]), name: 'unidad' };
  }
  return null;
}
