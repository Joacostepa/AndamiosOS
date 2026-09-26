// Modelo C — alquiler puro (sin montaje): torres móviles, apuntalamiento, componentes sueltos.
//
// Reglas (criterio §2.3): canon de 30 días pieza por pieza a la lista vigente, más el recargo
// comercial; lo que no está en la lista, a un % del valor de compra neto; NUNCA los dos
// criterios sobre el mismo ítem; renovación al 100 % (no hay mano de obra que descontar).
// Si una parte del total sale de valores de compra estimados, se dice cuánto (§7).

import { alCentavo, alPeso, nuevaLinea, numero, pesos, type Aviso, type Linea, type Resultado, type Tarifas } from "./tipos.ts";

export type PiezaDeLista = { codigo: string; descripcion: string; precio: number };

export type EntradaAlquiler = {
  piezas: { codigo: string; cantidad: number }[];
  fueraDeLista?: { descripcion: string; cantidad: number; valorCompraUnitario: number }[];
};

export type DetalleAlquiler = {
  lista: string;
  renglones: { codigo: string; descripcion: string; cantidad: number; precioLista: number; subtotalLista: number }[];
  fuera: { descripcion: string; cantidad: number; valorCompra: number; canon: number }[];
  totalLista: number;
  canonLista: number;
  canonFuera: number;
};

export function cotizarAlquiler(
  e: EntradaAlquiler,
  lista: { id: string; piezas: PiezaDeLista[] },
  t: Tarifas,
): Resultado<DetalleAlquiler> {
  const avisos: Aviso[] = [];
  const lineas: Linea[] = [];
  const porCodigo = new Map(lista.piezas.map((p) => [p.codigo, p]));
  const recargo = 1 + t.alquiler.recargoListaPct / 100;

  const renglones: DetalleAlquiler["renglones"] = [];
  const cantidadPorCodigo = new Map<string, number>();
  for (const p of e.piezas) cantidadPorCodigo.set(p.codigo, (cantidadPorCodigo.get(p.codigo) ?? 0) + p.cantidad);

  for (const [codigo, cantidad] of cantidadPorCodigo) {
    const pieza = porCodigo.get(codigo);
    if (!pieza) {
      avisos.push({ nivel: "bloqueo", codigo: "pieza_inexistente", texto: `El código ${codigo} no está en la lista ${lista.id}. Si es un ítem fuera de lista, va con su valor de compra.` });
      continue;
    }
    if (!(cantidad > 0)) continue;
    renglones.push({ codigo, descripcion: pieza.descripcion, cantidad, precioLista: pieza.precio, subtotalLista: alCentavo(pieza.precio * cantidad) });
  }

  const fuera: DetalleAlquiler["fuera"] = (e.fueraDeLista ?? [])
    .filter((f) => f.cantidad > 0)
    .map((f) => ({
      descripcion: f.descripcion,
      cantidad: f.cantidad,
      valorCompra: f.valorCompraUnitario,
      canon: alPeso((f.valorCompraUnitario * f.cantidad * t.alquiler.fueraListaPct) / 100),
    }));
  for (const f of fuera) {
    if (porCodigo.size && [...porCodigo.values()].some((p) => p.descripcion.toLowerCase() === f.descripcion.toLowerCase())) {
      avisos.push({ nivel: "bloqueo", codigo: "doble_criterio", texto: `«${f.descripcion}» está en la lista: va a precio de lista, no por valor de compra (nunca los dos criterios sobre el mismo ítem).` });
    }
    if (!(f.valorCompra > 0)) avisos.push({ nivel: "bloqueo", codigo: "valor_compra", texto: `Falta el valor de compra de «${f.descripcion}».` });
  }

  const totalLista = alCentavo(renglones.reduce((a, r) => a + r.subtotalLista, 0));
  const canonLista = alPeso(totalLista * recargo);
  const canonFuera = fuera.reduce((a, f) => a + f.canon, 0);
  const piezasTotales = renglones.reduce((a, r) => a + r.cantidad, 0);

  if (canonLista > 0) {
    lineas.push(
      nuevaLinea({
        id: "alquiler",
        grupo: "alquiler",
        seccion: "base",
        producto: "alquiler_sin_montaje",
        descripcion: `Alquiler de estructura multidireccional sin montaje — ${numero(piezasTotales, 0)} piezas, 30 días`,
        cantidad: 1,
        precioUnitario: canonLista,
        unicaVez: false,
        calculo: `${pesos(totalLista)} a lista ${lista.id} × ${numero(recargo)} (recargo ${numero(t.alquiler.recargoListaPct)} %)`,
      }),
    );
  }
  if (canonFuera > 0) {
    lineas.push(
      nuevaLinea({
        id: "alquiler:fuera",
        grupo: "alquiler",
        seccion: "base",
        producto: "alquiler_sin_montaje",
        descripcion: `Alquiler de material fuera de lista — ${fuera.map((f) => `${numero(f.cantidad, 0)} ${f.descripcion}`).join(", ")}, 30 días`,
        cantidad: 1,
        precioUnitario: canonFuera,
        unicaVez: false,
        calculo: `${numero(t.alquiler.fueraListaPct)} % del valor de compra neto: ${fuera.map((f) => `${numero(f.cantidad, 0)} × ${pesos(f.valorCompra)}`).join(" + ")}`,
      }),
    );
    const total = canonLista + canonFuera;
    avisos.push({
      nivel: "info",
      codigo: "estimado_fuera_lista",
      texto: `El ${numero((canonFuera / total) * 100, 0)} % del canon sale de valores de compra estimados (ítems fuera de lista): decilo en la propuesta.`,
    });
  }

  if (!lineas.length && !avisos.some((a) => a.nivel === "bloqueo")) {
    avisos.push({ nivel: "bloqueo", codigo: "sin_piezas", texto: "No hay piezas para cotizar." });
  }

  return {
    lineas,
    avisos,
    pendientes: [],
    renovacionPct: t.renovacionAlquilerPuroPct,
    detalle: { lista: lista.id, renglones, fuera, totalLista, canonLista, canonFuera },
  };
}
