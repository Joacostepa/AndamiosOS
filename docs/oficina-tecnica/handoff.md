# Handoff: Oficina Técnica y diseñador 3D (actualizado 2026-10-12)

Para retomar en una sesión nueva: "Leé docs/oficina-tecnica/handoff.md y seguimos con el diseñador 3D".

**Estado: en pausa.** El 12/10 JS decidió no hacer nada por ahora. Este documento junta el relevamiento y
la propuesta para tomarla cuando haga falta. No se tocó código.

---

## 1. De dónde viene

- **App aparte "Oficina Técnica ABA":** repo `Joacostepa/oficina-tecnica-aba` (privado), clonado en
  `~/Desktop/oficina-tecnica-aba`, en producción en https://oficina-tecnica-aba.vercel.app/capacitacion.
  El último commit es del 16/06/2026.
- **Qué tiene:**
  - Next 16.2.7, Tailwind 4, Vitest y un Supabase propio con una sola tabla, `escenarios`.
  - **Núcleo de cálculo** en `src/lib/calc/`: 11 módulos (M01 clases de carga, M02 voladizo,
    M03 autoportancia, M04 patas de gallo, M05 anclajes, M06 diagonales, M07 tablones, M08 vigas,
    M09 ménsulas, M10 plataforma de carga, M11 fundaciones), más volúmenes. Es TS puro, sin React, y
    tiene 46 tests golden en verde. El contrato es `CalcModule<I,D>` → `{verdict, readouts, data, caveat}`
    y el catálogo se inyecta.
  - **Capacitación:** teoría + simulador interactivo por módulo, con diagramas SVG en pseudo-perspectiva
    (`src/lib/svg/scaffold-iso.tsx`). **No es 3D real** y cada diagrama está armado a mano en píxeles.
  - **Simulaciones:** se pueden guardar y comparar escenarios.
  - **Volúmenes:** volumen → peso → alquiler. La tarifa es placeholder.
  - **Materiales:** placeholder ("Próximamente").
  - **Falta:** evaluaciones, progreso por persona, constancias y contenido de montaje. Hoy sirve para
    formación conceptual, no para habilitar operarios.

## 2. Lo que se propuso (versión acotada, 12/10)

Una pantalla **Oficina Técnica › Diseñador** dentro de Andamios OS, **para la compu de la oficina, no
para el celular**:

1. **Datos simples:** largo de fachada, altura, profundidad (0,73/1,09), cubierta (nada, malla o lona) y
   terreno. Se precargan desde la venta en Odoo (`x_permiso_base/altura/metros_lineales/m2`).
2. **Vista 3D** del andamio con piezas Layher Allround. Se gira con el mouse y un clic sobre una pieza
   muestra su ficha.
3. **Veredictos en vivo** de los módulos que aplican (M03, M05, M11 primero). Lo que falla se marca en
   el 3D.
4. **Lista de materiales** contando las piezas del modelo, con su peso. Un botón la convierte en un
   cómputo (`computos` + `computo_items`).
5. **Imagen** del andamio para la propuesta comercial.

Estimación: **2–3 semanas** para fachadas rectas.

**Queda afuera por ahora:** capacitación y credenciales de operarios, "encontrá el error", AR, viento
animado, armado paso a paso, link al cliente, as-built y tablero de dirección. Los informes completos de
los agentes los proponían; se descartaron para no volar.

### Idea de arquitectura

Un solo modelo paramétrico del que sale todo:

```
ModeloAndamio (frentes, vanos de medidas STD, niveles, anclajes, terreno)
  → construir() → Pieza[] {id, tipo, ref, a, b, peso_kg}
      → render 3D (InstancedMesh por tipo de pieza)
      → cómputo (agrupar por ref → catalogo_piezas)
      → entradas de M01–M11 (adaptadores)
```

- **Dónde va:** `src/lib/tecnica/{calc,modelo}/`, todo puro y con tests `node --test`.
- **Stack 3D:** `three@0.186.1`, `@react-three/fiber@9.8.1` (pide React <19.4) y `@react-three/drei@10.7.9`.
  Se carga con `dynamic(..., { ssr:false })` desde un client component, igual que `mapa-obras`.
- **Piezas:** se modelan en código propio, porque Layher no publica glTF/IFC libres (la biblioteca Revit
  se pide por LayPLAN y no se puede redistribuir). No usar el logo Layher.
- **Precio:** el 3D **no pone precio**. Pasa cantidades y el precio sale de `src/lib/cotizador/`.

## 3. Problemas encontrados en el cálculo (arreglar al portar)

| Dónde | Problema |
|---|---|
| `m07-tablones.ts:11-12, 43-56` | Con clase 1, 5 o 6 todo da NaN y el veredicto sale **ok** |
| `m05-anclajes.ts:64` | Siempre da ok: nunca compara la carga por anclaje con la resistencia (600 kgf) |
| `m05-anclajes.ts:43` | `area / 4` con el 4 escrito a mano en lugar de `sepVertical_m` |
| `m09-mensulas.ts:92-96` | En compresión no hay límite de conexión: admite unos 2.400 kg por ménsula, un valor irreal |
| `m10-plataforma-carga.ts:52` | El momento de la bajada queda a la mitad (hay que confirmar la geometría) |
| `m02-voladizo.ts:12, 61` | `HT_NIVELES = 4` se usa como metros |
| `m03` / `m04` | La pirámide se resta de la esbeltez sin criterio normativo: con H 12, B 2,57 y patas de 2,57 pasa de 4,7 a 1,6 |
| `catalog/viento.ts` | Fuera de servicio 50 kg/m²; con CIRSOC 102 en Buenos Aires da ~126. Lona con Cf 1,0 no es conservador (~1,3) |
| `catalog/seguridad.ts` | Esbeltez interior 4, contra 3,5 de EN 1004. FS al vuelco: 1,5 en M02–M04 y 2 en M10 |
| `catalog/materiales.ts:55` | `Mref` del tablón es circular: es la demanda de clase 4, no el valor del ensayo INTI |
| General | Las entradas son índices sobre `STD`/`VARM` (si cambia el catálogo, se rompen los escenarios guardados), no hay validación de entradas y todo el catálogo está marcado como "representativo" |

`docs/specs/MODULOS.md` de ese repo ya no coincide con el código en M02, M03, M04 y M09.

## 4. Puntos de contacto con Andamios OS

- **Cómputos** (`/oficina-tecnica/computos`): ya existe. El diseño lo alimentaría y reemplazaría a
  `/api/ai/computo`, que adivina cantidades. La RLS de `computos` usa `get_user_role()` y está desalineada
  con los permisos por módulo.
- **`catalogo_piezas`:** espejo de Odoo, ya tiene `peso_kg`. Hace falta un mapeo de pieza Layher
  (tipo + largo) a código.
- **Remitos y `balance-material`:** el cómputo precargaría el remito de entrega.
- **Pañol:** solo insumos de anclaje y EPP. Las piezas del andamio van por remito (`docs/panol/modulo.md` §11).
- **Cotizador:** cotiza por m² de fachada, m.l. de bandeja o lista de piezas. La memoria de cálculo de
  más de 6 m ya está en la base.
- **Ojo con los nombres:**
  - "Habilitaciones" ya es la documentación de la OT; la habilitación de operarios necesitaría otro
    nombre (se propuso "Credenciales").
  - Para tablas nuevas usar el prefijo `tec_`, no `ot_`.
- **Junio:** se borró `proyectos_tecnicos` (`20260620000007_computo_directo_obra.sql`). Si alcanza con un
  diseño por obra, conviene agregar `configuracion jsonb` a `computos` en vez de crear una entidad nueva.

### Cuánto cuesta portar

- **El cálculo, ~1 día:**
  - copiar a `src/lib/tecnica/calc/`;
  - agregar la extensión `.ts` en los imports;
  - pasar los tests de Vitest a `node:test`.
- **Los diagramas y la capacitación, 3–5 días:** hay que adaptarlos a los tokens de Andamios OS, que
  tiene tema oscuro y DM Sans; la app de Oficina Técnica usa Poppins y el rojo `#AF2C19`.
- **No hay componentes UI en conflicto:** `components/ui` de Oficina Técnica está vacío.

**Aparte:** en esta Mac, `npm test` de Andamios OS falla con Node 22.16. Hace falta
`--experimental-strip-types` o subir Node a 22.18 o más.

## 5. Decisiones abiertas (JS)

1. Quién firma la memoria de cálculo y con qué matrícula. Sin firma, el semáforo es "predimensionado",
   no "verificación".
2. Pesos y códigos Layher reales para el catálogo.
3. Descartar la tarifa $/ton/mes de Oficina Técnica y usar el motor de Andamios OS (recomendado).
4. Diseño como columnas en `computos` o como entidad nueva.
5. Si la capacitación de operarios entra en algún momento y en qué formato.
6. Qué rojo y qué tipografía ABA quedan (`#AF2C19` + Poppins o `#D85A30` + DM Sans).
7. Dónde está el repo 52-Estimador-ABA (el motor `LineaBOM`), que no está en esta Mac.

## 6. Decidido

- (12/10) El 3D es una herramienta **de escritorio para Oficina Técnica**, no para el celular de obra.
  Calidad visual sin recortes; lo que sale hacia obra o el cliente va como imagen o PDF.
- (12/10) Por ahora no se hace nada.
