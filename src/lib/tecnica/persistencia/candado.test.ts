import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializarGuardado } from './candado.ts';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('autoguardado: con un PATCH lento en vuelo, el siguiente espera y sale con la revisión nueva (sin 409 propio)', async () => {
  // servidor simulado con control optimista
  let revisionServidor = 1;
  let revisionCliente = 1;
  const enviadas: number[] = [];
  let simultaneos = 0;
  let maxSimultaneos = 0;
  const patch = async () => {
    simultaneos++;
    maxSimultaneos = Math.max(maxSimultaneos, simultaneos);
    const rev = revisionCliente;
    enviadas.push(rev);
    await dormir(30); // red lenta
    simultaneos--;
    if (rev !== revisionServidor) return false; // 409
    revisionServidor++;
    revisionCliente = revisionServidor;
    return true;
  };
  const c = serializarGuardado(patch);
  const a = c.pedir();
  await dormir(5);
  const b = c.pedir(); // debounce mientras el primero está en vuelo
  const d = c.pedir(); // Ctrl+S también en vuelo: se funde con el anterior
  assert.deepEqual(await Promise.all([a, b, d]), [true, true, true]);
  assert.equal(maxSimultaneos, 1, 'nunca dos PATCH a la vez');
  assert.deepEqual(enviadas, [1, 2], 'el segundo sale con la revisión que devolvió el primero');
  assert.equal(revisionServidor, 3);
  assert.equal(c.enVuelo(), false);
});

test('autoguardado: el pedido pendiente conserva «forzar»', async () => {
  const forzados: boolean[] = [];
  const c = serializarGuardado(async (f) => {
    forzados.push(f);
    await dormir(10);
    return true;
  });
  const a = c.pedir(false);
  const b = c.pedir(true);
  const d = c.pedir(false);
  await Promise.all([a, b, d]);
  assert.deepEqual(forzados, [false, true]);
});
