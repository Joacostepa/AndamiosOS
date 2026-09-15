"use client";

import { useEffect, useRef, useState } from "react";

// Recuadro para firmar con el dedo (celular) o el mouse. Devuelve la firma como PNG en base64,
// o null si está vacío. Sin librería: son unos trazos sobre un canvas.
//
// El canvas se dibuja al doble de resolución de pantalla para que la firma no salga
// pixelada en el PDF, que se imprime.

export function FirmaPad({ onChange }: { onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacio, setVacio] = useState(true);

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
    setVacio(false);
    onChange(ev.currentTarget.toDataURL("image/png"));
  }

  function borrar() {
    const c = canvas.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setVacio(true);
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
      <button type="button" onClick={borrar} className="text-xs text-gray-600 underline">
        Borrar y firmar de nuevo
      </button>
    </div>
  );
}
