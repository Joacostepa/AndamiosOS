"use client";

// "¿Quién sos?": cada operación del kiosco empieza acá (docs §5). Con la credencial frente
// a la cámara o con el PIN de 4 números. La validación es de la base (pan_identificar):
// acá sólo se evita mandarle un cajón como si fuera una credencial.

import { useState } from "react";
import { Delete, KeyRound, ScanLine } from "lucide-react";
import { Escaner } from "@/components/panol/escaner";
import { normalizarCodigo, resolverLocal } from "@/lib/panol/kiosco";
import type { DatosKiosco } from "@/hooks/use-panol-kiosco";
import { useKiosco } from "./sesion";
import { Aviso, BotonSecundario, Pantalla, Titulo } from "./ui";

export function QuienSos({ datos }: { datos: DatosKiosco }) {
  const { identificar } = useKiosco();
  const [modo, setModo] = useState<"credencial" | "pin">("credencial");
  const [pin, setPin] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function porCredencial(texto: string) {
    if (ocupado) return;
    const local = resolverLocal(texto, datos.codigos, datos.cat.articulos);
    if (local && local.tipo !== "persona" && local.tipo !== "externa" && local.tipo !== "anulado") {
      setError("Eso no es una credencial. Escaneá la tuya o usá tu PIN.");
      return;
    }
    setOcupado(true);
    setError(null);
    const r = await identificar({ codigo: normalizarCodigo(texto) });
    setOcupado(false);
    if (r) setError(r.texto);
  }

  async function tecla(t: string) {
    if (ocupado) return;
    setError(null);
    const nuevo = (pin + t).slice(0, 4);
    setPin(nuevo);
    if (nuevo.length < 4) return;
    setOcupado(true);
    const r = await identificar({ pin: nuevo });
    setOcupado(false);
    setPin("");
    if (r) setError(r.texto);
  }

  if (modo === "pin") {
    return (
      <Pantalla>
        <BotonSecundario onClick={() => { setModo("credencial"); setPin(""); setError(null); }} className="self-start">
          <ScanLine className="size-5" aria-hidden />
          Escanear credencial
        </BotonSecundario>
        <Titulo sub="Son 4 números.">Poné tu PIN</Titulo>
        <div role="status" aria-label={`PIN: ${pin.length} de 4 números`} className="flex justify-center gap-5 py-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`size-6 rounded-full border-[3px] border-foreground ${i < pin.length ? "bg-foreground" : ""}`} />
          ))}
        </div>
        {error && <Aviso tono="bloqueo">{error}</Aviso>}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <Tecla key={k} onClick={() => tecla(k)} disabled={ocupado}>
              {k}
            </Tecla>
          ))}
          <span />
          <Tecla onClick={() => tecla("0")} disabled={ocupado}>
            0
          </Tecla>
          <button
            type="button"
            aria-label="Borrar"
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="grid h-20 place-items-center rounded-xl bg-muted text-foreground"
          >
            <Delete className="size-8" aria-hidden />
          </button>
        </div>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Titulo sub="Acercá tu credencial a la cámara.">¿Quién sos?</Titulo>
      <Escaner onCodigo={porCredencial} pausado={ocupado} className="h-80" etiquetaEscribir="Escribir el código" />
      {error && <Aviso tono="bloqueo">{error}</Aviso>}
      <BotonSecundario onClick={() => { setModo("pin"); setError(null); }} className="w-full">
        <KeyRound className="size-5" aria-hidden />
        Usar PIN
      </BotonSecundario>
    </Pantalla>
  );
}

function Tecla({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid h-20 place-items-center rounded-xl border-2 border-input bg-card font-mono text-3xl font-semibold active:bg-muted disabled:opacity-50"
    >
      {children}
    </button>
  );
}
