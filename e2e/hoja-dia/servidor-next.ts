// Levanta `next dev` para las pruebas de la Hoja del día (o usa uno que ya esté corriendo con
// E2E_URL=http://localhost:3000). Con variables de mentira: la página de prueba
// (/prueba/pizarron, sólo en desarrollo) no habla con Supabase y las APIs las contesta el
// arnés con `page.route` (servidor-falso.ts).

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..", "..");

export type Next = { url: string; cerrar: () => Promise<void> };

async function esperar(url: string, ms: number, hijo: ChildProcess | null): Promise<void> {
  const fin = Date.now() + ms;
  let ultimo = "";
  while (Date.now() < fin) {
    if (hijo && hijo.exitCode != null) throw new Error(`next dev terminó (código ${hijo.exitCode})`);
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status === 200) return;
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No levantó ${url} en ${ms / 1000} s (${ultimo})`);
}

export async function levantarNext(): Promise<Next> {
  if (process.env.E2E_URL) {
    await esperar(`${process.env.E2E_URL}/prueba/pizarron`, 120_000, null);
    return { url: process.env.E2E_URL, cerrar: async () => {} };
  }
  const puerto = process.env.E2E_PUERTO ?? "3217";
  const hijo = spawn(process.execPath, [join(RAIZ, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", puerto], {
    cwd: RAIZ,
    env: {
      ...process.env,
      NODE_ENV: "development",
      // De mentira: nada de esto se usa en la página de prueba (y un puerto cerrado falla rápido).
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54399",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-de-mentira",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-de-mentira",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: process.env.E2E_LOG ? "inherit" : "ignore",
  });
  const url = `http://localhost:${puerto}`;
  try {
    // La primera compilación de la página tarda (turbopack en frío).
    await esperar(`${url}/prueba/pizarron`, 240_000, hijo);
  } catch (e) {
    hijo.kill("SIGTERM");
    throw e;
  }
  return {
    url,
    cerrar: () => new Promise<void>((r) => {
      if (hijo.exitCode != null) return r();
      hijo.once("exit", () => r());
      hijo.kill("SIGTERM");
      setTimeout(() => { hijo.kill("SIGKILL"); r(); }, 5000);
    }),
  };
}
