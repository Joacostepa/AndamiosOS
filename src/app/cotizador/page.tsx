"use client";

import { useState, useEffect, useMemo } from "react";
import { useListaPrecios } from "@/hooks/use-lista-precios";
import { useFletes } from "@/hooks/use-fletes";
import { Loader2, Phone } from "lucide-react";

const WHATSAPP = "5491127344214";
const LOGO_URL =
  "https://andamiosbuenosaires.com.ar/wp-content/uploads/2026/02/cropped-1.png";

const FRACCIONES = [10, 20, 30] as const;
type Fraccion = (typeof FRACCIONES)[number];

// Mapeo de prefijo de código de producto → categoría visible
const CATEGORY_MAP: [string, string][] = [
  ["MOD-", "Módulos"],
  ["TAB-", "Tablones"],
  ["JUEGO-RUEDAS", "Juegos de Ruedas"],
  ["TORN-", "Tornillos"],
  ["ESC-", "Escalera de Aluminio"],
  ["PUNT-", "Puntales"],
  ["PLACA-", "Placa Fenólico"],
  ["MAD-", "Madera Base"],
];

function getCategory(producto: string): string {
  for (const [prefix, label] of CATEGORY_MAP) {
    if (producto.startsWith(prefix)) return label;
  }
  return producto;
}

function fmt(n: number): string {
  return `$ ${n.toLocaleString("es-AR")}`;
}

type CategoryPrices = {
  category: string;
  prices: Partial<Record<Fraccion, number>>;
};

export default function CotizadorPage() {
  const { data: precios, isLoading: loadingPrecios } =
    useListaPrecios("hogareno");
  const { data: fletes, isLoading: loadingFletes } = useFletes();

  const [minimo, setMinimo] = useState(0);
  const [fraccion, setFraccion] = useState<Fraccion>(10);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedZona, setSelectedZona] = useState("");

  // Fetch mínimo operativo desde API pública
  useEffect(() => {
    fetch("/api/public/cotizador-config")
      .then((r) => r.json())
      .then((d) => setMinimo(d.minimo_hogareno || 0))
      .catch(() => {});
  }, []);

  // Agrupar productos por categoría con precios por fracción
  const categories: CategoryPrices[] = useMemo(() => {
    if (!precios) return [];
    const map = new Map<string, Partial<Record<Fraccion, number>>>();

    for (const p of precios) {
      if (!p.activo) continue;
      const cat = getCategory(p.producto);
      if (!map.has(cat)) map.set(cat, {});
      const entry = map.get(cat)!;
      if (p.fraccion_dias && !entry[p.fraccion_dias as Fraccion]) {
        entry[p.fraccion_dias as Fraccion] = p.precio;
      }
    }

    // Ordenar según CATEGORY_MAP
    const order = CATEGORY_MAP.map(([, l]) => l);
    return Array.from(map.entries())
      .map(([category, prices]) => ({ category, prices }))
      .sort((a, b) => {
        const ai = order.indexOf(a.category);
        const bi = order.indexOf(b.category);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
  }, [precios]);

  // Zonas activas ordenadas
  const zonasActivas = useMemo(
    () => (fletes || []).filter((f) => f.activo),
    [fletes]
  );

  const fleteSeleccionado = useMemo(
    () => zonasActivas.find((z) => z.zona === selectedZona),
    [zonasActivas, selectedZona]
  );

  // Cálculos
  const lineas = useMemo(() => {
    return categories
      .filter((c) => (quantities[c.category] || 0) > 0)
      .map((c) => {
        const qty = quantities[c.category] || 0;
        const precio = c.prices[fraccion] || 0;
        return {
          category: c.category,
          qty,
          precio,
          subtotal: qty * precio,
          dias: fraccion,
        };
      });
  }, [categories, quantities, fraccion]);

  const subtotalAlquiler = lineas.reduce((s, l) => s + l.subtotal, 0);
  const fleteCosto = fleteSeleccionado?.precio || 0;
  const subtotalConFlete = subtotalAlquiler + fleteCosto;
  const aplicaMinimo =
    minimo > 0 && subtotalConFlete > 0 && subtotalConFlete < minimo;
  const ajusteMinimo = aplicaMinimo ? minimo - subtotalConFlete : 0;
  const total = subtotalConFlete + ajusteMinimo;

  function setQty(category: string, value: number) {
    setQuantities((prev) => ({
      ...prev,
      [category]: Math.max(0, value),
    }));
  }

  const loading = loadingPrecios || loadingFletes;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <img
            src={LOGO_URL}
            alt="Andamios Buenos Aires"
            className="mx-auto mb-3 h-12 object-contain"
          />
          <h1 className="text-2xl font-bold text-gray-900">
            Cotizador de Alquiler
          </h1>
          <p className="text-sm text-gray-500">
            Estimación de costos en tiempo real
          </p>
        </div>

        {/* Sección 1: Productos y Días */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            1. Productos y Días
          </h2>

          {/* Productos */}
          <div className="space-y-4">
            {categories.map((cat) => {
              const precio = cat.prices[fraccion];
              const disabled = !precio;
              const qty = quantities[cat.category] || 0;

              return (
                <div
                  key={cat.category}
                  className={`flex items-center justify-between ${disabled ? "opacity-40" : ""}`}
                >
                  <div className="flex-1">
                    <span className="text-sm font-medium">{cat.category}</span>
                    {precio ? (
                      <span className="ml-2 text-xs text-gray-400">
                        {fmt(precio)} c/u
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-red-400">
                        No disponible {fraccion}d
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={disabled || qty === 0}
                      onClick={() => setQty(cat.category, qty - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-30"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      disabled={disabled}
                      value={qty}
                      onChange={(e) =>
                        setQty(
                          cat.category,
                          parseInt(e.target.value, 10) || 0
                        )
                      }
                      className="h-8 w-12 rounded-lg border border-gray-300 bg-white text-center text-sm font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setQty(cat.category, qty + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Días de Alquiler */}
          <div className="mt-6">
            <label className="mb-2 block text-xs text-gray-500">
              Días de Alquiler
            </label>
            <div className="mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-lg font-bold text-gray-900">
              {fraccion}
            </div>
            <p className="mb-3 text-center text-xs text-blue-600">
              Precio por tramo ({fraccion} días).
            </p>
            <div className="flex gap-2">
              {FRACCIONES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFraccion(f)}
                  className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                    fraccion === f
                      ? "bg-blue-900 text-white shadow"
                      : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {f} Días
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sección 2: Zona de Flete */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            2. Zona de Flete
          </h2>
          <select
            value={selectedZona}
            onChange={(e) => setSelectedZona(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900"
          >
            <option value="">Seleccionar zona...</option>
            {zonasActivas.map((z) => (
              <option key={z.id} value={z.zona}>
                {z.zona} ({fmt(z.precio)})
              </option>
            ))}
          </select>
        </div>

        {/* Sección 3: Resumen */}
        <div className="rounded-xl border-2 border-blue-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            Resumen de Cotización
          </h2>

          {lineas.length === 0 && !fleteSeleccionado ? (
            <p className="text-center text-sm text-gray-400">
              Seleccioná productos para ver el resumen
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              {lineas.map((l) => (
                <div key={l.category} className="flex justify-between">
                  <span className="text-gray-600">
                    {l.category} (x{l.qty}, {l.dias} días)
                  </span>
                  <span className="font-medium">{fmt(l.subtotal)}</span>
                </div>
              ))}

              {fleteSeleccionado && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    FLETE ({fleteSeleccionado.zona})
                  </span>
                  <span className="font-medium">{fmt(fleteCosto)}</span>
                </div>
              )}

              <div className="my-2 border-t border-dashed border-gray-200" />

              <div className="flex justify-between font-semibold">
                <span>SUBTOTAL (Alquiler + Flete)</span>
                <span>{fmt(subtotalConFlete)}</span>
              </div>

              {aplicaMinimo && (
                <div className="flex justify-between text-sm italic text-blue-700">
                  <span>
                    Redondeo Mínimo Operativo ({fmt(minimo)} Total)
                  </span>
                  <span>{fmt(ajusteMinimo)}</span>
                </div>
              )}

              <div className="my-2 border-t-2 border-blue-900" />

              <div className="flex items-end justify-between">
                <span className="text-base font-bold">TOTAL FINAL</span>
                <span className="text-3xl font-bold text-blue-900">
                  {fmt(total)}
                </span>
              </div>

              <p className="mt-2 text-right text-xs text-gray-400">
                Todos los precios + IVA
              </p>
            </div>
          )}
        </div>

        {/* WhatsApp CTA */}
        <div className="mt-8 text-center">
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow transition hover:bg-green-700"
          >
            <Phone className="h-4 w-4" />
            Consultar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
