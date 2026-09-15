"use client";

import { useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { FirmaPad } from "@/components/permisos-via-publica/firma-pad";
import type { PortalCliente } from "@/app/api/public/permiso/[token]/route";
import { CARACTER_POR_DEFECTO, formatoCuit } from "@/lib/permisos-via-publica/tipos";

// "Completar y firmar": el acta de compromiso del GCBA y la nota de ABA en un solo paso, con
// una sola firma. Lo que ya se sabe (dueño, CUIT, fechas) viene del trámite; el cliente
// escribe lo que falta y firma en la pantalla.

const dia = (iso: string) => iso.split("-").reverse().join("/");

export function FirmarDocumentos({ token, portal, onListo }: { token: string; portal: PortalCliente; onListo: () => void }) {
  const titular = portal.titular!;
  const [firmante, setFirmante] = useState(titular.tipo === "persona" ? titular.nombre : "");
  const [dni, setDni] = useState("");
  const [caracter, setCaracter] = useState(CARACTER_POR_DEFECTO[titular.tipo]);
  const [domicilio, setDomicilio] = useState("");
  const [trabajos, setTrabajos] = useState("Trabajos en fachada");
  const [firma, setFirma] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dniOk = /^\d{7,8}$/.test(dni.replace(/\D/g, ""));
  const listo = firmante.trim().length >= 3 && dniOk && caracter.trim().length >= 2 && domicilio.trim().length >= 5 && trabajos.trim().length >= 3 && !!firma && acepto;
  const hoy = new Date().toISOString().slice(0, 10);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/public/permiso/${token}/firmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firmante, dni, caracter, domicilio, trabajos, firma }),
    });
    setEnviando(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "No se pudo firmar");
    onListo();
  }

  const campo = "rounded-md border border-gray-300 px-3 py-2";

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <PenLine className="size-5" /> Completar y firmar
        </h2>
        <p className="text-sm text-gray-600">
          Con estos datos armamos y firmamos el <b>Acta de compromiso</b> del Gobierno de la Ciudad y la <b>Nota de
          autorización</b> para que Andamios Buenos Aires haga el trámite. No hace falta imprimir ni escanear.
        </p>
      </div>

      <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
        {titular.tipo === "persona" ? "Por derecho propio" : `En nombre y representación de ${titular.nombre}`} · CUIT {formatoCuit(titular.cuit)}
        <br />
        Permiso pedido desde el {dia(hoy)} hasta el {dia(portal.permiso_hasta ?? hoy)} · trabajos por 6 meses
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Nombre y apellido de quien firma</span>
          <input value={firmante} onChange={(ev) => setFirmante(ev.target.value)} className={campo} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">DNI de quien firma</span>
          <input value={dni} onChange={(ev) => setDni(ev.target.value)} inputMode="numeric" placeholder="30123456" className={campo} />
          {dni && !dniOk && <span className="text-red-700">Tienen que ser 7 u 8 números.</span>}
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Firma en carácter de</span>
          <input value={caracter} onChange={(ev) => setCaracter(ev.target.value)} className={campo} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Domicilio real de quien firma (calle y altura, CABA)</span>
          <input value={domicilio} onChange={(ev) => setDomicilio(ev.target.value)} className={campo} />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-gray-600">Trabajos a realizar</span>
          <input value={trabajos} onChange={(ev) => setTrabajos(ev.target.value)} className={campo} />
        </label>
      </div>

      <div className="grid gap-1 text-sm">
        <span className="text-gray-600">Firma</span>
        <FirmaPad onChange={setFirma} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={acepto} onChange={(ev) => setAcepto(ev.target.checked)} className="mt-1" />
        <span>
          Leí el Acta de compromiso y la nota, declaro que los datos son correctos y firmo
          {titular.tipo === "persona" ? " por derecho propio." : ` como ${caracter || "representante"} de ${titular.nombre}.`}
        </span>
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={!listo || enviando}
        className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enviando && <Loader2 className="size-4 animate-spin" />} Firmar los dos documentos
      </button>
    </form>
  );
}
