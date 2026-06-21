// Iniciales del avatar de una cuadrilla: "Cuadrilla 1" → "C1", "Cuadrilla 1B" → "C1B".
export function inicialesCuadrilla(nombre: string): string {
  const m = nombre.match(/cuadrilla\s*(.+)/i);
  if (m) return ("C" + m[1].replace(/\s+/g, "")).slice(0, 3).toUpperCase();
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "C"
  );
}

// Nombre corto "J. Ramírez" a partir de nombre + apellido.
export function nombreCorto(nombre: string, apellido: string): string {
  const ini = nombre.trim()[0] ?? "";
  return `${ini}. ${apellido}`.trim();
}
