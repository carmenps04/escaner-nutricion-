# Escáner nutricional

Web app (PWA) para escanear productos del supermercado y saber si encajan en el plan del nutricionista: veredicto (buena opción, regular u ocasional), cantidad máxima por toma en días con y sin entreno, y frecuencia recomendada.

## Cómo funciona

- **Código de barras**: cámara del móvil (ZXing) → Open Food Facts (base de datos abierta, sin clave).
- **Foto de la tabla nutricional**: OCR dentro del navegador (Tesseract.js, como en la app del gimnasio). Los valores se revisan antes de valorar.
- **Perfil**: se rellena a mano o con una foto de la hoja del dietista. Se guarda solo en el móvil (localStorage); el código no contiene datos personales.
- **Valoración** (`src/lib/evaluate.ts`): puntuación 0–100 con proteína por 100 kcal frente a la del plan, azúcar, grasa saturada, sal (semáforo FSA), fibra, densidad calórica y procesado (NOVA). La cantidad máxima sale del tope más bajo entre calorías, grasa, hidratos, azúcar, saturadas y sal sobre el plan de cada tipo de día.

Es una orientación: los umbrales y repartos por toma son criterio de la app, no del dietista.

## Desarrollo

```bash
npm install
npm test        # lógica y lectores
npm run dev
```

Cada push a `main` compila y publica en GitHub Pages (`.github/workflows/pages.yml`).
