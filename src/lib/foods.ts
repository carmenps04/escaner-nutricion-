// Alimentos sin código de barras (fruta, verdura, legumbre, carne y pescado frescos…).
// Valores medios por 100 g de parte comestible, redondeados, de tablas de composición de
// alimentos (USDA FoodData Central y BEDCA). Son orientativos: cada pieza varía.
// Orden de los valores: kcal, proteína, hidratos, azúcares, grasa, saturadas, fibra, sal.
// Los hidratos van como en USDA (incluyen la fibra); al cargarlos se resta la fibra para que
// cuadren con las etiquetas europeas, donde la fibra va aparte.

import type { Product } from './types.ts';

type Row = [name: string, values: number[], nova: number, unit?: [grams: number, name: string], aliases?: string];

const ROWS: Row[] = [
  // Tubérculos y hortalizas
  ['Patata cruda', [77, 2, 17.5, 0.8, 0.1, 0, 2.2, 0.02], 1, [170, 'patata'], 'papa'],
  ['Patata cocida', [86, 1.7, 20, 0.9, 0.1, 0, 1.8, 0.01], 1, [170, 'patata'], 'papa hervida'],
  ['Batata cruda', [86, 1.6, 20.1, 4.2, 0.1, 0, 3, 0.14], 1, [200, 'batata'], 'boniato moniato'],
  ['Batata asada', [90, 2, 20.7, 6.5, 0.2, 0, 3.3, 0.09], 1, [200, 'batata'], 'boniato moniato horno'],
  ['Tomate', [18, 0.9, 3.9, 2.6, 0.2, 0, 1.2, 0.01], 1, [120, 'tomate']],
  ['Pepino', [15, 0.7, 3.6, 1.7, 0.1, 0, 0.5, 0.01], 1, [250, 'pepino']],
  ['Lechuga', [15, 1.4, 2.9, 0.8, 0.2, 0, 1.3, 0.07], 1, undefined, 'ensalada'],
  ['Zanahoria', [41, 0.9, 9.6, 4.7, 0.2, 0, 2.8, 0.17], 1, [70, 'zanahoria']],
  ['Cebolla', [40, 1.1, 9.3, 4.2, 0.1, 0, 1.7, 0.01], 1, [110, 'cebolla']],
  ['Pimiento rojo', [31, 1, 6, 4.2, 0.3, 0, 2.1, 0.01], 1, [150, 'pimiento']],
  ['Pimiento verde', [20, 0.9, 4.6, 2.4, 0.2, 0, 1.7, 0.01], 1, [150, 'pimiento']],
  ['Calabacín', [17, 1.2, 3.1, 2.5, 0.3, 0.1, 1, 0.02], 1, [200, 'calabacín']],
  ['Berenjena', [25, 1, 5.9, 3.5, 0.2, 0, 3, 0.01], 1, [250, 'berenjena']],
  ['Brócoli', [34, 2.8, 6.6, 1.7, 0.4, 0, 2.6, 0.08], 1, undefined, 'brocoli'],
  ['Coliflor', [25, 1.9, 5, 1.9, 0.3, 0.1, 2, 0.08], 1],
  ['Espinacas', [23, 2.9, 3.6, 0.4, 0.4, 0.1, 2.2, 0.2], 1],
  ['Judías verdes', [31, 1.8, 7, 3.3, 0.2, 0, 2.7, 0.02], 1, undefined, 'judias verdes vainas'],
  ['Champiñones', [22, 3.1, 3.3, 2, 0.3, 0, 1, 0.01], 1, undefined, 'champinones setas'],
  ['Calabaza', [26, 1, 6.5, 2.8, 0.1, 0, 0.5, 0], 1],
  ['Espárragos verdes', [20, 2.2, 3.9, 1.9, 0.1, 0, 2.1, 0.01], 1, undefined, 'esparragos trigueros'],
  ['Guisantes', [81, 5.4, 14.5, 5.7, 0.4, 0.1, 5.1, 0.01], 1],
  ['Aguacate', [160, 2, 8.5, 0.7, 14.7, 2.1, 6.7, 0.02], 1, [140, 'aguacate']],
  // Frutas
  ['Plátano', [89, 1.1, 22.8, 12.2, 0.3, 0.1, 2.6, 0], 1, [120, 'plátano'], 'platano banana'],
  ['Manzana', [52, 0.3, 13.8, 10.4, 0.2, 0, 2.4, 0], 1, [180, 'manzana']],
  ['Naranja', [47, 0.9, 11.8, 9.4, 0.1, 0, 2.4, 0], 1, [150, 'naranja']],
  ['Mandarina', [53, 0.8, 13.3, 10.6, 0.3, 0, 1.8, 0], 1, [75, 'mandarina']],
  ['Pera', [57, 0.4, 15.2, 9.8, 0.1, 0, 3.1, 0], 1, [170, 'pera']],
  ['Fresas', [32, 0.7, 7.7, 4.9, 0.3, 0, 2, 0], 1, [12, 'fresa'], 'fresa freson'],
  ['Uvas', [69, 0.7, 18.1, 15.5, 0.2, 0.1, 0.9, 0], 1, undefined, 'uva'],
  ['Sandía', [30, 0.6, 7.6, 6.2, 0.2, 0, 0.4, 0], 1, undefined, 'sandia'],
  ['Melón', [34, 0.8, 8.2, 7.9, 0.2, 0, 0.9, 0.04], 1, undefined, 'melon'],
  ['Kiwi', [61, 1.1, 14.7, 9, 0.5, 0, 3, 0], 1, [75, 'kiwi']],
  ['Piña', [50, 0.5, 13.1, 9.9, 0.1, 0, 1.4, 0], 1, undefined, 'pina'],
  ['Melocotón', [39, 0.9, 9.5, 8.4, 0.3, 0, 1.5, 0], 1, [150, 'melocotón'], 'melocoton durazno'],
  ['Arándanos', [57, 0.7, 14.5, 10, 0.3, 0, 2.4, 0], 1, undefined, 'arandanos'],
  ['Mango', [60, 0.8, 15, 13.7, 0.4, 0.1, 1.6, 0], 1, [200, 'mango']],
  // Cereales y legumbres (crudos y cocidos)
  ['Arroz blanco (crudo)', [360, 7, 79, 0.1, 0.6, 0.2, 1.3, 0.01], 1, undefined, 'arroz'],
  ['Arroz blanco (cocido)', [130, 2.7, 28.2, 0.1, 0.3, 0.1, 0.4, 0], 1, undefined, 'arroz'],
  ['Arroz integral (crudo)', [362, 7.5, 76, 0.7, 2.7, 0.5, 3.4, 0.01], 1, undefined, 'arroz'],
  ['Pasta (cruda)', [371, 13, 75, 2.7, 1.5, 0.3, 3.2, 0.01], 1, undefined, 'macarrones espaguetis'],
  ['Pasta (cocida)', [158, 5.8, 31, 0.6, 0.9, 0.2, 1.8, 0], 1, undefined, 'macarrones espaguetis'],
  ['Copos de avena', [379, 13.2, 67.7, 1, 6.5, 1.1, 10.1, 0.01], 1, undefined, 'avena'],
  ['Quinoa (cruda)', [368, 14.1, 64.2, 0, 6.1, 0.7, 7, 0.01], 1, undefined, 'quinua'],
  ['Pan de barra', [270, 8.5, 55, 2, 1.5, 0.3, 3, 1.3], 3, undefined, 'pan blanco baguette'],
  ['Lentejas (cocidas)', [116, 9, 20, 1.8, 0.4, 0.1, 7.9, 0.01], 1],
  ['Garbanzos (cocidos)', [164, 8.9, 27.4, 4.8, 2.6, 0.3, 7.6, 0.02], 1],
  ['Alubias blancas (cocidas)', [139, 9.7, 25, 0.3, 0.4, 0.1, 6.3, 0.01], 1, undefined, 'judias blancas'],
  ['Lentejas (secas)', [352, 24.6, 63, 2, 1.1, 0.2, 10.7, 0.02], 1],
  ['Garbanzos (secos)', [364, 19.3, 61, 10.7, 6, 0.6, 17.4, 0.06], 1],
  // Huevos, carne y pescado (crudos)
  ['Huevo', [143, 12.6, 0.7, 0.4, 9.5, 3.1, 0, 0.36], 1, [55, 'huevo']],
  ['Clara de huevo', [52, 10.9, 0.7, 0.7, 0.2, 0, 0, 0.42], 1, [33, 'clara']],
  ['Pechuga de pollo', [120, 22.5, 0, 0, 2.6, 0.6, 0, 0.12], 1, undefined, 'pollo'],
  ['Pechuga de pavo', [114, 23.7, 0, 0, 1.5, 0.4, 0, 0.15], 1, undefined, 'pavo'],
  ['Ternera magra', [135, 22, 0, 0, 5, 2, 0, 0.15], 1, undefined, 'filete vacuno'],
  ['Lomo de cerdo', [143, 21, 0, 0, 6, 2, 0, 0.13], 1, undefined, 'cerdo'],
  ['Salmón', [208, 20, 0, 0, 13, 3.1, 0, 0.15], 1, undefined, 'salmon'],
  ['Merluza', [86, 18, 0, 0, 1.3, 0.3, 0, 0.25], 1],
  ['Atún fresco', [109, 24.4, 0, 0, 0.5, 0.2, 0, 0.11], 1, undefined, 'atun bonito'],
  ['Gambas', [85, 20, 0, 0, 0.5, 0.1, 0, 0.3], 1, undefined, 'langostinos'],
  ['Tofu', [76, 8, 1.9, 0.6, 4.8, 0.7, 0.3, 0.02], 3],
  // Grasas, frutos secos y otros
  ['Aceite de oliva', [884, 0, 0, 0, 100, 14, 0, 0], 2, [10, 'cucharada'], 'aove'],
  ['Almendras', [579, 21, 21.6, 4.4, 49.9, 3.8, 12.5, 0], 1],
  ['Nueces', [654, 15.2, 13.7, 2.6, 65.2, 6.1, 6.7, 0], 1],
  ['Cacahuetes', [567, 25.8, 16, 4, 49, 6.3, 8.5, 0.05], 1, undefined, 'mani'],
  ['Miel', [304, 0.3, 82, 82, 0, 0, 0.2, 0.01], 2, [20, 'cucharada']],
  ['Azúcar', [400, 0, 100, 100, 0, 0, 0, 0], 2, [5, 'cucharadita'], 'azucar'],
];

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const FOODS: (Product & { aliases?: string })[] = ROWS.map(([name, v, nova, unit, aliases]) => ({
  code: `tabla:${slug(name)}`,
  name,
  brand: 'Alimento natural',
  // (si el azúcar supera el resultado por redondeos de la tabla, los hidratos se igualan al azúcar)
  n: { kcal: v[0], prot: v[1], hc: Math.max(v[3], Math.round((v[2] - v[6]) * 10) / 10), azucar: v[3], grasa: v[4], sat: v[5], fibra: v[6], sal: v[7] },
  liquid: false,
  drink: false,
  nova,
  unitWeight: unit?.[0],
  unitName: unit?.[1],
  source: 'tabla',
  aliases,
}));
