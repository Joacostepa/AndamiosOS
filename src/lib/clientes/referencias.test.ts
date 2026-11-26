import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import ffmpeg from "ffmpeg-static";
import { FILTRO_COPIA } from "./referencias.ts";

/** Un PNG RGBA de 40×30: transparente, con un rectángulo azul opaco. */
function pngTransparente(): Buffer {
  const w = 40, h = 30;
  const filas: number[] = [];
  for (let y = 0; y < h; y++) {
    filas.push(0);
    for (let x = 0; x < w; x++) filas.push(...(x >= 5 && x < 25 && y >= 5 && y < 15 ? [0, 0, 255, 255] : [255, 0, 0, 0]));
  }
  const crcTabla = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTabla[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const trozo = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([largo, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ihdr), trozo("IDAT", deflateSync(Buffer.from(filas))), trozo("IEND", Buffer.alloc(0))]);
}

test("la copia de la imagen de referencia sale siempre (26/11: la bandeja no salía nunca)", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ref-test-"));
  try {
    const entrada = path.join(dir, "render.png");
    writeFileSync(entrada, pngTransparente());
    for (let i = 0; i < 5; i++) {
      const salida = path.join(dir, `copia-${i}.jpg`);
      execFileSync(ffmpeg!, ["-loglevel", "error", "-y", "-i", entrada, "-filter_complex", FILTRO_COPIA, "-frames:v", "1", "-update", "1", "-q:v", "4", salida]);
      const jpg = readFileSync(salida);
      assert.ok(jpg.length > 100, "la copia tiene que existir y no estar vacía");
      assert.deepEqual([...jpg.subarray(0, 2)], [0xff, 0xd8], "es un JPG");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
