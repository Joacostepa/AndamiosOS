// Benchmark del motor del modelador (fuera de npm test: los umbrales en ms dependen de la carga de la máquina).
// Correr: npm run bench
import * as M from '../src/lib/tecnica/modelo/index.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);
const d = M.ejemploParana631();
for (let i = 0; i < 8; i++) build(d);
const t: number[] = [];
for (let i = 0; i < 25; i++) {
  const t0 = performance.now();
  build(d);
  t.push(performance.now() - t0);
}
t.sort((a, b) => a - b);
const mediana = t[Math.floor(t.length / 2)];
console.log(`construir() 22 ml × 18 m (Paraná 631): mediana ${mediana.toFixed(2)} ms, mín ${t[0].toFixed(2)} ms, ${build(d).piezas.length} piezas`);
if (t[0] > 15) {
  console.error(`Lento: el mínimo (${t[0].toFixed(2)} ms) pasa los 15 ms.`);
  process.exit(1);
}
