# Escáner nutricional

Web app (PWA) para escanear productos del supermercado y saber si encajan en el plan del nutricionista: veredicto (buena opción, regular u ocasional), cantidad máxima por toma en días con y sin entreno, y frecuencia recomendada.

## Cómo funciona

- **Código de barras**: cámara del móvil (ZXing) → Open Food Facts (base de datos abierta, sin clave).
- **Foto de la tabla nutricional**: OCR dentro del navegador (Tesseract.js, como en la app del gimnasio). Los valores se revisan antes de valorar.
- **Perfil**: se rellena a mano o con una foto de la hoja del dietista. Se guarda solo en el móvil (localStorage); el código no contiene datos personales.
- **Valoración** (`src/lib/evaluate.ts`): puntuación 0–100 con proteína por 100 kcal frente a la del plan, azúcar, grasa saturada, sal (semáforo FSA), fibra, densidad calórica y procesado (NOVA). La cantidad máxima sale del tope más bajo entre calorías, grasa, hidratos, azúcar, saturadas y sal sobre el plan de cada tipo de día.

- **Resumen** (`src/lib/resumen.ts`): nota de 0 a 10 de cómo se han cumplido las calorías por semana, mes y año, ranking de días y hasta tres cosas a mejorar (días muy por encima, alcohol, productos de consumo ocasional, macros). Cada día se guarda resumido en `escaner.resumen.v1`, que no se recorta aunque el diario solo conserve 120 días.

Es una orientación: los umbrales y repartos por toma son criterio de la app, no del dietista.

## Desarrollo

```bash
npm install
npm test        # lógica y lectores
npm run dev
```

Cada push a `main` pasa los tests, compila y publica (`.github/workflows/pages.yml`):


- **Firebase Hosting** (`https://escaner-nutricion.web.app`): dirección propia con cabeceras de seguridad (CSP, HSTS, etc., en `firebase.json`). Necesita el secreto `FIREBASE_SERVICE_ACCOUNT` (cuenta de servicio con los roles *Administrador de Firebase Hosting* y *Visor de claves de API*).

Reglas de Firestore: `firestore.rules`.
