// Tipos compartidos de la app.

/** Valores nutricionales por 100 g (o 100 ml si es bebida). null = desconocido. */
export interface Nutrients {
  kcal: number | null;
  prot: number | null;
  hc: number | null;
  azucar: number | null;
  grasa: number | null;
  sat: number | null;
  fibra: number | null;
  sal: number | null;
}

export interface Product {
  /** Código de barras, si lo hay. */
  code?: string;
  name: string;
  brand?: string;
  image?: string;
  /** Valores por 100 g / 100 ml. */
  n: Nutrients;
  liquid: boolean;
  /** Grupo NOVA (1 = sin procesar … 4 = ultraprocesado). */
  nova?: number;
  nutriscore?: string;
  /** Peso de una unidad (una galleta, una barrita…) en gramos. */
  unitWeight?: number;
  /** Nombre de la unidad en singular: «galleta», «barrita»… */
  unitName?: string;
  /** Etiquetas de categoría de Open Food Facts (en:olive-oils…). */
  categories?: string[];
  /** Tiendas de Open Food Facts (mercadona, lidl…). */
  stores?: string[];
  source: 'openfoodfacts' | 'foto' | 'manual';
}

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: null, prot: null, hc: null, azucar: null, grasa: null, sat: null, fibra: null, sal: null,
};
