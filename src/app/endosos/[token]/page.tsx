"use client";

import { use, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleMinus, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FilaEndoso } from "@/app/api/public/endosos/[token]/route";
import { formatoCuit } from "@/lib/permisos-via-publica/tipos";

// Portal del productor de seguros: la lista de endosos que le pidió Andamios Buenos Aires,
// con un botón para subir la póliza de cada obra. Sin cuenta: lo abre el link del mail, y
// lo puede usar cualquiera en Segucom (decidido: si Gonzalo está de vacaciones, lo reenvía).
//
// Cada póliza se revisa apenas se sube y el resultado aparece acá mismo: si le falta el
// coasegurado o la cláusula del GCBA, lo ve en el momento y no cuando lo observa el Gobierno.

const BUCKET = "permisos-via-publica";
const dia = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const ESTADO: Record<FilaEndoso["estado"], { texto: string; clase: string }> = {
  falta: { texto: "Falta", clase: "bg-gray-100 text-gray-700" },
  pedido: { texto: "Para subir", clase: "bg-amber-100 text-amber-800" },
  revisando: { texto: "Revisando…", clase: "bg-blue-100 text-blue-800" },
  observado: { texto: "Hay que corregir", clase: "bg-red-100 text-red-800" },
  ok: { texto: "Recibida y correcta", clase: "bg-green-100 text-green-800" },
};

export default function EndososPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const consulta = useQuery({
    queryKey: ["endosos", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/endosos/${token}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar");
      return body as { productor: string; filas: FilaEndoso[] };
    },
    // Mientras alguna se revisa, se consulta cada 5 s; si no, cada minuto.
    refetchInterval: (q) => (q.state.data?.filas.some((f) => f.estado === "revisando") ? 5_000 : 60_000),
    retry: false,
  });
  const datos = consulta.data ?? null;
  const error = consulta.error instanceof Error ? consulta.error.message : null;
  const cargar = () => void consulta.refetch();

  const pendientes = datos?.filas.filter((f) => f.estado !== "ok") ?? [];
  const listas = datos?.filas.filter((f) => f.estado === "ok") ?? [];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm text-gray-500">Andamios Buenos Aires</p>
          <h1 className="text-2xl font-semibold">Endosos de pólizas de RC</h1>
          <p className="mt-1 text-sm text-gray-600">
            Cada póliza tiene que llevar al <b>titular del lote como coasegurado</b> y la <b>cláusula de no repetición a
            favor del Gobierno de la Ciudad Autónoma de Buenos Aires</b> (CUIT 34-99903208-9), con suma asegurada mayor a
            $1.000.000, vigencia hasta el fin del permiso y el PDF sin protección.
          </p>
        </header>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!datos && !error && <p className="text-sm text-gray-500">Cargando…</p>}

        {datos && (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-medium">Para subir · {pendientes.length}</h2>
              {pendientes.length === 0 && <p className="text-sm text-gray-500">No hay endosos pendientes. ¡Gracias!</p>}
              {pendientes.map((f) => (
                <Tarjeta key={f.id} token={token} fila={f} onSubida={cargar} />
              ))}
            </section>

            {listas.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-medium">Recibidas en las últimas dos semanas</h2>
                {listas.map((f) => (
                  <Tarjeta key={f.id} token={token} fila={f} onSubida={cargar} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Tarjeta({ token, fila, onSubida }: { token: string; fila: FilaEndoso; onSubida: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estado = ESTADO[fila.estado];

  async function subir(archivo: File) {
    if (!archivo.name.toLowerCase().endsWith(".pdf") && archivo.type !== "application/pdf") {
      return setError("Tiene que ser un PDF.");
    }
    setSubiendo(true);
    setError(null);
    try {
      const api = `/api/public/endosos/${token}/documentos/${fila.id}`;
      const pedirUrl = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "url" }) });
      const destino = await pedirUrl.json();
      if (!pedirUrl.ok) throw new Error(destino.error ?? "No se pudo preparar la subida");

      const { error: e } = await createClient().storage.from(BUCKET).uploadToSignedUrl(destino.path, destino.token, archivo, { contentType: "application/pdf" });
      if (e) throw new Error(e.message);

      const listo = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "listo", path: destino.path, nombre: archivo.name }),
      });
      if (!listo.ok) throw new Error((await listo.json().catch(() => null))?.error ?? "No se pudo registrar");
      onSubida();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <article className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{fila.titular_nombre}</p>
          <p className="text-sm text-gray-600">CUIT {formatoCuit(fila.titular_cuit ?? "")} · Obra: {fila.direccion}</p>
          <p className="text-sm text-gray-600">Permiso hasta el {dia(fila.permiso_hasta)} · pedido el {dia(fila.pedido_at)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${estado.clase}`}>
          {fila.estado === "revisando" && <Loader2 className="mr-1 inline size-3 animate-spin" />}
          {estado.texto}
        </span>
      </div>

      {fila.estado === "revisando" && <p className="text-sm text-blue-700">Estamos revisando la póliza, tarda alrededor de un minuto.</p>}
      {fila.estado === "observado" && fila.observacion && <p className="text-sm text-red-700">{fila.observacion}</p>}

      {fila.chequeos.length > 0 && fila.estado !== "revisando" && (
        <ul className="space-y-1">
          {fila.chequeos.map((c) => (
            <li key={c.clave} className="flex items-start gap-1.5 text-sm">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
              ) : c.bloquea ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
              ) : (
                <CircleMinus className="mt-0.5 size-4 shrink-0 text-gray-400" />
              )}
              <span className={c.ok || c.bloquea ? "" : "text-gray-500"}>{c.detalle}</span>
            </li>
          ))}
        </ul>
      )}

      {fila.estado !== "revisando" && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(ev) => {
              const archivo = ev.target.files?.[0];
              ev.target.value = "";
              if (archivo) subir(archivo);
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={subiendo}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
          >
            {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {fila.estado === "pedido" ? "Subir póliza" : "Subir otra versión"}
          </button>
          {fila.archivo_nombre && <span className="text-sm text-gray-500">Última subida: {fila.archivo_nombre}</span>}
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </article>
  );
}
