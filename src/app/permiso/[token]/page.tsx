"use client";

import { use, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, CircleAlert, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PortalCliente } from "@/app/api/public/permiso/[token]/route";
import { ETIQUETA_DUENO, NOMBRE_DOCUMENTO, clavesFirmables, cuitValido, formatoCuit, type TipoDueno } from "@/lib/permisos-via-publica/tipos";
import { FirmarDocumentos } from "./firmar";

// Portal del cliente para el permiso de andamio. Llega por mail (o WhatsApp) al iniciarse el
// trámite. Primero: quién es el dueño del lote y su CUIT —con eso ABA ya pide el seguro—.
// Después: los documentos que corresponden a ese tipo de dueño, de a uno y cuando pueda.
//
// Cada documento se revisa apenas se sube: si no es el que se pidió, no se lee o no coincide
// con el dueño o la dirección de la obra, el cliente ve el motivo acá mismo.

const BUCKET = "permisos-via-publica";
const EXTENSIONES = ["pdf", "jpg", "jpeg", "png", "webp"];

export default function PortalPermisoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const consulta = useQuery({
    queryKey: ["portal-permiso", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/permiso/${token}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar");
      return body as PortalCliente;
    },
    // Mientras se revisa algo (~20 s), se consulta seguido para mostrar el resultado solo.
    refetchInterval: (q) => (q.state.data?.documentos.some((d) => d.estado === "revisando") ? 4_000 : false),
    retry: false,
  });
  const [editando, setEditando] = useState(false);
  const datos = consulta.data;
  const correctos = datos?.documentos.filter((d) => d.estado === "ok").length ?? 0;
  const aCorregir = datos?.documentos.filter((d) => d.estado === "observado").length ?? 0;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="text-sm text-gray-500">Andamios Buenos Aires</p>
          <h1 className="text-2xl font-semibold">Permiso de andamio{datos ? ` · ${datos.direccion}` : ""}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Para pedir al Gobierno de la Ciudad el permiso de uso del espacio público necesitamos saber quién es el dueño
            del lote y algunos documentos. Podés cargarlos de a poco: lo que subas queda guardado y lo revisamos en el momento.
          </p>
        </header>

        {consulta.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{consulta.error.message}</p>}
        {consulta.isLoading && <p className="text-sm text-gray-500">Cargando…</p>}

        {datos && (!datos.titular || editando) && (
          <FormTitular token={token} actual={datos.titular} onListo={() => { setEditando(false); consulta.refetch(); }} />
        )}

        {datos?.titular && !editando && (
          <>
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-gray-500">Dueño del lote</p>
                  <p className="font-medium">{datos.titular.nombre}</p>
                  <p className="text-sm text-gray-600">
                    CUIT {formatoCuit(datos.titular.cuit)} · {ETIQUETA_DUENO[datos.titular.tipo]}
                    {datos.titular.esInquilino ? " · quien contrata alquila" : ""}
                  </p>
                  {datos.titular.administrador && (
                    <p className="text-sm text-gray-600">
                      Administrador: {datos.titular.administrador.nombre} · CUIT {formatoCuit(datos.titular.administrador.cuit)}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setEditando(true)} className="text-sm text-gray-600 underline">
                  Cambiar
                </button>
              </div>
            </section>

            {clavesFirmables(datos.titular.tipo).some((clave) => datos.documentos.find((d) => d.clave === clave)?.estado !== "ok") && (
              <FirmarDocumentos token={token} portal={datos} onListo={() => consulta.refetch()} />
            )}

            <section className="space-y-3">
              <h2 className="text-lg font-medium">
                Documentos · {correctos} de {datos.documentos.length} correctos
                {aCorregir > 0 && <span className="text-red-700"> · {aCorregir} para corregir</span>}
              </h2>
              {datos.documentos.map((d) => (
                <FilaDocumento key={d.id} token={token} doc={d} onSubido={() => consulta.refetch()} />
              ))}
              {datos.documentos.length > 0 && correctos === datos.documentos.length && (
                <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                  ¡Listo! Ya tenemos todo y está correcto. Te avisamos cuando presentemos el trámite.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function FormTitular({ token, actual, onListo }: { token: string; actual: PortalCliente["titular"]; onListo: () => void }) {
  const [tipo, setTipo] = useState<TipoDueno | null>(actual?.tipo ?? null);
  const [esInquilino, setEsInquilino] = useState(actual?.esInquilino ?? false);
  const [nombre, setNombre] = useState(actual?.nombre ?? "");
  const [cuit, setCuit] = useState(actual ? formatoCuit(actual.cuit) : "");
  const [adminNombre, setAdminNombre] = useState(actual?.administrador?.nombre ?? "");
  const [adminCuit, setAdminCuit] = useState(actual?.administrador ? formatoCuit(actual.administrador.cuit) : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cuitOk = cuitValido(cuit);
  // En consorcios el administrador va como coasegurado en el seguro: se pide acá, con el dueño.
  const esConsorcio = tipo === "consorcio";
  const adminCuitOk = cuitValido(adminCuit);
  const adminOk = !esConsorcio || (adminNombre.trim().length >= 3 && adminCuitOk);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/public/permiso/${token}/titular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipoDueno: tipo, esInquilino, nombre, cuit, administrador: esConsorcio ? { nombre: adminNombre, cuit: adminCuit } : null }),
    });
    setGuardando(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "No se pudo guardar");
    onListo();
  }

  return (
    <form onSubmit={guardar} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-medium">¿Quién es el dueño del lote?</h2>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ETIQUETA_DUENO) as TipoDueno[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`rounded-md border px-3 py-2 text-sm ${tipo === t ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white"}`}
          >
            {ETIQUETA_DUENO[t]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={esInquilino} onChange={(ev) => setEsInquilino(ev.target.checked)} />
        Quien contrata el andamio alquila el inmueble (no es el dueño)
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-gray-600">
          {tipo === "persona" ? "Nombre y apellido del dueño" : "Razón social, tal como figura en la constancia de CUIT"}
        </span>
        <input value={nombre} onChange={(ev) => setNombre(ev.target.value)} className="rounded-md border border-gray-300 px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-gray-600">CUIT del dueño</span>
        <input value={cuit} onChange={(ev) => setCuit(ev.target.value)} placeholder="30-12345678-9" inputMode="numeric" className="rounded-md border border-gray-300 px-3 py-2" />
        {cuit && !cuitOk && <span className="text-red-700">El CUIT no es válido. Revisá los números.</span>}
      </label>
      {esConsorcio && (
        <fieldset className="grid gap-3 rounded-md border border-gray-200 p-3">
          <legend className="px-1 text-sm font-medium">Administrador del consorcio</legend>
          <p className="text-sm text-gray-600">
            Va como coasegurado en el seguro del andamio. Completalo aunque todavía no tengas el resto de los documentos: con
            esto ya pedimos el seguro.
          </p>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Nombre y apellido del administrador</span>
            <input value={adminNombre} onChange={(ev) => setAdminNombre(ev.target.value)} className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">CUIT o CUIL del administrador</span>
            <input value={adminCuit} onChange={(ev) => setAdminCuit(ev.target.value)} placeholder="20-12345678-9" inputMode="numeric" className="rounded-md border border-gray-300 px-3 py-2" />
            {adminCuit && !adminCuitOk && <span className="text-red-700">El CUIT/CUIL no es válido. Revisá los números.</span>}
          </label>
        </fieldset>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={!tipo || nombre.trim().length < 3 || !cuitOk || !adminOk || guardando}
        className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {guardando && <Loader2 className="size-4 animate-spin" />} Guardar y seguir
      </button>
    </form>
  );
}

function FilaDocumento({ token, doc, onSubido }: { token: string; doc: PortalCliente["documentos"][number]; onSubido: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    const extension = archivo.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONES.includes(extension)) return setError("Tiene que ser un PDF o una foto (JPG o PNG).");
    setSubiendo(true);
    setError(null);
    try {
      const api = `/api/public/permiso/${token}/documentos/${doc.id}`;
      const r1 = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "url", extension }) });
      const destino = await r1.json();
      if (!r1.ok) throw new Error(destino.error ?? "No se pudo preparar la subida");
      const { error: e } = await createClient().storage.from(BUCKET).uploadToSignedUrl(destino.path, destino.token, archivo, { contentType: archivo.type || undefined });
      if (e) throw new Error(e.message);
      const r2 = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "listo", path: destino.path, nombre: archivo.name }) });
      if (!r2.ok) throw new Error((await r2.json().catch(() => null))?.error ?? "No se pudo registrar");
      onSubido();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
    }
  }

  const icono =
    doc.estado === "ok" ? <CheckCircle2 className="size-5 shrink-0 text-green-600" />
    : doc.estado === "observado" ? <CircleAlert className="size-5 shrink-0 text-red-600" />
    : doc.estado === "revisando" ? <Loader2 className="size-5 shrink-0 animate-spin text-blue-600" />
    : doc.estado === "cargado" ? <CheckCircle2 className="size-5 shrink-0 text-gray-400" />
    : <Circle className="size-5 shrink-0 text-gray-300" />;

  return (
    <article className={`flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 shadow-sm ${doc.estado === "observado" ? "border-red-200" : "border-gray-200"}`}>
      {icono}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{NOMBRE_DOCUMENTO[doc.clave] ?? doc.clave}</p>
        {doc.archivo_nombre && (
          <p className="truncate text-xs text-gray-500">
            {doc.archivo_nombre}
            {doc.url && (
              <>
                {" · "}
                <a href={doc.url} target="_blank" rel="noreferrer" className="underline">Ver</a>
              </>
            )}
          </p>
        )}
        {doc.estado === "revisando" && <p className="text-xs text-blue-700">Revisando…</p>}
        {doc.estado === "ok" && <p className="text-xs text-green-700">Correcto</p>}
        {doc.observacion && <p className={`text-xs ${doc.estado === "observado" ? "text-red-700" : "text-gray-600"}`}>{doc.observacion}</p>}
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(ev) => {
          const archivo = ev.target.files?.[0];
          ev.target.value = "";
          if (archivo) subir(archivo);
        }}
      />
      {doc.estado !== "revisando" && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={subiendo}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${doc.estado === "falta" || doc.estado === "observado" ? "bg-gray-900 text-white" : "border border-gray-300"} disabled:opacity-60`}
        >
          {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {doc.estado === "falta" ? "Subir" : doc.estado === "observado" ? "Subir otro" : "Reemplazar"}
        </button>
      )}
    </article>
  );
}
