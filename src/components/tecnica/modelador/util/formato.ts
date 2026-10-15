// Números en criollo: coma decimal, y los campos de medida aceptan cuentas cortas ("12+2,5").

import { fmt } from "@/lib/tecnica/modelo";

export { fmt };

/** Evalúa una expresión aritmética simple (+ − × ÷ y paréntesis) con coma o punto decimal. */
export function evalExpr(txt: string): number | null {
  const s = txt.replace(/\s+/g, "").replace(/,/g, ".").replace(/[x×]/g, "*").replace(/÷/g, "/");
  if (!s || !/^[0-9.+\-*/()]+$/.test(s)) return null;
  let i = 0;
  const num = (): number | null => {
    if (s[i] === "(") {
      i++;
      const v = suma();
      if (s[i] !== ")") return null;
      i++;
      return v;
    }
    if (s[i] === "-") {
      i++;
      const v = num();
      return v === null ? null : -v;
    }
    const m = /^\d*\.?\d+|^\d+\./.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const prod = (): number | null => {
    let v = num();
    while (v !== null && (s[i] === "*" || s[i] === "/")) {
      const op = s[i++];
      const w = num();
      if (w === null) return null;
      v = op === "*" ? v * w : w === 0 ? null : v / w;
    }
    return v;
  };
  const suma = (): number | null => {
    let v = prod();
    while (v !== null && (s[i] === "+" || s[i] === "-")) {
      const op = s[i++];
      const w = prod();
      if (w === null) return null;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  };
  const v = suma();
  if (v === null || i !== s.length || !Number.isFinite(v)) return null;
  return Math.round(v * 1000) / 1000;
}

export const kg = (v: number) => Math.round(v).toLocaleString("es-AR");
export const entero = (v: number) => Math.round(v).toLocaleString("es-AR");

/** "hace 3 min", "ayer"… para las tarjetas de la lista. */
export function haceCuanto(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 172800) return "ayer";
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}
