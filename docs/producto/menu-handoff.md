# Handoff: rediseño del menú lateral (actualizado 2026-10-12)

Para retomar en una sesión nueva: "Leé docs/producto/menu-handoff.md y seguimos con el menú".

**Estado: análisis hecho, sin código.** El 12/10 cuatro agentes revisaron el menú lateral: arquitectura de
información, UI visual, roles y tareas, y textos. Lo confirmado está marcado con ✔︎; el resto viene de
los agentes y conviene mirarlo antes de tocar código. Todo se leyó en `main` (esta rama, `docs/partes-rediseno`,
está atrasada: por ejemplo, no tiene Organigrama en el menú).

Archivos clave:
- `src/lib/constants/navigation.ts`: el menú y `navegacionPara`, que filtra por rol.
- `src/lib/auth/acceso.ts`: los módulos (`MODULOS`, con `grupo`), los perfiles (`PERFILES`) e `inicioDe`.
- `src/components/layout/app-sidebar.tsx`: el componente.
- `src/components/layout/command-search.tsx`: ⌘K.
- `src/components/layout/header.tsx`: el avatar.
- `src/lib/alertas/servicio.ts`: el destinatario de las alertas.

---

## 1. Lo que está mal

1. ✔︎ **Los perfiles por defecto no coinciden con el trabajo de cada rol** (`acceso.ts`, `PERFILES`, ~l.150-172):
   - **Oficina** (`operativo`) no tiene `hoja-dia`, que es un módulo aparte (`acceso.ts:51`). Su pantalla
     de todos los días no le aparece salvo que se la den a mano.
   - **Comercial** no tiene `asistente` ni `clientes`.
   - **Depósito** y **Campo** usan `CIRCUITO` (planificación, OT y partes en editar). Depósito no ve
     Pañol, Stock ni Remitos. Campo puede mover el tablero, cuando en realidad solo declara partes, y el
     capataz trabaja desde `/h/[token]` y Telegram, no desde el menú.
   - Esto afecta a los usuarios que se crean a partir del perfil. **Falta revisar los usuarios ya
     existentes** en Configuración › Usuarios.
2. ✔︎ **La Hoja del día queda escondida.** Es un sub-ítem de Planificación y los sub-ítems solo se
   muestran con el padre activo (`app-sidebar.tsx`, `item.subItems && isActive`). El ⌘K no la encuentra
   porque aplana solo `group.items`, sin sub-ítems.
3. ✔︎ **Aparecen dos ítems activos a la vez.** En `/planificacion` se marcan Planificación y Tablero. El
   `text-primary` del `cn` lo pisa `data-active:text-sidebar-accent-foreground` de shadcn, así que el
   activo se distingue del hover solo por el fondo.
4. **El menú no entra en la pantalla.** Mide unos 1.250px; en 768px de alto, Organigrama y Sistema quedan
   abajo, fuera de vista.
5. **Configuración lleva a dos lugares distintos.** El ítem abre el primer sub-ítem (Cuadrillas), pero
   `/configuracion/page.tsx` redirige a Agentes IA.
6. **Los textos no siguen una regla.** Faltan tildes en Planificación, Órdenes, Depósito y Logística,
   Oficina Técnica, Gestorías, Cómputos, Catálogo, Vehículos y Configuración. Las mayúsculas se mezclan
   ("Mapa de Obras" contra "Informes de obra").
7. **El badge de Partes lo ve todo el mundo.** Cuenta las jornadas sin parte de toda la empresa y le llega
   a cualquiera que pueda abrir `/partes`, incluso Depósito y Campo. El blanco sobre coral da ~3,9:1 y no
   pasa AA. En modo íconos queda recortado.
8. **Las alertas sin destinatario van al rol `operativo`** (`alertas/servicio.ts:~125`). Depósito, Campo
   y Comercial casi nunca reciben nada en la campanita.
9. **Falta `aria-current="page"`** en los botones del menú.
10. **Detalles chicos:**
    - El botón "Perfil" del avatar (`header.tsx:~105`) no hace nada.
    - El placeholder del ⌘K ofrece "cotizaciones", que no existen.
    - El ⌘K carga solo 10 clientes.

## 2. Lo que se podría mejorar

- **Grupos de un solo ítem:** Gestorías (Permisos de andamio) y Oficina Técnica (Cómputos).
- **Cuadrillas** está en Configuración, pero va con Legajos.
- **Lo que se toca de vez en cuando ocupa lugar entre lo diario:** Parámetros de cotización está en
  Comercial y Catálogo de piezas en Depósito. Los dos van a Configuración, junto a Lista de precios y
  Fletes.
- **Alertas** está en "Sistema", pero lo usa todo el mundo. O sube a lo diario o se saca, porque la
  campanita ya cumple ese papel.
- **Íconos:**
  - Inspecciones `Search` → `ClipboardCheck`.
  - Catálogo `Wrench` → `LayoutGrid`/`BookOpen`.
  - Movimientos → `ArrowLeftRight`.
  - Clientes `Users` → `Briefcase`/`Contact`, para que no se confunda con Legajos.
  - Solicitudes extra → `FilePlus2`, para que no se confunda con Stock.
  - Imports sin usar: `Building`, `Truck`, `MessageSquare`.
- **El hover expande el sidebar** (`onMouseEnter`/`setOpen` en `app-sidebar.tsx`), empuja el layout y
  pisa la cookie de ⌘B. Sacarlo y poner `<SidebarRail />`.
- **No hay pie:** sumar un `SidebarFooter` con el avatar, el nombre y el rol, Cerrar sesión y la versión.
- **Densidad:** labels `h-6`, grupos `py-1`, ítems `size="sm"`. El header (`text-xl py-4`) está pesado.
- **En mobile** el Sheet no se cierra al navegar.
- **Seis pantallas sin tocar desde el MVP del 30/03:** Stock, Movimientos, Incidentes, Inspecciones,
  Vehículos y Solicitudes extra. Son un tercio del menú: se pueden mandar a un grupo "Más" o esconder
  hasta que se usen.
- **Rutas sin ítem en el menú** (revisar si alguna debería tenerlo): `/permisos-via-publica/seguimiento`
  (el comentario de `app-sidebar.tsx` lo da por ítem) y `/fichadas/escanear` y `/qr`.

## 3. Menú propuesto

```
HOY            Planificación · Hoja del día · Partes (badge) · Alertas
COMERCIAL      Asistente comercial · Clientes
OBRAS          Obras · Órdenes de trabajo · Cómputos · Habilitaciones ·
               Permisos de andamio · Mapa de obras · Informes de obra
CAMPO          Solicitudes extra · Incidentes · Inspecciones
DEPÓSITO       Stock · Movimientos · Remitos · Pañol
PERSONAL Y     Legajos · Cuadrillas · Fichadas · Vehículos · Organigrama
FLOTA
CONFIGURACIÓN  (colapsable, cerrado) Parámetros de cotización · Catálogo de piezas ·
               Lista de precios · Fletes por zona · Imágenes de referencia · Agentes IA ·
               Datos de la empresa · Usuarios
```

Las rutas no cambian, solo dónde aparece cada ítem. Mover Parámetros o Cuadrillas no cambia los
permisos, porque el filtro va por ruta.

**Regla de textos:**
- Mayúscula solo en la inicial, también en grupos y sub-ítems.
- Todas las tildes.
- El ítem del menú y el título de la pantalla dicen lo mismo.
- Se usa la palabra que se dice en la empresa.

Cambios de nombre sugeridos:
- "Datos empresa" → "Datos de la empresa".
- "Imágenes referencia" → "Imágenes de referencia".
- "Partes de Obra" → "Partes".
- "Legajos" y la pantalla "Personal": elegir uno solo.
- "Habilitaciones" podría ser "Habilitaciones de ingreso", porque se confunde con las habilitaciones de
  operarios.

## 4. Orden para hacerlo

1. **Perfiles** en `acceso.ts`:
   - Oficina: + `hoja-dia`.
   - Comercial: + `asistente` y `clientes`.
   - Depósito: `panol`, `stock`, `remitos` y `hoja-dia` en ver.
   - Campo: solo `partes`, y planificación en ver.
   - Antes de cambiarlos, preguntarle a JS. Después revisar los usuarios existentes.
2. **Reordenar el menú** (`navigation.ts`):
   - La Hoja del día pasa a ítem de primer nivel. Sacar los sub-ítems de Planificación y la lógica que
     reemplaza el link del padre en `navegacionPara`.
   - En el mismo cambio: las tildes y mayúsculas, el doble activo, el ⌘K con sub-ítems y que
     Configuración y `/configuracion` lleven al mismo lugar.
   - **Ojo:** actualizar también el `grupo` de cada módulo en `MODULOS` (`acceso.ts`) y su orden. Si no,
     la pantalla de Usuarios queda desordenada respecto del menú.
3. **Pulido visual:** densidad, íconos, pie, contraste y punto del badge en modo íconos, sacar la
   expansión con el hover y `aria-current`.
4. **Badges y alertas por destinatario:** el badge de Partes solo para quien valida, una sugerencia de
   badge "falta mandar" en la Hoja del día y las alertas según el módulo, no al rol `operativo`.
5. **Más adelante, una home "Mi día" por rol:** filas con contador que llevan directo a cada tarea, por
   ejemplo "Hoja de mañana: falta mandar · 3 choques" o "15 partes por validar". El dashboard viejo se sacó
   el 26/09 porque era genérico (ver `inicioDe` en `acceso.ts`); uno armado según el trabajo de cada rol
   es otra cosa.

## 5. Preguntas abiertas para JS

- ¿Los perfiles nuevos son los que corresponden? En particular, ¿Depósito ve la Hoja del día?
- ¿Las pantallas del MVP sin uso (Incidentes, Inspecciones, Vehículos…) se esconden o se quedan?
- ¿"Legajos" o "Personal"?
- ¿Alertas se queda en el menú o alcanza con la campanita?
