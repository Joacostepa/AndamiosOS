# Dirección: contrato de implementación

Esta guía es para quien construye una pantalla de Dirección. La base (permisos, lector de Odoo, formato, caché, snapshot, componentes comunes, API de desglose y rutas) ya está hecha. Cada pantalla se arma **dentro de sus propios archivos**, así cinco personas trabajan en paralelo sin pisarse.

Especificación: `docs/direccion/diseno.md` (diseño), `docs/direccion/handoff.md` §4 (plan), `docs/direccion/maqueta.html` (UI aprobada: textos, lógica de cálculo y bloque "2b" de correcciones). Las definiciones exactas de cada indicador en Odoo están en `Odoo-Claude/direccion/datos/*_definiciones.md`.

---

## 1. Reglas que no se negocian

1. **Odoo es de solo lectura.** Todo pasa por `src/lib/direccion/odoo-lectura.ts`. No se importa nada de `src/lib/odoo/` y no se llaman `create`, `write`, `unlink`, `action_*` ni `button_*`. Lo verifican dos tests: `guardia.test.ts` y `odoo-lectura.test.ts`.
2. **Nada inventado.** No se hardcodea nada del snapshot del 15/10. Si falta un dato, se usa `sinDato("motivo")`, nunca `0`.
3. **Socios se chequea en el servidor.** Retiros, dividendos, política y circuitos de facturación se marcan `reservado: true`, o se cuelgan de `detalle.reservado`. El servidor los recorta por usuario.
4. **Las escrituras van a Supabase.** Notas, dueños, metas, colchón y política nunca van a Odoo. Si la tabla todavía no existe, responden 503 con un mensaje amable.
5. **Funciona sin la migración.** Las pantallas calculan en vivo. El snapshot es una optimización.
6. **Textos.** Van en español rioplatense, iguales a los de la maqueta, y sin jerga técnica: "Dólar" (no "TC"), "Sin dato" (no "s/d"), "Órdenes de trabajo" (no "OT").
7. **Lógica pura con test.** Va en `src/lib/direccion/**/*.test.ts` con `node --test`, usando imports relativos con `.ts`. Antes de un PR, `npm test` y `npx tsc --noEmit` tienen que pasar.

---

## 2. Dónde va cada cosa

| Qué | Dónde | Dueño |
|---|---|---|
| Calculador de la pantalla | `src/lib/direccion/calculo/<pantalla>.ts` (ya existe, vacío) | quien hace la pantalla |
| Reglas puras del área (narrativa, decisiones, aging…) | `src/lib/direccion/calculo/<área>-reglas.ts` + `.test.ts` | ídem |
| Nodos de desglose | `src/lib/direccion/desglose/<pantalla>.ts` (ya existe, `nodos: []`) | ídem |
| Página | `src/app/(dashboard)/direccion/<ruta>/page.tsx` (ya existe, con relleno) | ídem |
| Componentes propios de la pantalla | `src/components/direccion/<pantalla>/…` | ídem |
| Tipos compartidos | `src/lib/direccion/tipos.ts` | base: pedir antes de cambiarlo |
| Formato | `src/lib/direccion/formato.ts` | base |
| Diccionario | `src/lib/direccion/diccionario.ts` | base: se pueden agregar indicadores |
| Componentes comunes | `src/components/direccion/*.tsx` (exportados en `index.ts`) | base |

Los índices `calculo/index.ts` y `desglose/index.ts` ya importan los siete archivos. **No hace falta tocarlos.**

Pantallas (`PantallaId`): `semana`, `caja`, `ventas`, `cobranzas`, `calle`, `socios`, `datos`.

---

## 3. Un calculador

Un calculador recibe `ctx: CtxCalculo` (`calculo/contrato.ts`):

| Campo | Qué es |
|---|---|
| `hoy` | La fecha de hoy en Buenos Aires, `'AAAA-MM-DD'`. |
| `ahora` | El instante del cálculo, en ISO. |
| `params` | Los parámetros de la URL (solo Ventas: `g`, `p`, `vs`, `desde`, `hasta`). |
| `dolar` | La serie completa del dólar de Odoo. |
| `tc` | El dólar de hoy (`{ valor, fecha }`). |
| `pantalla(p)` | El resultado de otra pantalla, cacheado y **sin recortar**. |
| `supabase()` | Cliente con service role, solo para lecturas compartidas. |

Devuelve `{ cifras, detalle, avisos, decisiones?, oraciones? }`. Todo tiene que ser JSON serializable: sin `Date`, `Map` ni funciones.

```ts
// src/lib/direccion/calculo/cobranzas.ts
import { definirCalculador } from "./contrato.ts";
import { searchReadTodo, readGroup } from "../odoo-lectura.ts";
import { monto, sinDato } from "../formato.ts";
import { polaridadDe } from "../diccionario.ts";

export type DetalleCobranzas = { tramos: { clave: string; etiqueta: string; monto: { ars: number } }[] /* … */ };

export const calculador = definirCalculador<DetalleCobranzas>({
  pantalla: "cobranzas",
  async calcular(ctx) {
    const lineas = await searchReadTodo("account.move.line",
      [["account_id", "=", 287], ["parent_state", "=", "posted"], ["reconciled", "=", false]],
      ["partner_id", "amount_residual", "date", "date_maturity", "move_id"]);
    const vencido = /* lógica de cobranzas_definiciones.md (emisión + 30, sin imputar al más viejo…) */ 0;
    return {
      cifras: [{
        kpi: "vencido_30",
        valor: lineas.length ? monto(vencido) : sinDato("Odoo no devolvió partidas"), // saldo: sin usd
        regla: "saldo",
        confianza: { nivel: "inc", motivo: "Muchas facturas sin plazo de pago" },
        comparaciones: [{ delta: 4, base: "vs mes anterior", polaridad: polaridadDe("vencido_30"), unidad: "pp" }],
        contexto: ["45 % es de ", { valor: { tipo: "texto", texto: "1 cliente" }, nodo: { tipo: "cliente", v: "MINISTERIO DEL INTERIOR" } }],
      }],
      detalle: { tramos: [] },
      avisos: [],
    };
  },
});
```

**Montos.**

| Caso | Cómo se arma | Ejemplo |
|---|---|---|
| Período (facturado, cobrado) | `{ ars, usd }`, donde `usd` es la suma de cada documento a su dólar | `aUsd(ctx.dolar, ars, fecha)` o `tcEn(ctx.dolar, fecha)` |
| Saldo (por cobrar, caja) | `{ ars }` sin `usd`; el cliente lo pasa al dólar de hoy | `{ ars: 1_617_300 }` |
| Resultado mensual | Dólar promedio del mes | `tcPromedioMes` |

**Si Odoo falla:** dejá que tire `OdooError`. El servidor muestra el último snapshot con la banda "No pudimos leer Odoo". Si falla solo una cifra, hacé `try/catch` y ponela en `sinDato("…")`.

**Reservado:** usá `reservado: true` en cifras, avisos, decisiones u oraciones. Si hay que meter algo de socios en el `detalle` de otra pantalla, va en `detalle.reservado`. La pantalla `socios` entera solo se calcula con permiso. La Semana usa `await ctx.pantalla("socios")` y marca `reservado` lo que toma de ahí.

**Algo que cambia con lo reservado** (no alcanza con ocultar un renglón si el total lo delata): se calcula dos veces y se juntan las dos versiones con `variantes(socios, publico)` de `reservado.ts`. Lo distinto va dos veces, una `soloConSocios` y otra `soloSinSocios`, y `filtrarReservado` deja a cada usuario la suya. No se usa `reservado` para eso porque en la UI significa "tema de socios" (pie de la narrativa, 🔒, notas reservadas). Caso real: el flujo de Caja. `detalle.flujo` es el público, **sin** los retiros (ni en los renglones ni en los totales); el flujo con retiros va en `detalle.reservado.flujo` y se usa con `conRetiros(detalle)`. La cobertura, sus decisiones y oraciones van en dos versiones; los nodos `coberturaSocios` y `semanaFlujoSocios` son los reservados. La semana se arma dos veces (`combinarSemana`).

**Comparaciones con historia** ("vs lunes anterior"): usá `historiaCifra(ctx.supabase(), "caja_disponible", { hasta })` de `snapshot.ts`. Si devuelve `[]`, la comparación queda `{ delta: null, motivo: "Todavía no hay historia guardada" }`.

---

## 4. Una página

La página ya existe con un relleno (`EnConstruccion`, que pinta las cifras que devuelva el calculador). Para reemplazarla:

```tsx
// src/app/(dashboard)/direccion/cobranzas/page.tsx  (server component)
import { MarcoPantalla } from "@/components/direccion";
import { sesionPaginaDireccion } from "@/lib/direccion/permisos-servidor";
import { obtenerPantalla } from "@/lib/direccion/servidor";
import type { DetalleCobranzas } from "@/lib/direccion/calculo/cobranzas";
import { VistaCobranzas } from "@/components/direccion/cobranzas/vista";

export default async function PaginaCobranzas() {
  const s = await sesionPaginaDireccion();
  if (!s) return null;
  const r = await obtenerPantalla<DetalleCobranzas>("cobranzas", { conSocios: s.conSocios });
  return <MarcoPantalla respuesta={r}>{(r) => <VistaCobranzas resultado={r} />}</MarcoPantalla>;
}
```

`MarcoPantalla` hace tres cosas:

- Registra la lectura para el encabezado ("Datos de Odoo al…" y el dólar).
- Si Odoo no respondió, pone `BandaOdooCaido`.
- Si no hay datos, muestra `EstadoSinDatos`.

Lo reservado ya llega recortado.

```tsx
// src/components/direccion/cobranzas/vista.tsx
"use client";
import { FilaCifras, TarjetaCifra, BarraTramos, Ranking, useFormato, useDireccion } from "@/components/direccion";

export function VistaCobranzas({ resultado }: { resultado: ResultadoPantalla<DetalleCobranzas> }) {
  const f = useFormato();            // f.mon(monto), f.valor(valor), f.unidad("saldo"), f.moneda, f.tc
  const { abrirNodo, puedeEditar } = useDireccion();
  return (
    <>
      <FilaCifras>{resultado.cifras.map((c) => <TarjetaCifra key={c.id ?? c.kpi} cifra={c} />)}</FilaCifras>
      <BarraTramos tramos={resultado.detalle.tramos} alto leyenda />
    </>
  );
}
```

**Formato en el cliente.** El toggle USD/ARS vive en la URL (`?moneda=ARS`) y no pide nada al servidor. Por eso el servidor manda `Monto` y `Valor` crudos, y el cliente formatea con `useFormato()`. No formatees montos en el servidor.

**Parámetros de la URL.** Si tu pantalla usa parámetros (como el período de Ventas), sumalos en `src/lib/direccion/params.ts`. La página los lee con `paramsDe("ventas", await searchParams)` y forman parte de la clave de caché.

**Acciones propias de la pantalla** (Compartir y Reunión en La semana, SelectorPeriodo en Ventas): van en la página, arriba del contenido. El encabezado común ya trae la pregunta, los datos, el dólar, la moneda, Actualizar y las pestañas.

---

## 5. Un nodo de desglose

Las tarjetas abren `cifra.nodo ?? { tipo: cifra.kpi }`. Para cada indicador, registrá un nodo con `tipo` igual al id del diccionario. Los nodos de nivel 2 llevan nombre propio: `cliente`, `cuenta`, `semanaFlujo`. Un `tipo` repetido rompe al cargar.

```ts
// src/lib/direccion/desglose/cobranzas.ts
import { definirNodo, paginar, type DefNodo } from "./contrato.ts";
import { searchReadTodo } from "../odoo-lectura.ts";
import type { DetalleCobranzas } from "../calculo/cobranzas.ts";

const vencido30 = definirNodo({
  tipo: "vencido_30",
  pantalla: "cobranzas",           // su caché y su "Actualizar" lo invalidan
  async resolver(ref, ctx) {
    const r = await ctx.pantalla<DetalleCobranzas>("cobranzas");   // nivel 1: sale del resultado cacheado
    const filas = r.detalle.porCliente.map((c) => ({
      id: c.cliente, titulo: c.nombre, valor: { tipo: "monto" as const, monto: { ars: c.ars } },
      barra: c.ars / r.detalle.max, hijo: { tipo: "cliente", v: c.cliente },
    }));
    return {
      titulo: "Por cobrar vencido +30 días",
      cifra: { tipo: "monto", monto: { ars: r.detalle.vencidoArs } },
      sub: `${filas.length} clientes`,
      agrupar: { param: "g", activo: ref.g ?? "cliente", opciones: [{ valor: "cliente", etiqueta: "Cliente" }, { valor: "tramo", etiqueta: "Tramo" }] },
      secciones: [{ filas, cierre: { suma: { ars: filas.reduce((a, f) => a + /*…*/ 0, 0) }, cifra: { ars: r.detalle.vencidoArs }, texto: "la cifra de la tarjeta" } }],
    };
  },
});

const cliente = definirNodo({
  tipo: "cliente", pantalla: "cobranzas",
  async resolver(ref, ctx) {                                         // nivel 2: en vivo, paginado
    const todas = await searchReadTodo("account.move.line", [/* … partner = ref.v */], ["move_id", "amount_residual", "date"]);
    const { filas, pagina } = paginar(todas, ctx.pagina);           // de a 50
    return {
      titulo: ref.v, cifra: { tipo: "monto", monto: { ars: /* total de TODAS */ 0 } }, csv: true, pagina,
      secciones: [{ filas: filas.map((l) => ({ id: String(l.id), titulo: l.move_id[1], valor: { tipo: "monto", monto: { ars: l.amount_residual } }, odoo: { modelo: "account.move", id: l.move_id[0] } })),
                    cierre: { suma: { ars: /* suma de TODAS */ 0 }, cifra: { ars: /* saldo */ 0 } } }],
    };
  },
});

export const nodos: DefNodo[] = [vencido30, cliente];
```

**Cómo lo sirve la API.** `GET /api/direccion/desglose?nodo=cliente&v=…&pagina=2` hace cuatro cosas:

1. Chequea los permisos. Un nodo `reservado` necesita socios, y todo nodo de `pantalla: "socios"` es reservado por defecto.
2. Cachea el resultado 10 minutos con el tag de la pantalla.
3. Completa el `odoo.url` de cada fila: `{ODOO_URL}/odoo/<modelo>/<id>`.
4. Muestra el cierre `Total = la cifra ✓` en la moneda elegida, con `textoCierre`.

Hay un ejemplo real en `desglose/comun.ts` (nodo `dolar`).

Para abrir un nodo desde cualquier componente: `useDireccion().abrirNodo({ tipo: "cliente", v })`. Desde dentro del panel, el componente apila solo.

---

## 6. Rutas API

Todas las rutas usan `src/app/api/direccion/_comun.ts`.

| Ruta | Para qué |
|---|---|
| `GET /api/direccion/<pantalla>` | Devuelve la `RespuestaPantalla`. Ya existen las siete; Socios además registra la apertura. |
| `GET /api/direccion/desglose` | El drill-down (§5). |
| `POST /api/direccion/actualizar?pantalla=` | "Actualizar ahora". Como máximo una vez cada 5 minutos por usuario y pantalla. Alcanza con "ver". |
| `GET /api/direccion/propios` | Notas, dueños, metas y configuración (`propiosParaUsuario`): sólo los dueños y notas de las decisiones que esa persona ve y sin metas de indicadores reservados. Devuelve `disponible: false` si no hay migración. |
| `POST /api/direccion/notas` | Anotar. Body: `{ alertaId, texto, dueno?, reunion? }`. `dueno` es uno de Jorge, Gabriel, Joaquín o Juan Pablo. `reservado` lo decide el servidor (§7). |
| `POST /api/direccion/dueno` | Asignar dueño. Body: `{ alertaId, dueno \| null }`. La decisión tiene que estar abierta; si es de socios, sólo un socio. |
| `POST /api/direccion/metas` | Fijar una meta. Body: `{ kpiId, meta \| null }`. |
| `POST /api/direccion/minimo` | Colchón mínimo y escenario. Body: `{ colchonMinimoArs?, escenario? }`. |
| `GET` y `POST /api/direccion/politica` | Política de retiros. Solo socios. Body del POST: `{ contenido: {...} }`. |
| `/api/cron/direccion` | El snapshot de las 04:30. Lo protege `CRON_SECRET` (comparación en tiempo constante). |

Los errores de Odoo nunca viajan crudos al navegador (traen la URL del servidor): usá `motivoPublico(e)` de `odoo-lectura.ts`. La auditoría se escribe con `registrarAuditoria(usuario, accion, detalle)` de `auditoria.ts` (service role): los usuarios no tienen INSERT en `direccion_auditoria`.

Si necesitás una ruta nueva, copiá el patrón:

```ts
// src/app/api/direccion/<algo>/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";   // o exigirSociosApi()
import { falloEscritura, leerBody } from "../_comun";

const esquema = z.object({ /* … */ });
export async function POST(req: NextRequest) {
  const s = await exigirDireccionApi("editar");          // segunda llave (la primera es el proxy)
  if (s instanceof NextResponse) return s;
  const body = await leerBody(req, esquema);
  if (body instanceof NextResponse) return body;
  const { error } = await (await createClient()).from("direccion_x").insert({ /* … */ });   // sesión del usuario: decide la RLS
  if (error) return falloEscritura(error);               // tabla faltante → 503 amable · RLS → 403
  return NextResponse.json({ ok: true });
}
```

Cualquier ruta bajo `/api/direccion` ya está habilitada en el proxy para el módulo `direccion`: GET pide "ver" y los demás métodos piden "editar". `/api/direccion/socios*` pide `direccion-socios`, que es de solo lectura, así que solo admite GET. Por eso la escritura de la política vive en `/api/direccion/politica`.

---

## 7. Permisos

Los permisos están en `acceso.ts`, `permisos.ts` y `permisos-servidor.ts`.

| Módulo | Qué habilita |
|---|---|
| `direccion` | "ver" lee. "editar" deja anotar, asignar dueños, fijar metas y el colchón. El admin lo trae solo. |
| `direccion-socios` | Retiros y lo reservado. Tiene `exigeExplicito`: el admin **no** lo trae solo, y en Usuarios hay que tildarlo aunque la persona sea admin. Abrirlo exige **también** `direccion`. |

**En el servidor:**

- `sesionPaginaDireccion()` devuelve `{ conSocios, puedeEditar, … }` o null.
- `exigirSociosPagina()` redirige a `/direccion?motivo=sin-acceso` si falta el permiso.
- En las APIs, `exigirDireccionApi(nivel)` y `exigirSociosApi()`.

**En el cliente:** `useDireccion().conSocios` y `puedeEditar` sirven solo para **armar** la UI, por ejemplo para no mostrar un botón. No protegen nada.

**En Supabase:** la RLS de la migración usa `dir_puede_ver()`, `dir_puede_editar()` y `dir_es_socio()` (este último sin el atajo de admin). Snapshot, notas, dueños, metas y avisos tienen la columna `reservado` y la misma regla: `NOT reservado OR dir_es_socio()` para leer y escribir.

**Quién da Socios.** Sólo alguien que **ya tiene** `direccion-socios` puede darlo o sacarlo (`acceso.ts` → `motivoRechazoExplicitos`, chequeado en `POST /api/usuarios` y `PATCH /api/usuarios/:id`). Ser admin no alcanza. Única excepción, el arranque: mientras nadie lo tenga, un admin puede darlo la primera vez. Cada cambio queda en `direccion_auditoria` con quién lo hizo (`permiso_socios`), y la base registra además cualquier cambio venga de donde venga (trigger, `permiso_socios_base`).

**Lo reservado de lo que se guarda lo decide el servidor.** Una nota es reservada si la decisión es de socios o si quien anota es socio y está viendo la versión de socios (la cobertura con retiros); la marca sale de La semana sin recortar (`decisiones.ts` → `reservaDeNota`), no del navegador. El dueño de una decisión de socios también va reservado. La meta de "retiros" va reservada (y la migración lo exige con un CHECK).

**Lo que no es dato también se cuida.** La definición completa de Retiros (cuentas y método) está en `diccionario-socios.ts`, que sólo lee el servidor y pasa al `DireccionProvider` de quien tiene Socios; `diccionario.ts` (que baja el navegador) tiene sólo el nombre. Sin Socios, el número de los comprobantes de los diarios sin documentos fiscales ("1/2026/00314" de Facturación No ARCA, "BILL1/…" de Compras No ARCA) se cambia por "Comprobante" en pantallas y desgloses (`ocultarCircuitos`, `reservado.ts`).

---

## 8. Caché y snapshot

**Caché.** `obtenerPantalla` cachea 10 minutos por pantalla, con la clave `hoy` + parámetros y el tag `direccion:<pantalla>`. Los parámetros se normalizan antes (`params.ts`: el período de Ventas en su forma única; `desglose/contrato.ts` → `PARAMS_NODO`: sólo claves conocidas con su formato), así un link raro no abre una entrada de caché ni una lectura a Odoo nueva. "Actualizar ahora" invalida ese tag y el de La semana. Actualizar La semana invalida todo. Si necesitás cachear una lectura propia, como una lista grande que usan varios nodos:

```ts
import { cachePantalla } from "@/lib/direccion/cache";
const partidas = cachePantalla("cobranzas", "partidas", async (hoy: string) => leerPartidas(hoy));
// hoy y cualquier parámetro van como ARGUMENTOS (son la clave). Resultado JSON. Los errores no se cachean.
```

**Snapshot.** La tabla `direccion_snapshots` la escribe solo el cron. Se usa para tres cosas:

- Como primera lectura del día: si hay un snapshot de **hoy** de la pantalla (vista por defecto, sin parámetros) y nadie pidió "Actualizar ahora" después, se usa ese y no se va a Odoo (`servidor.ts`, `snapshotVigente`). Después de un "Actualizar ahora" (queda en `direccion_auditoria`), esa pantalla se calcula en vivo el resto del día.
- Como respaldo cuando Odoo no responde (`ultimoSnapshot`).
- Como historia para las comparaciones (`historiaCifra`).

Si un resultado trae algo reservado, se guardan dos filas `*`: la completa con `reservado = true` y otra recortada. Así la RLS no deja leer retiros a quien no tiene Socios ni consultando la tabla directo.

Sin la tabla, ambas devuelven vacío y nada se rompe.

**Odoo Online limita la concurrencia.** El cliente ya hace cola (4 llamadas a la vez) y corta a los 45 segundos. Preferí `read_group` y `formatted_read_group` antes que traer miles de líneas, y `searchReadTodo` para paginar.

---

## 9. Formato y componentes

**Funciones de formato** (`src/lib/direccion/formato.ts`):

| Función | Qué hace |
|---|---|
| `fmtMon(v, "USD")` | `USD 422 k`, `USD 1,56 M`, `ARS 682,3 M`. Si falta el valor, `Sin dato`. |
| `mon(monto, ctx)` | Formatea en la moneda del contexto. Un período usa el dólar de cada documento; un saldo, el de hoy. |
| `unidad(regla, moneda)` | El texto que va debajo de cada cifra, por ejemplo "USD · con IVA · dólar de hoy". |
| `chip(comparacion)` | `▲ 12 % a igual día sep`. El color sale de la polaridad. Menos de 3 % es ≈. Sin dato, el chip va punteado. |
| `marca(nivel, motivo)` | La marca de confianza: ✓ Confiable, ⚠ A verificar o ◐ Incompleto. |
| `textoCierre` / `estadoCierre` | El control "Total = la cifra ✓". |
| Fechas | `hoyBA`, `fcorta`, `flarga`, `fdia`, `lunesDe`, `textoSemana`, `mesNombre`, `instanteCorto`. |
| `nombreLindo` | Pasa nombres en mayúsculas a formato normal. |

**Componentes** (`@/components/direccion`):

| Componente | Para qué |
|---|---|
| `TarjetaPregunta` | Tarjeta de La semana. Pasa sola a la variante compacta en el celular. |
| `TarjetaPreguntaCompacta` | La variante de una fila, forzada. |
| `TarjetaCifra` y `FilaCifras` | La fila de cifras de las pantallas de detalle. |
| `BotonDefinicion` / `DefinicionIndicador` | La (i): popover de 400 ms en escritorio y hoja chica en el celular. |
| `PanelDesglose` | Ya lo monta el layout. |
| `BarraTramos` | La antigüedad apilada. |
| `Ranking` | Las barras horizontales. |
| `EstadoVacio` | El estado vacío. Con `positivo` muestra "Nada para decidir ✓". |
| `BandaOdooCaido` | La banda de Odoo caído. |
| `ChipComparacion`, `MarcaConfianza`, `PuntoMeta`, `ValorCifra` | Piezas chicas. `PuntoMeta` solo aparece si hay meta. |
| `TextoFrase` | Una `Frase` con cifras tocables, para la narrativa, las decisiones y los avisos. |

**Hooks:** `useFormato()`, `useDireccion()` y `useMoneda()`.

**Tokens:** usá los de la app vía `direccion.css`: `bg-(--dir-bien-bg) text-(--dir-bien)`, más `--dir-aten*`, `--dir-mal*`, `--dir-neutro-*`, `--dir-serie` y `--dir-entra`. El coral (`primary`) significa "ahora" o "acción", nunca "mal". Las cifras van siempre en el color del texto.

**Celular** (menos de 768 px):

- Las tablas pasan a filas de tarjeta.
- Los objetivos táctiles miden 44 px o más.
- No hay scroll horizontal de página.
- El layout ya deja lugar para la barra inferior.

---

## 10. Antes de abrir el PR

- [ ] La pantalla se ve y se comporta como la maqueta, en USD y en ARS, a 1440 y a 375 px, en claro y en oscuro.
- [ ] Cada cifra de la tarjeta abre su desglose y el desglose cierra con "Total = la cifra ✓", en las dos monedas.
- [ ] Sin `direccion-socios`, la respuesta de tu API no contiene retiros, dividendos ni circuitos de facturación. Para verificarlo, mirá el JSON.
- [ ] Ningún `0` aparece en lugar de un dato que falta.
- [ ] `npm test` y `npx tsc --noEmit` pasan.
- [ ] No hay commits a main, push, migraciones aplicadas ni deploy: eso lo hace quien integra.

---

## 11. Qué quedó construido

- **Las 7 pantallas** de la maqueta (La semana, Caja, Ventas, Cobranzas, En la calle, Socios 🔒, Datos y definiciones), con la narrativa, "Para decidir", los avisos de calidad, el desglose de cada cifra hasta Odoo ("Total = la cifra ✓") y el modo reunión.
- **Lectura de Odoo de verdad sólo lectura** (`odoo-lectura.ts`, lista permitida + `guardia.test.ts`).
- **Cálculo en vivo con caché de 10 min** y "Actualizar ahora" (1 cada 5 min por persona y pantalla). Snapshot nocturno 04:30 (`/api/cron/direccion`) como primera lectura del día, respaldo e historia, si la tabla existe.
- **Lo propio en Supabase**: notas ("Anotar"), dueños, metas, colchón mínimo, escenario, clasificación de Cobranzas, avisos manuales, política de retiros (pendiente de que la definan los socios) y la auditoría. Sin la migración, todo eso contesta "Todavía no se puede guardar…" y la pantalla sigue andando.
- **Permisos**: `direccion` (ver / editar) y `direccion-socios` (exige permiso explícito, ni el admin lo trae), chequeados en proxy, server components, APIs y RLS.

## 12. Decisiones tomadas en la revisión (auditorías de seguridad y de números)

**Seguridad**

| Hallazgo | Qué se hizo |
|---|---|
| A1 · un admin podía darse Socios | Sólo quien ya tiene Socios lo da o lo saca (salvo el arranque); registrado en la auditoría por la API y por un trigger de la base. El trigger **no bloquea**: los permisos sólo se escriben con la service role, así que la base no sabe qué persona hizo el cambio; lo que garantiza es que ningún cambio pase sin rastro. |
| M1 · metas y dueños reservados por la API y la RLS | Columna `reservado` en `direccion_metas` y `direccion_duenos` con la regla de las notas; `/api/direccion/propios` filtra como las páginas (`propiosParaUsuario`, `metasVisibles`). |
| M2 · el servidor confiaba en el `reservado` del cliente | Lo decide el servidor desde La semana sin recortar (`reservaDeNota`, `reservaDeDueno`); el body ya no lo acepta. La decisión tiene que existir (409 si se cerró). |
| M3 · circuitos de facturación por el número de comprobante | Sin Socios, el número de los diarios sin documentos fiscales se reemplaza por "Comprobante" (monto, cliente y fecha quedan, los totales cierran). Incluye Compras No ARCA. **A confirmar con los socios** si alcanza o prefieren ocultar más. |
| B1 · URL y errores crudos de Odoo al navegador | `motivoPublico()`: texto fijo; el detalle va al log. También en La semana y en las lecturas secundarias de Cobranzas. |
| B2 · snapshot menos estricto que la pantalla | Misma regla: marca, variante de socios o indicador reservado. |
| B3 · auditoría escribible por cualquiera | Sin INSERT para usuarios: la escribe el servidor (service role). `accion` acotada con un CHECK. |
| B4 · parámetros arbitrarios = lecturas nuevas a Odoo | Desglose: sólo claves conocidas con formato (`PARAMS_NODO`; un test controla que toda clave usada esté declarada). Ventas: el período se normaliza a su forma única. Se hizo con una tabla central en vez de una declaración por nodo: mismo efecto, un solo lugar. |
| B5 · definición de Retiros en el JS | Separada en `diccionario-socios.ts` (sólo servidor); verificado que no aparece en `.next/static`. |
| B6 · validaciones menores | `dueno` de las notas con `z.enum`; secreto del cron con `timingSafeEqual`. |

**Números**

| Hallazgo | Qué se hizo |
|---|---|
| P1 · abono de S00128 con dos meses | Dentro del lote, el mismo canon numerado ("Etapa 2 - Mes 2" y "Mes 3": mismo producto y descripción salvo el número) cuenta sólo el **último** mes. Abono en la calle 263,9 M (antes 277,9 M); Copimex 11,5 %. El auditor estimó 263,6 M tomando el "Mes 2"; se eligió el último mes porque es la tarifa vigente (la regla general del abono es "la última renovación"): la diferencia es 0,3 M. |
| P2 · falso "¿duplicada?" del Ministerio | Un grupo "mismo día e importe" no se avisa como duplicado si hay NC del mismo cliente, dentro de 10 días, que anulan otras facturas, al menos una por factura del grupo. En su lugar: "FA-B 585 y 586 (08/10) reemplazan a 513 y 583, anuladas con nota de crédito… Confirmar los períodos antes de reclamar." (como `ministerio_585` de la maqueta). |
| P2 · Ventas no avisaba la cuota faltante de septiembre | Aviso nuevo "cuota salteada": cliente que factura todos los meses, un mes cerrado sin factura y dos o más después. Contra Odoo sale sólo el Ministerio (septiembre, ~28,4 M). No corrige el número. |
| P3 · cifras distintas entre pantallas | Calidad toma de En la calle "armados o pendientes de desarme devueltos" (82) y "sin fin estimado" (85); el IIBB faltante usa una sola regla para Ventas y Calidad (`iibbFaltante`: promedio de hasta 3 meses, ~16,1 M); Borelli se mide sobre "toda la plata" de Caja (40 %) en los dos lados. |

## 13. Desvíos respecto de la maqueta

- **Abono en la calle** 263,9 M contra 253,9 M de la maqueta: la etapa 2 de Copimex se facturó el 15/10, después del snapshot (+13,7 M), y la deduplicación por obra saca S01425 y S02116 (−3,9 M).
- **Contratos en la calle** 121 contra 123, y **devolución vencida** 25 / 101 M contra 26 / 103,5 M: misma deduplicación (la maqueta no la hacía).
- **Por cobrar, facturado de octubre y flujo de la semana 1** distintos del snapshot por facturas cargadas el 15/10 (Copimex FA-A 1184, All Flags, Rilco). Verificado al peso contra Odoo.
- **IIBB faltante** se estima con el promedio (no la mediana) en todas las pantallas: ~16,1 M, como la maqueta (~16 M).
- **Comprobantes del circuito reservado** se ven como "Comprobante" para quien no es socio (la maqueta no distinguía).
- **"vs lunes" / "vs semana"** dicen "Sin dato" hasta que haya historia guardada por el cron.

## 14. Pendientes

- **Para decidir con los socios:**
  - Si ocultar el número de comprobante alcanza para los circuitos (M3) o prefieren otra cosa.
  - Si los "sueldos no registrados" del flujo de Caja (`flujo.supuestos.noRegistradosMes`) cuentan como contingencia. Hoy los ve todo el que tiene Dirección. Si se reservan, hay que hacerlo con dos versiones del flujo (como los retiros), porque el total los delata.
  - Modo reunión: un socio que presenta ve la cobertura con retiros. Si se proyecta frente a alguien sin Socios, definir qué se muestra.
  - La política de retiros (la pantalla la espera vacía).
  - Si la "Reclasificación temporal" entra en Socios.
  - La vida útil de los andamios (10 años de referencia) con el contador.
- **Técnicos:**
  - Revisión en el navegador con sesión (1440 y 375 px, claro y oscuro) — no se hizo.
  - El cron no se probó contra la base (la migración no está aplicada).
  - Ventas tarda ~49 s la primera vez sin caché; con el snapshot de las 04:30 la primera lectura del día no va a Odoo.
  - Guardar el escenario por defecto de Caja.
  - Recomendado (no bloquea): un usuario de Odoo de solo lectura para Dirección, además de la lista permitida en el código.
  - `npm run lint` marca 76 problemas viejos fuera de Dirección (los archivos de Dirección, auth y usuarios están limpios).

## 15. Checklist para subir a producción

En este orden. Nada de esto lo hizo el equipo de desarrollo: lo hace quien integra.

1. **Aplicar la migración** `supabase/migrations/20261015000006_direccion.sql` en Supabase (crea las tablas, la RLS, las funciones de permiso y el trigger que registra quién recibe Socios). Es idempotente y la app anda antes y después:
   `npx supabase db query --linked -f supabase/migrations/20261015000006_direccion.sql` (nunca `db push`), o pegarla en el SQL Editor de Supabase.
2. **Variables de entorno:** no hay nuevas. Dirección usa las que ya existen (`ODOO_URL`, `ODOO_DB`, `ODOO_UID`, `ODOO_USERNAME`, `ODOO_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`). Confirmar que `CRON_SECRET` esté cargada en Vercel para Production (sin ella el cron rechaza todo, a propósito). El cron nuevo (`/api/cron/direccion`, 07:30 UTC = 04:30 BA) ya está en `vercel.json`.
3. **Push de la rama `feat/direccion`** para que Vercel arme el preview.
4. **Asignar los módulos a Joaquín, Jorge, Gabriel y Juan Pablo**, desde el **preview** (Configuración › Usuarios), no desde producción: la versión de producción todavía no conoce los módulos de Dirección y, si se edita a una de esas personas ahí, los borra al guardar.
   1. Joaquín se edita a sí mismo primero: **Dirección = Editar** y **Dirección · Socios = Ver** (aunque sea administrador, Socios hay que tildarlo). Es el arranque: mientras nadie tenga Socios, un admin lo puede dar.
   2. Con Joaquín ya socio, él tilda lo mismo a Jorge, Gabriel y Juan Pablo (si alguno no tiene cuenta, "Nuevo usuario" con su mail).
   3. Desde ese momento, Socios sólo lo da o lo saca alguien que ya lo tiene.
5. **Probar en el preview** (con uno de los cuatro y, si se puede, con un usuario de prueba con Dirección pero sin Socios):
   - Las 7 pantallas cargan; los números del día coinciden con Odoo (Caja 681,7 M, abono en la calle ~264 M, por cobrar ~498 M al 15/10).
   - Cada cifra abre su desglose y cierra "Total = la cifra ✓", en USD y ARS.
   - "Anotar", asignar dueño, fijar una meta y el colchón guardan y quedan al recargar.
   - "Actualizar ahora" funciona y la segunda vez antes de 5 min avisa que hay que esperar.
   - Sin Socios: no aparece la pestaña, `/direccion/socios` vuelve a La semana, `/api/direccion/socios` da 403, el JSON de `/api/direccion/caja` y `/api/direccion/semana` no tiene retiros ni "1/2026/…", y no puede darse Socios desde Usuarios.
   - Celular (375 px) y modo oscuro.
   - En Supabase: `direccion_auditoria` tiene las aperturas de Socios y los cambios de permiso.
6. **Merge a `main`.** Al día siguiente, confirmar que el cron de las 04:30 guardó filas en `direccion_snapshots` (log de Vercel: `[cron direccion] …: ok`).

