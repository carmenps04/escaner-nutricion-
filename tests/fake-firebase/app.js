// Firebase de mentira para las pruebas de sincronización (solo en la build de pruebas).
let apps = [];
export function initializeApp(c) { const a = { c }; apps = [a]; return a; }
export function getApps() { return apps; }
