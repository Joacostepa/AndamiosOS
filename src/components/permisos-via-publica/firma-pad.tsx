"use client";

import { useEffect, useRef, useState } from "react";
import { MINIMO_ALFA_FIRMA, MINIMO_TINTA_FIRMA } from "@/lib/permisos-via-publica/tipos";

// Recuadro para firmar con el dedo (celular) o el mouse. Devuelve la firma como PNG en base64,
// o null si está vacío. Sin librería: son unos trazos sobre un canvas.
//
// El canvas se dibuja al doble de resolución de pantalla para que la firma no salga
// pixelada en el PDF, que se imprime.
//
// DA POR FIRMADO SÓLO SI HAY TRAZO. Antes avisaba el trazo al soltar el puntero, aunque no se
// hubiera dibujado nada: un clic sin arrastrar (o un clic después de "Borrar") mandaba un PNG
// transparente entero, se ocultaba el cartel de "Firmá acá" y el botón se habilitaba. Así se
// presentaron en TAD el acta y la nota de SANTA FE AV. 3085 (S02599, 24/09) sin firma y el
// Gobierno observó el expediente. El servidor lo vuelve a controlar: esto es para que el
// cliente se entere acá y no después.

export function FirmaPad({ onChange }: { onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacio, setVacio] = useState(true);
  const [flojo, setFlojo] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const escala = Math.max(2, window.devicePixelRatio || 1);
    c.width = c.offsetWidth * escala;
    c.height = c.offsetHeight * escala;
    const ctx = c.getContext("2d")!;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  /** Qué proporción del recuadro está dibujada. Mismo criterio que el servidor. */
  function tinta(c: HTMLCanvasElement): number {
    const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    let conTinta = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] >= MINIMO_ALFA_FIRMA) conTinta++;
    return conTinta / (c.width * c.height);
  }

  function punto(ev: React.PointerEvent<HTMLCanvasElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function empezar(ev: React.PointerEvent<HTMLCanvasElement>) {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dibujando.current = true;
    const ctx = ev.currentTarget.getContext("2d")!;
    const { x, y } = punto(ev);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = ev.currentTarget.getContext("2d")!;
    const { x, y } = punto(ev);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function terminar(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    dibujando.current = false;
    const c = ev.currentTarget;
    const dibujado = tinta(c);
    setVacio(dibujado === 0);
    setFlojo(dibujado > 0 && dibujado < MINIMO_TINTA_FIRMA);
    // Sin trazo suficiente no hay firma: el botón de firmar sigue apagado.
    onChange(dibujado >= MINIMO_TINTA_FIRMA ? c.toDataURL("image/png") : null);
  }

  function borrar() {
    const c = canvas.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setVacio(true);
    setFlojo(false);
    onChange(null);
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <canvas
          ref={canvas}
          className="h-40 w-full touch-none rounded-md border border-dashed border-gray-400 bg-white"
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
        />
        {vacio && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">Firmá acá con el dedo o el mouse</span>}
      </div>
      {flojo && <p className="text-sm text-red-700">La firma quedó muy chica: firmá de nuevo ocupando buena parte del recuadro.</p>}
      <button type="button" onClick={borrar} className="text-xs text-gray-600 underline">
        Borrar y firmar de nuevo
      </button>
    </div>
  );
}
