import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { aNotaDeVoz } from "./audio-saliente.ts";

// Lo que graban los navegadores: WebM con Opus (Chrome), MP4 con AAC (Safari, iPhone), estéreo.
const GRABACIONES = [
  { ext: "webm", codec: ["-c:a", "libopus"] },
  { ext: "m4a", codec: ["-c:a", "aac"] },
];

for (const g of GRABACIONES) {
  test(`un audio grabado en ${g.ext} sale como nota de voz: Ogg con Opus, mono (JS, 26/11)`, { skip: !ffmpeg }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "audio-test-"));
    try {
      const grabado = path.join(dir, `grabado.${g.ext}`);
      execFileSync(ffmpeg!, ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ac", "2", ...g.codec, "-metadata:s:a:0", "language=eng", grabado]);
      const ogg = await aNotaDeVoz(readFileSync(grabado), g.ext);
      assert.equal(ogg.subarray(0, 4).toString("latin1"), "OggS");
      const cabecera = ogg.indexOf("OpusHead");
      assert.ok(cabecera > 0, "lleva Opus");
      assert.equal(ogg[cabecera + 9], 1, "un solo canal");
      // Como el saludo, que Meta acepta (131053 con la grabación tal cual, JS 26/11).
      assert.equal(ogg.readUInt32LE(cabecera + 12), 16000, "16 kHz");
      assert.equal(ogg.indexOf("language"), -1, "sin los metadatos de la grabación");
      const salida = path.join(dir, "nota.ogg");
      writeFileSync(salida, ogg);
      const info = spawnSync(ffmpeg!, ["-hide_banner", "-i", salida]).stderr.toString();
      assert.match(info, /start: 0\.000000/, "empieza en 0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
