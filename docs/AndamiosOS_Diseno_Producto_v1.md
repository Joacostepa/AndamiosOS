# ANDAMIOS BUENOS AIRES — Diseño de Producto
## Sistema Operativo Central de Gestión

**Versión:** 1.0 — Documento Fundacional  
**Fecha:** Marzo 2026  
**Equipo:** Product / Operaciones / Arquitectura / UX / Datos / DBA / CTO

---

# 1. VISIÓN GENERAL DE LA APLICACIÓN

## 1.1 Qué tipo de sistema es

No es un CRM. No es un ERP genérico. No es una app de tareas.

**AndamiosOS** (nombre interno de trabajo) es un **sistema operativo de gestión de operaciones en campo** diseñado específicamente para empresas de alquiler, montaje y desmontaje de andamios y estructuras temporarias.

Es una plataforma vertical que unifica la cadena completa de valor operativo: desde que un cliente solicita un servicio hasta que el último metro de andamio vuelve al depósito, se controla, se registra y se cierra la operación.

## 1.2 Qué problema resuelve

Hoy la operación funciona con WhatsApp, Excel, planillas sueltas, memoria de las personas y papel. Eso genera:

- **Opacidad**: nadie tiene visión completa de qué pasa en cada obra, qué hay en depósito, qué está en tránsito.
- **Pérdida de materiales**: sin trazabilidad pieza por pieza, el material se pierde, se daña o no se devuelve, y nadie se entera hasta que es tarde.
- **Cuellos de botella ocultos**: obras esperando proyecto, proyectos esperando cómputos, depósito preparando algo que ya no se necesita.
- **Riesgo legal**: documentación vencida, permisos sin tramitar, personal no habilitado en obra.
- **Ineficiencia**: doble carga de datos, comunicación fragmentada, decisiones sin datos.

AndamiosOS elimina esos problemas convirtiendo la operación en un flujo digital trazable, con estados claros, responsables definidos y alertas automáticas.

## 1.3 Qué áreas unifica

| Área | Dolor actual | Solución |
|---|---|---|
| Comercial/Proyectos | Obras aprobadas sin seguimiento | Pipeline de obras con estados |
| Oficina Técnica | Proyectos en AutoCAD sin vínculo al sistema | Proyectos ligados a cómputos y planificación |
| Planificación | Agenda en cabeza del encargado | Calendario operativo centralizado |
| Depósito | No saber qué hay disponible | Stock en tiempo real con compromisos |
| Logística | Camiones sin agenda | Programación de entregas y retiros |
| Montaje/Desmontaje | Partes de obra en papel | Partes digitales con fotos y firmas |
| RRHH/Habilitaciones | Legajos en carpetas físicas | Base digital con alertas de vencimiento |
| Gestoría | Permisos sin tracking | Gestión de trámites con estados y vencimientos |
| Mantenimiento | Vehículos sin control | Agenda de mantenimiento con alertas |
| Dirección | Decisiones a ciegas | Dashboards operativos en tiempo real |

## 1.4 Nivel de complejidad

**Alto.** Estamos hablando de un sistema con ~25 módulos interconectados, ~15 roles diferenciados, flujos de aprobación multiétapa, trazabilidad de materiales, gestión documental con vencimientos, y uso en campo (celular, sin buena conexión).

No es un proyecto de 3 meses. Es un producto que se construye en fases durante 12-18 meses, con un MVP funcional en 2-3 meses.

---

# 2. MAPA COMPLETO DE MÓDULOS

## 2.1 Módulos Núcleo (Core)

### M01 — Obras / Proyectos

**Propósito:** Registro y ciclo de vida completo de cada obra o servicio.

Cada obra es la entidad central del sistema. Todo gira alrededor de ella: materiales, personal, permisos, partes, remitos.

**Información que maneja:**
- Datos del cliente y contacto en obra
- Dirección, zona, tipo de obra (construcción, fachada, industria, evento)
- Tipo de andamio requerido (multidireccional, tubular, colgante, etc.)
- Estado de la obra (ver sección 6)
- Fechas estimadas y reales (inicio, montaje, desarme, cierre)
- Documentación asociada (contrato, planos, fotos)
- Presupuesto vinculado (referencia, no gestión financiera completa)
- Condiciones especiales (acceso difícil, horario restringido, requerimientos de seguridad)

**Relaciones:** Cliente, Proyecto Técnico, Cómputo, Remitos, Partes de Obra, Personal asignado, Permisos, Incidentes.

### M02 — Clientes

**Propósito:** Base de datos de clientes con historial completo.

- Razón social, CUIT, domicilio fiscal
- Contactos (múltiples por cliente: comercial, técnico, en obra)
- Condición impositiva
- Historial de obras
- Documentación (constancia AFIP, seguro, ART del cliente cuando aplica)
- Notas comerciales
- Estado (activo/inactivo/moroso — dato informativo, no bloqueo financiero)

**Relaciones:** Obras, Remitos.

### M03 — Oficina Técnica / Proyectos Técnicos

**Propósito:** Gestión del diseño técnico de cada andamio a instalar.

Cuando una obra se aprueba comercialmente, Oficina Técnica debe producir el proyecto: relevamiento, planos, cálculos, especificaciones.

**Información:**
- Relevamiento (fotos, medidas, observaciones del sitio)
- Planos y documentos técnicos (archivos adjuntos: DWG, PDF)
- Tipo de sistema de andamio
- Altura, metros lineales, superficies
- Observaciones técnicas (interferencias, limitaciones, riesgos)
- Estado del proyecto (pendiente, en curso, en revisión, aprobado)
- Responsable técnico asignado
- Fecha de solicitud, fecha de entrega, plazo

**Relaciones:** Obra, Cómputo de materiales.

### M04 — Cómputo de Materiales

**Propósito:** Lista detallada de piezas y cantidades necesarias para ejecutar un proyecto.

El cómputo traduce el proyecto técnico en una lista de materiales concreta. Es el eslabón entre oficina técnica y depósito.

**Información:**
- Listado de ítems (pieza, cantidad requerida)
- Agrupación por tipo/categoría
- Verificación de disponibilidad contra stock
- Faltantes identificados
- Versión (los cómputos pueden actualizarse)
- Estado (borrador, verificado, aprobado, preparado)

**Relaciones:** Proyecto técnico, Stock, Preparación de pedido, Remito de salida.

### M05 — Planificación Operativa

**Propósito:** Calendario maestro de la operación: qué se monta, qué se desarma, qué se entrega, qué se retira, cuándo, con qué cuadrilla, con qué vehículo.

**Información:**
- Vista calendario (diaria, semanal, mensual)
- Tareas planificadas: montajes, desarmes, entregas, retiros, visitas técnicas
- Asignación de cuadrillas
- Asignación de vehículos
- Estado de cada tarea (planificada, confirmada, en ejecución, completada, reprogramada)
- Conflictos de recursos (cuadrilla o vehículo doble-asignado)
- Dependencias (no montar si no se entregó material)

**Relaciones:** Obras, Personal, Vehículos, Remitos, Partes de obra.

### M06 — Montajes y Desarmes

**Propósito:** Seguimiento específico de cada operación de montaje o desarme en obra.

- Obra asociada
- Tipo (montaje / desarme / parcial / modificación)
- Cuadrilla asignada (capataz + operarios)
- Fecha planificada vs. fecha real
- Duración (horas)
- Metros montados/desmontados
- Observaciones
- Fotos (antes, durante, después)
- Estado (pendiente, en curso, completado, con observaciones)
- Firma del cliente o responsable de obra

**Relaciones:** Obra, Personal, Partes de obra, Planificación.

## 2.2 Módulos de Logística y Materiales

### M07 — Depósito / Stock

**Propósito:** Inventario en tiempo real de todo el material de la empresa.

**Información:**
- Catálogo maestro de piezas (código, descripción, categoría, peso, sistema de andamio al que pertenece)
- Stock total por pieza
- Stock disponible (total — comprometido — en obra — en tránsito)
- Stock comprometido (asignado a cómputos aprobados pero aún no despachados)
- Stock en obra (por obra)
- Stock en tránsito (en camión)
- Stock dañado / en reparación
- Ubicación en depósito (sector/rack/posición — si se quiere llegar a ese nivel)
- Alertas de mínimo

**Vista clave:** Para cada pieza, poder ver en un vistazo:
```
Pieza: Marco 1.50m multidireccional
Total empresa: 800
En depósito: 340
Comprometido: 120
En obras: 310
En tránsito: 20
Dañado: 10
```

**Relaciones:** Cómputos, Remitos, Movimientos, Obras.

### M08 — Movimientos de Materiales

**Propósito:** Registro de cada movimiento de material: entrada, salida, transferencia, baja, ajuste.

Cada movimiento tiene:
- Tipo (salida a obra, retorno de obra, transferencia entre depósitos, baja por daño, ajuste de inventario)
- Origen y destino
- Piezas y cantidades
- Responsable
- Fecha y hora
- Remito asociado (si aplica)
- Observaciones

**Esto es el corazón de la trazabilidad.** Si sabemos cada movimiento, siempre podemos reconstruir dónde está cada pieza.

### M09 — Remitos

**Propósito:** Documento formal que respalda cada movimiento de material entre la empresa y una obra.

**Tipos de remito:**
- Remito de entrega (depósito → obra)
- Remito de retiro/devolución (obra → depósito)
- Remito de transferencia (obra → obra)

**Información:**
- Número (autoincremental, con prefijo por tipo)
- Obra destino/origen
- Fecha de emisión
- Detalle de piezas y cantidades
- Chofer / transportista
- Vehículo
- Receptor en obra (nombre, firma)
- Estado (emitido, en tránsito, recibido, con diferencia, cerrado)
- Observaciones / novedades
- Fotos del carga/descarga

**Flujo crítico:** Al recibir material en obra, el receptor puede marcar diferencias (faltantes, sobrantes, material dañado). Esto dispara un proceso de conciliación.

**Relaciones:** Obra, Movimientos, Stock, Vehículos, Personal.

### M10 — Entregas, Retiros y Devoluciones

**Propósito:** Programación y seguimiento de la logística de transporte.

- Programación de entregas (fecha, horario, obra, vehículo, chofer)
- Programación de retiros
- Seguimiento del estado (programado, en ruta, entregado, devuelto)
- Ventanas horarias (algunas obras solo reciben de 7 a 9)
- Restricciones de acceso (calles angostas, permisos de estacionamiento)
- Asociación con remitos

### M11 — Sobrantes en Obra

**Propósito:** Control de material que queda en obra sin usar después de un montaje.

Cuando se monta un andamio, puede sobrar material. Ese sobrante:
- Debe registrarse (qué piezas, cuántas)
- Puede quedar en obra (a cargo del cliente)
- Puede retirarse
- Debe reflejarse en el stock ("en obra" pero no instalado)

**Esto es un módulo que suele ignorarse y genera pérdidas grandes.**

### M12 — Solicitudes Extra de Material

**Propósito:** Cuando en obra se necesita material adicional no contemplado en el cómputo original.

- Quien solicita (capataz, supervisor)
- Obra
- Piezas y cantidades
- Motivo (error en cómputo, cambio de alcance, reemplazo de dañado)
- Urgencia
- Estado (solicitado, aprobado, rechazado, despachado, entregado)
- Aprobación requerida (jefe operativo o técnico)
- Impacto en stock

**Relaciones:** Obra, Cómputo, Stock, Remito.

## 2.3 Módulos de Personal y Documentación

### M13 — Base de Personal

**Propósito:** Legajo digital completo de cada persona.

- Datos personales (nombre, DNI, CUIL, domicilio, contacto de emergencia)
- Puesto / rol (operario, capataz, chofer, técnico, administrativo)
- Categoría / especialidad
- Fecha de ingreso
- ART
- Obra social
- Documentación cargada (DNI, alta AFIP, ART, cursos de altura, psicofísico)
- Estado de habilitación (habilitado / no habilitado / vencido)
- Disponibilidad
- Historial de obras asignadas
- Observaciones disciplinarias o de desempeño

### M14 — Habilitación de Personal para Obras

**Propósito:** Verificar que cada persona que va a una obra cumple con TODA la documentación exigida.

Antes de enviar personal a obra, el sistema debe verificar:
- DNI vigente ✓
- Alta en AFIP ✓
- ART vigente ✓
- Curso de trabajo en altura vigente ✓
- Examen psicofísico vigente ✓
- Seguro de vida ✓
- Elementos de protección personal (EPP) entregados ✓
- Inducción de seguridad de la obra ✓
- Cualquier requisito específico de la obra/cliente

**Regla del sistema:** No se puede asignar personal a una obra si tiene documentación vencida o faltante. El sistema lo bloquea y alerta.

### M15 — Legajos y Documentación

**Propósito:** Repositorio de todos los documentos con control de vencimiento.

- Carga de documentos (PDF, imagen)
- Tipo de documento
- Entidad asociada (persona, vehículo, empresa, obra)
- Fecha de emisión
- Fecha de vencimiento
- Estado (vigente, por vencer, vencido)
- Alertas automáticas (30, 15, 7 días antes del vencimiento)

### M16 — Permisos y Gestiones Municipales

**Propósito:** Seguimiento de trámites ante organismos (municipio, gobierno de la ciudad, etc.).

Muchas obras requieren permisos de ocupación de vía pública, habilitación de andamio, etc.

- Tipo de permiso
- Organismo
- Obra asociada
- Fecha de solicitud
- Fecha de otorgamiento esperada
- Fecha de vencimiento
- Estado (en trámite, aprobado, rechazado, vencido, renovación)
- Documentación presentada
- Costo del trámite
- Responsable del seguimiento
- Notas de seguimiento (historial de gestiones)

**Relación crítica:** Una obra no debería pasar a estado "lista para montar" si el permiso no está aprobado.

## 2.4 Módulos de Control y Seguimiento

### M17 — Partes de Obra / Partes Diarios

**Propósito:** Registro diario de lo que pasó en cada obra.

- Obra
- Fecha
- Cuadrilla (quiénes trabajaron)
- Horas trabajadas por persona
- Tarea realizada (montaje, desarme, modificación, reparación)
- Avance (metros montados, niveles, porcentaje)
- Material utilizado
- Observaciones
- Incidentes
- Fotos
- Condiciones climáticas (si afectaron el trabajo)
- Firma del capataz

**Esto alimenta métricas de productividad, costos por obra y control de horas.**

### M18 — Incidentes / Observaciones / Desvíos

**Propósito:** Registro de todo evento fuera de lo normal.

- Tipo (accidente, cuasi-accidente, daño de material, robo, reclamo de cliente, desvío operativo, observación de seguridad)
- Severidad (baja, media, alta, crítica)
- Descripción
- Obra / ubicación
- Personas involucradas
- Fotos / evidencia
- Acciones tomadas
- Acciones correctivas requeridas
- Estado (abierto, en investigación, cerrado)
- Responsable del seguimiento

**Esto es obligatorio para cumplimiento normativo y mejora continua.**

### M19 — Vehículos y Equipos

**Propósito:** Registro y control de la flota.

- Datos del vehículo (patente, marca, modelo, año, tipo)
- Seguro (vigencia)
- VTV (vigencia)
- Habilitación de CNRT (si aplica)
- Chofer habitual
- Capacidad de carga
- Estado (disponible, en ruta, en taller, fuera de servicio)
- Kilómetros / horas de uso

### M20 — Mantenimiento

**Propósito:** Programación y registro de mantenimiento de vehículos, equipos y herramientas.

- Entidad (vehículo, herramienta, equipo)
- Tipo (preventivo, correctivo)
- Frecuencia (km, horas, fecha)
- Próximo mantenimiento
- Historial de intervenciones
- Costo
- Proveedor / taller
- Estado (al día, próximo, vencido)

### M21 — Insumos y Herramientas

**Propósito:** Control de insumos consumibles y herramientas que no son piezas de andamio.

- Elementos de seguridad (cascos, arneses, líneas de vida, redes)
- Herramientas (llaves, niveles, taladros)
- Consumibles (grasa, pinturas, señalización)
- Stock mínimo y alertas
- Asignación a obras o personal
- Vencimiento de elementos de seguridad (arneses, líneas de vida)

## 2.5 Módulos de Inteligencia y Reporting

### M22 — Dashboards y Reportes

**Propósito:** Tableros de control y reportes operativos. Detallado en sección 7.

### M23 — Alertas y Notificaciones

**Propósito:** Motor de alertas centralizado. Detallado en sección 8.

## 2.6 Módulos Adicionales (detectados por el equipo)

### M24 — Presupuestos (referencial)

**Propósito:** No gestión financiera completa, sino vinculación entre el presupuesto aprobado y la obra.

- Número de presupuesto
- Monto (informativo)
- Ítems presupuestados (metros, meses, servicios)
- Estado (emitido, aprobado, rechazado, vencido)
- Vínculo con la obra

**Justificación:** Sin esta conexión, no se puede medir desvío entre lo presupuestado y lo ejecutado.

### M25 — Contratos / Condiciones de Servicio

**Propósito:** Registro de las condiciones pactadas con el cliente.

- Plazo del alquiler
- Condiciones de pago (referencial)
- Responsabilidades del cliente (custodia, no modificar andamio)
- Penalidades
- Renovaciones
- Vínculo con obra

**Justificación:** Cuando un cliente reclama, o cuando hay que facturar sobrantes, el sistema debe tener el marco contractual a mano.

### M26 — Inspecciones Periódicas

**Propósito:** Registro de inspecciones obligatorias de andamios montados.

Muchas normativas exigen inspecciones periódicas del andamio mientras está en uso. Este módulo registra:

- Obra
- Fecha de inspección
- Inspector (propio o tercero)
- Resultado (aprobado, observado, rechazado)
- Observaciones
- Fotos
- Próxima inspección requerida
- Acciones correctivas

**Justificación:** Responsabilidad civil. Si pasa algo y no hay registro de inspección, la empresa queda expuesta.

### M27 — Comunicaciones y Notas por Obra

**Propósito:** Historial de comunicaciones relevantes vinculadas a cada obra.

- Notas internas
- Registros de llamadas o acuerdos verbales con el cliente
- Pedidos especiales
- Cambios de alcance

**Justificación:** Reemplaza el "eso lo hablamos por WhatsApp" con un registro trazable.

### M28 — Auditoría (transversal)

**Propósito:** Log de todas las acciones del sistema.

- Quién hizo qué, cuándo, desde dónde
- Cambios de estado
- Ediciones de datos críticos
- Accesos

No es un módulo con pantalla propia sino una capa transversal. Pero dirección puede consultarla.

---

# 3. FLUJOS OPERATIVOS CLAVE

## FLUJO 1: Desde la aprobación de obra hasta "lista para ejecutar"

```
1. COMERCIAL crea la Obra (estado: PRESUPUESTADA)
   └─ Carga datos del cliente, dirección, tipo de servicio, presupuesto vinculado

2. Cliente aprueba → estado cambia a APROBADA
   └─ Se carga OC/contrato
   └─ ALERTA → Oficina Técnica: "Nueva obra aprobada requiere proyecto"

3. OFICINA TÉCNICA recibe la obra
   └─ Se asigna técnico responsable
   └─ Se programa relevamiento (si hace falta)
   └─ Estado del proyecto técnico: EN CURSO

4. Técnico realiza relevamiento
   └─ Sube fotos, medidas, observaciones al sistema
   └─ Elabora planos y proyecto

5. Proyecto técnico → estado: EN REVISIÓN
   └─ Jefe técnico revisa y aprueba (o devuelve con observaciones)
   └─ Estado: APROBADO
   └─ ALERTA → "Proyecto aprobado, generar cómputo"

6. Se genera CÓMPUTO DE MATERIALES
   └─ Sistema sugiere piezas del catálogo según tipo de andamio
   └─ Técnico ajusta cantidades
   └─ Estado: BORRADOR → VERIFICADO (cotejado con stock)

7. Si hay faltantes → ALERTA a dirección/compras
   └─ Si todo disponible → estado: APROBADO

8. GESTORÍA verifica permisos
   └─ Si requiere permiso municipal → estado: EN TRÁMITE
   └─ Cuando el permiso se aprueba → ALERTA

9. HABILITACIÓN verifica personal disponible habilitado
   └─ Si hay personal con docs vencidas → ALERTA y BLOQUEO

10. Cuando se cumplen TODAS las condiciones:
    ✓ Proyecto aprobado
    ✓ Cómputo aprobado y stock disponible
    ✓ Permiso aprobado (si aplica)
    ✓ Personal habilitado disponible
    ✓ Vehículo disponible
    → Estado de la obra: LISTA PARA EJECUTAR
    → ALERTA → Planificación: "Obra lista, programar montaje"
```

**Excepciones:**
- Cambio de alcance durante el proceso → nueva versión del cómputo
- Cliente cancela → estado CANCELADA con motivo
- Falta de stock crítico → se reprograma o se gestiona compra/préstamo

## FLUJO 2: Desde el cómputo hasta la preparación en depósito y entrega

```
1. Cómputo APROBADO genera automáticamente una ORDEN DE PREPARACIÓN
   └─ Lista de picking para depósito
   └─ Stock pasa de "disponible" a "comprometido"

2. DEPÓSITO recibe la orden de preparación
   └─ Estado: PENDIENTE DE PREPARACIÓN
   └─ Se asigna operario de depósito

3. Depósito prepara el material
   └─ Marca cada ítem como preparado
   └─ Si falta alguna pieza → ALERTA y nota de faltante
   └─ Estado: PREPARADO (o PREPARADO PARCIAL)

4. Se programa ENTREGA en Planificación
   └─ Se asigna vehículo y chofer
   └─ Se asigna fecha/horario
   └─ Se genera REMITO DE ENTREGA (estado: EMITIDO)

5. CARGA del vehículo
   └─ Se verifica lo cargado vs. remito
   └─ Fotos de carga
   └─ Estado del remito: EN TRÁNSITO

6. ENTREGA en obra
   └─ Receptor en obra verifica material
   └─ Firma digital o nombre del receptor
   └─ Si hay diferencias (faltante o sobrante vs remito) → se registra
   └─ Estado del remito: RECIBIDO / CON DIFERENCIA
   └─ Stock se actualiza: sale de "en tránsito", entra a "en obra"

7. Si hay DIFERENCIA → proceso de conciliación
   └─ Depósito y logística verifican
   └─ Se ajusta stock
   └─ Se cierra remito
```

## FLUJO 3: Desde pedido extra de material hasta su resolución

```
1. CAPATAZ en obra detecta necesidad de material extra
   └─ Crea SOLICITUD EXTRA desde el celular
   └─ Indica: piezas, cantidades, motivo, urgencia

2. ALERTA → Jefe operativo y/o técnico

3. Aprobador evalúa:
   └─ Si aprueba → se verifica stock
   └─ Si rechaza → se notifica al solicitante con motivo

4. Si hay stock → se programa despacho
   └─ Se genera remito complementario
   └─ Flujo normal de entrega

5. Si no hay stock → ALERTA a compras/dirección
   └─ Se evalúa transferencia desde otra obra o compra urgente

6. Material entregado → se cierra la solicitud
   └─ Queda vinculada a la obra para análisis de desvío
```

## FLUJO 4: Desde desarme hasta devolución total y cierre operativo

```
1. Se programa DESARME en Planificación
   └─ Asignación de cuadrilla y vehículo

2. Ejecución del desarme
   └─ Parte de obra: horas, personal, observaciones
   └─ Fotos del estado del andamio al desarmar
   └─ Registro de material dañado o faltante

3. CARGA del material para retiro
   └─ Se genera REMITO DE DEVOLUCIÓN
   └─ Detalle de piezas retornadas

4. RECEPCIÓN EN DEPÓSITO
   └─ Depósito verifica pieza por pieza contra remito
   └─ Clasifica: OK / dañado / faltante
   └─ Stock se actualiza
   └─ Piezas dañadas van a "reparación" o "baja"

5. CONCILIACIÓN de obra
   └─ Sistema compara: lo que se envió vs. lo que volvió
   └─ Diferencia = pérdida / daño → se registra como INCIDENTE
   └─ Si todo cuadra → CIERRE OPERATIVO de la obra

6. Estado de la obra: OPERATIVAMENTE CERRADA
   └─ Todos los remitos cerrados
   └─ Todo el material devuelto o contabilizado
   └─ Partes de obra completos
   └─ Sin incidentes abiertos
```

## FLUJO 5: Alta de personal hasta habilitación vigente

```
1. RRHH/Admin crea el legajo del empleado
   └─ Datos personales, puesto, categoría

2. Se carga documentación obligatoria:
   └─ DNI, alta AFIP, ART, seguro, curso altura, psicofísico, etc.
   └─ Cada documento con fecha de vencimiento

3. Sistema evalúa automáticamente:
   └─ Si toda la documentación está vigente → HABILITADO
   └─ Si falta algo → NO HABILITADO (con detalle de qué falta)
   └─ Si algo está por vencer → POR VENCER (alerta)

4. Al asignar personal a una obra:
   └─ Sistema verifica habilitación en tiempo real
   └─ Si no está habilitado → BLOQUEO con mensaje claro
   └─ Si está por vencer → ADVERTENCIA

5. ALERTAS automáticas:
   └─ 30 días antes de vencimiento → alerta a RRHH
   └─ 15 días → alerta a RRHH + jefe operativo
   └─ 7 días → alerta urgente
   └─ Día de vencimiento → bloqueo automático
```

## FLUJO 6: Vehículo — desde alta hasta mantenimiento

```
1. Se da de alta el vehículo con datos y documentación
2. Se cargan vencimientos: seguro, VTV, CNRT, etc.
3. Se define plan de mantenimiento preventivo (cada X km o cada X meses)
4. ALERTAS:
   └─ Documentación por vencer
   └─ Mantenimiento próximo
5. Al asignar vehículo a una tarea:
   └─ Sistema verifica que esté habilitado (docs vigentes, sin mantenimiento vencido)
   └─ Si no → BLOQUEO
6. Después de cada uso se puede registrar km/estado
7. Cuando toca mantenimiento → se registra intervención, costo, taller
```

---

# 4. ROLES Y PERMISOS DEL SISTEMA

## 4.1 Matriz de roles

| Rol | Descripción | Permisos principales |
|---|---|---|
| **Super Admin** | Dirección / dueño | Todo. Configura el sistema, usuarios, roles. |
| **Gerente Operativo** | Responsable de la operación general | Ve todo. Aprueba obras, cómputos, solicitudes extra. Accede a dashboards. |
| **Jefe Técnico** | Responsable de Oficina Técnica | Crea y aprueba proyectos técnicos y cómputos. Ve obras y stock. |
| **Técnico / Proyectista** | Elabora proyectos y cómputos | Crea y edita proyectos y cómputos asignados. No aprueba. |
| **Planificador** | Programa la agenda operativa | Crea y edita planificación, asigna cuadrillas y vehículos. Ve stock y obras. |
| **Jefe de Depósito** | Responsable de stock y despacho | Gestiona stock, preparación, recepción. Cierra remitos. Alerta faltantes. |
| **Operario de Depósito** | Ejecuta preparación y recepción | Marca preparación, registra recepción. No edita stock manualmente. |
| **Supervisor de Obra** | Controla ejecución en campo | Crea partes de obra, solicitudes extra, incidentes. Ve planificación y sus obras. |
| **Capataz** | Lidera cuadrilla en obra | Crea partes de obra desde celular, reporta incidentes, confirma tareas. |
| **Chofer** | Transporta material | Ve sus asignaciones del día, confirma entregas/retiros, sube fotos. |
| **Administrativo** | Back-office | Gestiona documentación, legajos, clientes. No accede a datos operativos sensibles. |
| **Gestoría** | Trámites y permisos | Gestiona permisos municipales, vencimientos de trámites. |
| **RRHH** | Recursos humanos | Gestiona legajos, habilitaciones, documentación de personal. |
| **Mantenimiento** | Controla flota y equipos | Gestiona vehículos, mantenimiento, insumos. |
| **Consulta** | Solo lectura | Ve dashboards y reportes, no edita nada. |

## 4.2 Principios de permisos

- **Por defecto, nadie ve nada.** Se habilita explícitamente.
- **Permisos por módulo y por acción** (ver, crear, editar, aprobar, eliminar/anular).
- **Filtro por alcance:** un capataz ve solo SUS obras asignadas, no todas.
- **Acciones críticas requieren confirmación:** anulación de remito, baja de stock, cierre de obra.
- **Auditoría completa** de quién hizo qué.

---

# 5. MODELO DE DATOS — ENTIDADES PRINCIPALES

## 5.1 Diagrama conceptual de relaciones

```
                    ┌──────────┐
                    │ CLIENTES │
                    └────┬─────┘
                         │ 1:N
                    ┌────▼──────┐        ┌──────────────┐
                    │   OBRAS   │───────▶│  CONTRATOS   │
                    └──┬──┬──┬──┘        └──────────────┘
                       │  │  │
          ┌────────────┘  │  └────────────────┐
          ▼               ▼                    ▼
  ┌───────────────┐ ┌───────────┐    ┌─────────────────┐
  │  PROYECTOS    │ │ PERMISOS  │    │ ASIGNACIONES    │
  │  TÉCNICOS     │ │ MUNICIPALES│   │ DE PERSONAL     │
  └───────┬───────┘ └───────────┘    └────────┬────────┘
          │ 1:N                               │
  ┌───────▼───────┐                   ┌───────▼────────┐
  │  CÓMPUTOS     │                   │   PERSONAL     │
  │  DE MATERIAL  │                   │   (legajos)    │
  └───────┬───────┘                   └───────┬────────┘
          │ 1:N                               │ 1:N
  ┌───────▼───────┐                   ┌───────▼────────┐
  │  ÍTEMS DE     │                   │  DOCUMENTOS    │
  │  CÓMPUTO      │                   │  (vencimientos)│
  └───────┬───────┘                   └────────────────┘
          │
  ┌───────▼──────────────────────────────────────────┐
  │              MOVIMIENTOS DE STOCK                 │
  │  (salidas, entradas, transferencias, ajustes)     │
  └───────┬──────────────────┬───────────────────────┘
          │                  │
  ┌───────▼───────┐  ┌──────▼───────┐
  │   REMITOS     │  │    STOCK     │
  │ (entregas,    │  │  (por pieza) │
  │  devoluciones)│  └──────────────┘
  └───────┬───────┘
          │
  ┌───────▼────────┐    ┌───────────────┐
  │  VEHÍCULOS     │    │ PARTES DE OBRA│
  └───────┬────────┘    └───────┬───────┘
          │                     │
  ┌───────▼────────┐    ┌──────▼────────┐
  │ MANTENIMIENTO  │    │  INCIDENTES   │
  └────────────────┘    └───────────────┘
```

## 5.2 Entidades principales y campos clave

### obras
```
id (UUID, PK)
codigo (varchar, único, ej: "OBR-2026-0142")
cliente_id (FK → clientes)
nombre (varchar)
direccion (varchar)
localidad (varchar)
provincia (varchar)
coordenadas (point, opcional)
tipo_obra (enum: construccion, fachada, industria, evento, especial)
tipo_andamio (enum: multidireccional, tubular, colgante, otro)
estado (enum — ver sección 6)
fecha_aprobacion (date)
fecha_inicio_estimada (date)
fecha_inicio_real (date)
fecha_fin_estimada (date)
fecha_fin_real (date)
presupuesto_id (FK → presupuestos, nullable)
contrato_id (FK → contratos, nullable)
responsable_comercial_id (FK → usuarios)
responsable_operativo_id (FK → usuarios)
observaciones (text)
condiciones_acceso (text)
horario_permitido (varchar)
created_at (timestamptz)
updated_at (timestamptz)
created_by (FK → usuarios)
```

### clientes
```
id, razon_social, cuit, domicilio_fiscal, telefono, email,
condicion_iva, contactos (jsonb — array de contactos),
estado (activo/inactivo), notas, created_at, updated_at
```

### proyectos_tecnicos
```
id, obra_id (FK), codigo, tecnico_asignado_id (FK → usuarios),
estado (enum), fecha_solicitud, fecha_entrega_estimada,
fecha_entrega_real, tipo_sistema_andamio, altura_maxima,
metros_lineales, superficie, observaciones_tecnicas,
archivos (relación con tabla de archivos), version (int),
aprobado_por_id (FK → usuarios), fecha_aprobacion,
created_at, updated_at
```

### computos
```
id, proyecto_tecnico_id (FK), version (int), estado (enum),
verificado_por_id, aprobado_por_id, fecha_verificacion,
fecha_aprobacion, notas, created_at, updated_at
```

### computo_items
```
id, computo_id (FK), pieza_id (FK → catalogo_piezas),
cantidad_requerida (int), cantidad_disponible_al_verificar (int),
notas
```

### catalogo_piezas
```
id, codigo (varchar, único, ej: "MF-150-MD"),
descripcion (varchar), categoria (enum), subcategoria,
sistema_andamio (enum), peso_kg (decimal), unidad_medida,
foto_url, activo (bool), stock_minimo (int)
```

### stock
```
id, pieza_id (FK, unique), total (int),
en_deposito (int), comprometido (int),
en_obras (int), en_transito (int),
danado (int), updated_at
```

### stock_por_obra
```
id, pieza_id (FK), obra_id (FK), cantidad (int),
cantidad_instalada (int), cantidad_sobrante (int)
```

### movimientos
```
id, tipo (enum: salida, entrada, transferencia, ajuste, baja),
pieza_id (FK), cantidad (int), obra_origen_id (FK, nullable),
obra_destino_id (FK, nullable), remito_id (FK, nullable),
motivo (text), responsable_id (FK → usuarios),
fecha (timestamptz), created_at
```

### remitos
```
id, numero (varchar, único), tipo (enum: entrega, devolucion, transferencia),
obra_id (FK), estado (enum), fecha_emision, fecha_recepcion,
chofer_id (FK → personal), vehiculo_id (FK),
receptor_nombre (varchar), receptor_firma_url (varchar, nullable),
observaciones, tiene_diferencia (bool), created_by, created_at, updated_at
```

### remito_items
```
id, remito_id (FK), pieza_id (FK),
cantidad_remitida (int), cantidad_recibida (int, nullable),
diferencia (int, computed), observacion
```

### personal
```
id, nombre, apellido, dni, cuil, fecha_nacimiento,
domicilio, telefono, email, contacto_emergencia_nombre,
contacto_emergencia_telefono, puesto (enum), categoria,
especialidad, fecha_ingreso, estado_habilitacion (enum: habilitado,
no_habilitado, vencido), art_empresa, obra_social,
disponible (bool), activo (bool), observaciones,
created_at, updated_at
```

### documentos
```
id, entidad_tipo (enum: personal, vehiculo, empresa, obra),
entidad_id (UUID), tipo_documento (enum: dni, art, curso_altura,
psicofisico, seguro_vida, vtv, seguro_vehiculo, cnrt, permiso_municipal, otro),
descripcion, archivo_url, fecha_emision, fecha_vencimiento,
estado (enum: vigente, por_vencer, vencido), alerta_enviada (bool),
created_at, updated_at
```

### vehiculos
```
id, patente, marca, modelo, anio, tipo (enum: camion, camioneta,
hidrogrua, utilitario, otro), capacidad_carga_kg,
estado (enum: disponible, en_ruta, en_taller, fuera_servicio),
km_actual, chofer_habitual_id (FK → personal, nullable),
activo (bool), observaciones, created_at, updated_at
```

### planificacion_tareas
```
id, tipo (enum: montaje, desarme, entrega, retiro, visita_tecnica,
inspeccion, otro), obra_id (FK), fecha_programada (date),
hora_inicio, hora_fin_estimada, cuadrilla (jsonb — array de personal_ids),
vehiculo_id (FK, nullable), estado (enum: planificada, confirmada,
en_ejecucion, completada, reprogramada, cancelada),
prioridad (enum: normal, urgente), observaciones,
created_by, created_at, updated_at
```

### partes_obra
```
id, obra_id (FK), fecha (date), tipo_tarea (enum),
cuadrilla (jsonb), horas_trabajadas (jsonb — por persona),
avance_descripcion, metros_montados (decimal, nullable),
material_utilizado (jsonb), observaciones, fotos (jsonb — array urls),
clima (varchar), firmado_por_id (FK → personal),
estado (enum: borrador, firmado, aprobado),
created_at, updated_at
```

### incidentes
```
id, obra_id (FK, nullable), tipo (enum), severidad (enum),
descripcion, personas_involucradas (jsonb),
fotos (jsonb), acciones_tomadas, acciones_correctivas,
responsable_seguimiento_id (FK → usuarios),
estado (enum: abierto, en_investigacion, cerrado),
fecha_cierre, created_at, updated_at, created_by
```

### permisos_municipales
```
id, obra_id (FK), tipo_permiso (varchar), organismo (varchar),
fecha_solicitud, fecha_otorgamiento, fecha_vencimiento,
estado (enum: en_tramite, aprobado, rechazado, vencido, renovacion),
costo (decimal), responsable_id (FK → usuarios),
documentacion (jsonb), notas_seguimiento (jsonb — array de notas con fecha),
created_at, updated_at
```

### solicitudes_extra
```
id, obra_id (FK), solicitante_id (FK → personal),
motivo (enum: error_computo, cambio_alcance, reemplazo_danado, otro),
urgencia (enum: normal, urgente, critica),
estado (enum: solicitada, aprobada, rechazada, despachada, entregada),
aprobador_id (FK → usuarios, nullable), remito_id (FK, nullable),
observaciones, created_at, updated_at
```

### solicitud_extra_items
```
id, solicitud_id (FK), pieza_id (FK), cantidad (int)
```

### mantenimientos
```
id, entidad_tipo (enum: vehiculo, herramienta, equipo),
entidad_id (UUID), tipo (enum: preventivo, correctivo),
descripcion, fecha_programada, fecha_realizada,
proximo_mantenimiento, costo (decimal), proveedor (varchar),
estado (enum: programado, realizado, vencido),
observaciones, created_at, updated_at
```

### audit_log
```
id, usuario_id (FK), accion (varchar), entidad_tipo (varchar),
entidad_id (UUID), datos_anteriores (jsonb), datos_nuevos (jsonb),
ip (varchar), timestamp (timestamptz)
```

---

# 6. ESTADOS Y TRAZABILIDAD

## 6.1 Estados por entidad

### Obra
```
PRESUPUESTADA → APROBADA → EN_PROYECTO → PROYECTO_APROBADO →
LISTA_PARA_EJECUTAR → EN_MONTAJE → MONTADA → EN_USO →
EN_DESARME → DESARMADA → EN_DEVOLUCION → CERRADA_OPERATIVAMENTE

Estados alternativos: CANCELADA, SUSPENDIDA, EN_ESPERA
```

### Proyecto Técnico
```
PENDIENTE → EN_CURSO → EN_REVISION → APROBADO → REQUIERE_CAMBIOS

Alternativo: CANCELADO
```

### Cómputo
```
BORRADOR → VERIFICADO → APROBADO → EN_PREPARACION → PREPARADO

Alternativo: REQUIERE_AJUSTE
```

### Remito
```
EMITIDO → EN_TRANSITO → RECIBIDO → CON_DIFERENCIA → CERRADO

Alternativo: ANULADO
```

### Solicitud Extra
```
SOLICITADA → APROBADA → RECHAZADA → DESPACHADA → ENTREGADA
```

### Parte de Obra
```
BORRADOR → FIRMADO → APROBADO
```

### Permiso Municipal
```
EN_TRAMITE → APROBADO → RECHAZADO → VENCIDO → EN_RENOVACION
```

### Habilitación de Personal
```
HABILITADO → POR_VENCER → VENCIDO → NO_HABILITADO (falta doc)
```

### Mantenimiento
```
PROGRAMADO → REALIZADO → VENCIDO
```

### Vehículo
```
DISPONIBLE → EN_RUTA → EN_TALLER → FUERA_DE_SERVICIO
```

## 6.2 Trazabilidad: principios

Cada entidad con estados tiene:
- `estado_actual`
- `historial_estados` (tabla relacionada con: estado, fecha, usuario, observación)
- Cualquier cambio de estado queda logueado en `audit_log`

Para materiales, la trazabilidad funciona así:
- Cada pieza tiene saldo en `stock`
- Cada movimiento (`movimientos`) modifica el saldo
- El saldo en obra se desglosa por `stock_por_obra`
- Al cerrar una obra, se compara: Σ enviado — Σ devuelto = diferencia
- La diferencia se clasifica: pérdida, daño, sobrante no retirado

---

# 7. DASHBOARDS, MÉTRICAS Y KPIs

## 7.1 Dashboard principal (Dirección / Gerencia)

**Vista ejecutiva** con:
- Obras activas (por estado): gráfico de barras apilado
- Obras montadas en el mes vs. mes anterior
- Metros montados en el mes
- Stock comprometido vs. disponible: gauge o barra apilada
- Remitos abiertos (sin cerrar)
- Alertas críticas activas
- Vencimientos próximos (7 días)
- Incidentes abiertos

## 7.2 Dashboard Operativo

- Calendario semanal con tareas de montaje/desarme/entrega
- Cuadrillas asignadas vs. disponibles
- Vehículos asignados vs. disponibles
- Obras listas para montar pero sin fecha
- Cómputos aprobados pendientes de preparación
- Pedidos extra pendientes de resolución

## 7.3 Dashboard de Stock

- Top 10 piezas con menor disponibilidad
- Distribución del stock: en depósito / comprometido / en obras / dañado
- Piezas por debajo del stock mínimo
- Rotación de materiales (veces que entra y sale por mes)
- Proyección de necesidad a 15/30 días (basado en cómputos aprobados)
- Merma (material perdido/dañado por período)

## 7.4 Dashboard de Oficina Técnica

- Proyectos pendientes (con antigüedad)
- Tiempo promedio de elaboración de proyecto
- Cómputos pendientes de verificación
- Obras sin proyecto asignado
- Backlog de relevamientos

## 7.5 KPIs operativos clave

| KPI | Cálculo | Meta sugerida |
|---|---|---|
| Tiempo aprobación → montaje | Fecha montaje real — fecha aprobación obra | < 10 días hábiles |
| Tiempo de elaboración de proyecto | Fecha aprobación proyecto — fecha solicitud | < 5 días hábiles |
| Cumplimiento de planificación | Tareas completadas en fecha / total planificadas | > 85% |
| Productividad de cuadrilla | Metros montados / horas-hombre | Benchmark propio |
| Tasa de pedidos extra | Solicitudes extra / total obras activas | < 15% |
| Merma de materiales | Piezas perdidas + dañadas / total piezas en circulación | < 2% mensual |
| Remitos abiertos > 48h | Remitos sin cerrar luego de 2 días de recepción | 0 |
| Personal con docs por vencer (30d) | Cantidad de personas | Tendencia decreciente |
| Incidentes abiertos | Total sin cerrar | < 5 simultáneos |
| Ocupación de stock | Stock comprometido + en obras / stock total | Monitoreo, no meta fija |
| Vehículos con mantenimiento vencido | Cantidad | 0 |
| Obras sin permiso vigente | Obras montadas sin permiso aprobado | 0 |

---

# 8. ALERTAS, AUTOMATIZACIONES Y REGLAS INTELIGENTES

## 8.1 Alertas por vencimiento

| Qué vence | Alerta a | Cuándo |
|---|---|---|
| Documentación de personal | RRHH + jefe operativo | 30, 15, 7, 0 días |
| Seguro de vehículo | Mantenimiento + gerencia | 30, 15, 7, 0 días |
| VTV | Mantenimiento + gerencia | 30, 15, 7, 0 días |
| Permiso municipal | Gestoría + gerencia | 30, 15, 7, 0 días |
| Contrato de alquiler | Administración | 30, 15 días |
| Certificado de inspección | Supervisor + técnico | 15, 7, 0 días |

## 8.2 Alertas operativas

| Situación | Alerta a | Prioridad |
|---|---|---|
| Obra aprobada sin proyecto asignado > 48h | Jefe técnico | Alta |
| Proyecto aprobado sin cómputo > 24h | Técnico asignado | Media |
| Cómputo con faltante de stock | Jefe depósito + gerencia | Alta |
| Remito emitido sin recepción > 24h | Logística | Media |
| Remito con diferencia sin resolver > 48h | Jefe depósito + gerencia | Alta |
| Solicitud extra sin respuesta > 4h (urgente) | Gerente operativo | Crítica |
| Personal no habilitado asignado a obra | RRHH + jefe operativo | Crítica (bloqueo) |
| Vehículo con mantenimiento vencido asignado | Mantenimiento | Crítica (bloqueo) |
| Obra con montaje completado sin parte de obra > 24h | Supervisor | Media |
| Obra cerrada con material sin devolver | Depósito + gerencia | Alta |
| Stock de pieza por debajo de mínimo | Depósito + gerencia | Media |

## 8.3 Automatizaciones

- **Auto-cálculo de stock disponible** en cada movimiento
- **Generación automática de orden de preparación** al aprobar cómputo
- **Cambio automático de estado** de documentos (vigente → por_vencer → vencido) por tarea nocturna
- **Bloqueo automático de asignación** de personal/vehículos con docs vencidas
- **Notificación automática al receptor** cuando un remito está en tránsito
- **Cálculo automático de diferencias** al registrar recepción vs. remito
- **Proyección de stock a 15 días** basada en cómputos aprobados + obras en curso

## 8.4 Reglas inteligentes (futuro)

- Sugerir cuadrilla óptima según tipo de obra y disponibilidad
- Detectar patrones de pérdida de material por obra/cuadrilla
- Predecir necesidad de material por estacionalidad
- Optimizar rutas de entrega/retiro
- Alertar si un proyecto tarda más que el promedio histórico

---

# 9. UX/UI Y DISEÑO DEL PRODUCTO

## 9.1 Estilo visual

**Dirección estética:** Industrial-moderno. Limpio pero con carácter. No "app de Silicon Valley" — sino un sistema que un capataz pueda usar con las manos sucias.

- **Paleta:** Fondo oscuro (gris muy oscuro, no negro puro) con acentos en un naranja/ámbar industrial (#F59E0B o similar). Alternativa light mode disponible.
- **Tipografía:** Sans-serif con buena legibilidad en pantalla pequeña. DM Sans para cuerpos, con peso bold para encabezados. Monospace para códigos y números de remito.
- **Bordes:** Redondeados pero no excesivos (6-8px). Tarjetas con borde sutil.
- **Iconografía:** Lucide icons. Consistentes, limpios.
- **Espaciado:** Generoso. Nada apretado. Los usuarios de campo necesitan targets grandes.

## 9.2 Navegación

**Sidebar izquierdo colapsable** con:

```
🏠 Inicio (dashboard según rol)
──────────────
📋 Obras
   ├── Listado
   ├── Mapa (si hay coordenadas)
   └── Pipeline
📐 Oficina Técnica
   ├── Proyectos
   └── Cómputos
📅 Planificación
   └── Calendario
──────────────
📦 Depósito
   ├── Stock
   ├── Preparación
   └── Catálogo de piezas
🚛 Logística
   ├── Remitos
   ├── Entregas / Retiros
   └── Sobrantes
📝 Solicitudes Extra
──────────────
👷 Personal
   ├── Legajos
   ├── Habilitaciones
   └── Documentación
🏛️ Gestoría
   └── Permisos
🚗 Vehículos
   ├── Flota
   └── Mantenimiento
🔧 Insumos
──────────────
📊 Partes de Obra
⚠️ Incidentes
📈 Reportes
🔔 Alertas
──────────────
⚙️ Configuración
```

**En mobile:** Bottom navigation con 5 íconos principales (varía según rol):
- Capataz: Mis Obras / Parte de Obra / Solicitud Extra / Alertas / Perfil
- Chofer: Mis Entregas / Remitos / Alertas / Perfil
- Depósito: Preparación / Stock / Recepción / Alertas

## 9.3 Vistas principales

### Lista de obras
- Tabla con filtros por estado, tipo, cliente, fecha
- Búsqueda por código o nombre
- Badges de color por estado
- Indicadores visuales: 🔴 sin proyecto, 🟡 sin permiso, 🟢 lista
- Click → detalle de obra con tabs: General / Proyecto / Materiales / Remitos / Personal / Partes / Incidentes

### Detalle de obra
- Header con datos clave y estado prominente
- Barra de progreso visual del ciclo de vida
- Tabs para cada aspecto
- Timeline de actividad reciente
- Acciones rápidas según estado (ej: "Asignar técnico", "Aprobar cómputo")

### Calendario de planificación
- Vista semanal como default
- Drag & drop para reprogramar
- Color por tipo de tarea
- Filtro por cuadrilla/vehículo
- Vista de recursos (Gantt simplificado)

### Stock
- Tabla con búsqueda por código o nombre de pieza
- Columnas: Total / Depósito / Comprometido / En obras / Dañado
- Barra visual de distribución por pieza
- Filtro por sistema de andamio, categoría
- Indicador de "por debajo de mínimo"

## 9.4 Patrones de interacción

| Caso | Patrón |
|---|---|
| Crear entidad nueva (obra, personal) | **Drawer lateral** desde la derecha, formulario scrolleable |
| Ver detalle de entidad | **Página completa** con tabs |
| Acciones rápidas (aprobar, cambiar estado) | **Modal de confirmación** simple |
| Formularios multietapa (alta de personal con docs) | **Wizard steps** horizontal |
| Filtros complejos | **Barra de filtros** colapsable arriba de la tabla |
| Selección de piezas para cómputo | **Tabla con buscador y selección múltiple** |
| Carga de fotos en campo | **Botón de cámara** directo (no file picker) |
| Firma de recepción | **Canvas de firma táctil** en celular |

## 9.5 Mobile-first para campo

Pantallas optimizadas para celular:
- Parte de obra diario (formulario corto + fotos)
- Confirmación de entrega/recepción
- Firma digital
- Solicitud extra de material
- Checklist de habilitación
- Reporte de incidente

**Regla:** Cualquier acción de campo debe poder completarse en menos de 2 minutos desde el celular.

## 9.6 Estados y badges

Código de colores consistente en todo el sistema:

| Color | Significado |
|---|---|
| 🔵 Azul | Información / en curso |
| 🟢 Verde | Aprobado / completado / habilitado |
| 🟡 Amarillo | Pendiente / por vencer / en espera |
| 🟠 Naranja | Requiere atención / advertencia |
| 🔴 Rojo | Vencido / bloqueado / crítico |
| ⚪ Gris | Borrador / inactivo / cancelado |

---

# 10. RECOMENDACIÓN TÉCNICA

## 10.1 Evaluación del stack propuesto

**React + Supabase + GitHub + Vercel**

### Veredicto: LO RECOMIENDO con ajustes menores.

### ¿Por qué sí?

| Aspecto | Evaluación |
|---|---|
| **Velocidad de desarrollo** | Excelente. Supabase da auth, DB, storage y realtime out-of-the-box. React tiene el ecosistema más grande. |
| **Costo** | Muy bajo para arrancar. Supabase free tier generoso. Vercel free para dev. Costo real comienza cuando hay muchos usuarios, y aun así es razonable. |
| **Escalabilidad** | Supabase (PostgreSQL detrás) escala bien para una pyme. No estamos hablando de millones de usuarios. |
| **Mantenimiento** | Un solo lenguaje (TypeScript) en front y en lógica de negocio. PostgreSQL es sólido y conocido. |
| **Seguridad** | Supabase maneja auth con JWT, Row Level Security (RLS) nativa en PostgreSQL. Muy robusto. |
| **Experiencia de usuario** | React permite UI rica. Con las librerías correctas, la experiencia será moderna. |
| **IA futura** | TypeScript + API edge functions + Supabase pgvector permiten integrar IA cuando sea el momento. |

### Limitaciones y cómo mitigarlas

| Limitación | Mitigación |
|---|---|
| Supabase no tiene lógica de negocio compleja nativa | Usar Edge Functions (Deno) para lógica server-side o Database Functions (plpgsql) |
| Vercel tiene limits en edge functions (duración, tamaño) | Para procesos pesados (reportes, proyecciones) usar Supabase Edge Functions o un worker separado |
| Supabase storage tiene límites en free tier | Plan Pro cuando se necesite ($25/mes — razonable) |
| Offline-first para campo no es trivial | Service workers + IndexedDB para operaciones críticas en campo |

### Alternativa considerada y descartada

**Next.js (App Router) en lugar de React SPA puro.**

Recomiendo usar **Next.js** como framework de React, no React puro. Razones:
- Routing integrado (file-based)
- Server components para cargas iniciales rápidas
- API routes para lógica intermedia si se necesita
- Mejor SEO (no relevante aquí, pero sí mejor manejo de metadata)
- Vercel optimizado para Next.js
- Mismo ecosistema React, mismas librerías

**No recomiendo** otras opciones como Vue/Nuxt, Angular, o Firebase en este caso. React/Next.js tiene el mayor pool de talento en Argentina, la mayor cantidad de componentes UI, y la mejor integración con Supabase.

## 10.2 Stack final recomendado

```
FRONTEND
├── Next.js 14+ (App Router)
├── TypeScript (estricto)
├── Tailwind CSS (styling)
├── shadcn/ui (componentes base — profesionales, customizables)
├── TanStack Table (tablas complejas con filtros, sort, paginación)
├── TanStack Query (caché y sincronización de datos)
├── React Hook Form + Zod (formularios y validación)
├── date-fns (fechas, con locale es-AR)
├── Recharts (gráficos en dashboards)
├── Lucide React (iconos)
├── nuqs (query params de URL como estado — para filtros persistentes)
└── Zustand (estado global mínimo, solo lo que no va en URL ni en server)

BACKEND / INFRAESTRUCTURA
├── Supabase
│   ├── PostgreSQL (base de datos)
│   ├── Auth (autenticación con JWT)
│   ├── Row Level Security (permisos a nivel de fila)
│   ├── Storage (archivos: fotos, planos, documentos)
│   ├── Realtime (notificaciones push, cambios en vivo)
│   ├── Edge Functions (lógica de negocio server-side, TypeScript/Deno)
│   └── Database Functions (cálculos de stock, triggers de auditoría)
├── Vercel (hosting del frontend)
├── GitHub (repositorio, CI/CD con GitHub Actions)
└── Resend o Supabase SMTP (emails transaccionales: alertas, notificaciones)

FUTURO (cuando se necesite)
├── Supabase pgvector (embeddings para búsqueda inteligente)
├── Anthropic Claude API (asistente de proyecto, análisis de desvíos)
└── PWA / Capacitor (app nativa si se necesita offline real)
```

## 10.3 Arquitectura del frontend

```
/app
├── /(auth)              — Login, registro, recuperar contraseña
├── /(dashboard)         — Layout con sidebar
│   ├── /obras           — CRUD + detalle con tabs
│   ├── /oficina-tecnica — Proyectos y cómputos
│   ├── /planificacion   — Calendario
│   ├── /deposito        — Stock, preparación, catálogo
│   ├── /logistica       — Remitos, entregas, sobrantes
│   ├── /personal        — Legajos, habilitaciones, docs
│   ├── /gestoria        — Permisos
│   ├── /vehiculos       — Flota, mantenimiento
│   ├── /partes          — Partes de obra
│   ├── /incidentes      — Registro y seguimiento
│   ├── /reportes        — Dashboards y KPIs
│   ├── /alertas         — Centro de notificaciones
│   └── /configuracion   — Usuarios, roles, catálogos
├── /api                 — API routes (si se necesitan)
└── /lib
    ├── /supabase        — Cliente, tipos auto-generados
    ├── /hooks            — Custom hooks por módulo
    ├── /utils            — Helpers, formatters
    └── /types            — Tipos TypeScript compartidos
```

## 10.4 Soluciones técnicas específicas

**Autenticación:** Supabase Auth con email/password. Magic link opcional. JWT con custom claims para roles. Middleware en Next.js que protege rutas según rol.

**Roles y permisos:** Tabla `user_roles` en la DB. Row Level Security (RLS) en Supabase para que las queries solo devuelvan datos permitidos. Componentes de UI que se renderizan condicionalmente según rol.

**Archivos:** Supabase Storage con buckets organizados: `documentos/{entidad_tipo}/{entidad_id}/`, `fotos/{obra_id}/`, `firmas/`. Políticas de acceso por RLS.

**Notificaciones:** Supabase Realtime para notificaciones in-app (badge en campana). Edge Function que envía email para alertas críticas. Push notifications vía web push API para mobile.

**Auditoría:** Trigger PostgreSQL en las tablas principales que inserta en `audit_log` en cada INSERT, UPDATE, DELETE. Automático, no depende del frontend.

**Offline para campo:** Progressive Web App (PWA) con service worker. Para operaciones críticas (parte de obra, confirmación de recepción), guardar en IndexedDB y sincronizar cuando haya conexión. Indicador visual de "pendiente de sincronización".

---

# 11. ROADMAP DE DESARROLLO POR FASES

## Fase 1: Núcleo Mínimo Viable (MVP) — 8-10 semanas

**Objetivo:** Tener el sistema operativo básico funcionando. Reemplazar Excel y WhatsApp para los procesos más críticos.

| Módulo | Alcance | Justificación |
|---|---|---|
| Auth + Roles | Login, roles básicos (admin, operativo, depósito, campo) | Prerequisito |
| Obras | CRUD completo con estados básicos | Entidad central |
| Clientes | CRUD básico | Necesario para obras |
| Stock / Catálogo | Catálogo de piezas, saldos, movimientos manuales | Sin stock no hay operación |
| Remitos | Emisión, recepción, cierre | Trazabilidad de material |
| Personal | Legajo básico, documentación con vencimientos | Control de habilitación |
| Alertas (v1) | Vencimientos de documentación | Riesgo legal inmediato |
| Dashboard (v1) | Obras activas, alertas, stock resumen | Visibilidad mínima |

**Impacto:** Alto. Resuelve los 3 dolores principales: no saber qué hay en stock, no tener trazabilidad de remitos, y no controlar vencimientos.

**Dificultad:** Media. Es la base, pero es relativamente straightforward.

## Fase 2: Control Operativo Fuerte — 6-8 semanas

**Objetivo:** Completar la cadena operativa de punta a punta.

| Módulo | Alcance | Justificación |
|---|---|---|
| Oficina Técnica | Proyectos técnicos con estados y archivos | Cerrar el flujo obra → proyecto |
| Cómputos | Cómputo de materiales vinculado a proyecto y stock | Eslabón clave: técnica → depósito |
| Preparación de pedido | Orden de preparación para depósito | Automatizar despacho |
| Solicitudes Extra | CRUD con aprobación | Control de desvíos |
| Sobrantes | Registro de material sobrante en obra | Reducir pérdidas |
| Partes de Obra | Partes diarios con fotos y firma | Control de ejecución |
| Planificación (v1) | Calendario básico con asignaciones | Coordinar operación |
| Habilitación | Verificación automática, bloqueos | Cumplimiento normativo |

**Impacto:** Muy alto. Cierra el ciclo completo.

**Dificultad:** Media-alta. Los flujos de aprobación y la lógica de stock comprometido son complejos.

## Fase 3: Inteligencia Operativa — 6 semanas

**Objetivo:** Dashboards ricos, reportes, y métricas para tomar decisiones.

| Módulo | Alcance |
|---|---|
| Dashboards completos | Por rol: dirección, operativo, depósito, técnica |
| KPIs | Todos los indicadores de la sección 7 |
| Reportes exportables | PDF/Excel de stock, obras, productividad |
| Permisos municipales | Gestoría completa |
| Vehículos + Mantenimiento | Flota completa con alertas |
| Insumos y herramientas | Control con vencimientos |
| Incidentes | CRUD completo con seguimiento |

**Impacto:** Alto para dirección. Datos para decidir.

**Dificultad:** Media. Es más visualización que lógica nueva.

## Fase 4: Automatizaciones y Optimización — 4-6 semanas

**Objetivo:** Reducir carga manual y anticipar problemas.

| Módulo | Alcance |
|---|---|
| Motor de alertas avanzado | Reglas configurables |
| Proyección de stock | Stock futuro basado en cómputos y obras planificadas |
| Inspecciones periódicas | Calendario de inspecciones con alertas |
| Planificación (v2) | Drag & drop, detección de conflictos de recursos |
| Comunicaciones por obra | Notas y log de comunicaciones |
| Offline mode | PWA con sync para partes de obra y recepciones |

## Fase 5: IA y Predicción — Ongoing

| Módulo | Alcance |
|---|---|
| Cómputo asistido | Sugerencia de piezas por tipo de andamio y medidas |
| Detección de patrones | Pérdidas por cuadrilla, desvíos recurrentes |
| Optimización de rutas | Entregas y retiros optimizados geográficamente |
| Asistente | Chat con IA que responde consultas sobre el sistema |

---

# 12. MVP RECOMENDADO

## Qué incluir sí o sí

1. **Obras** con estados y datos básicos
2. **Clientes** (CRUD mínimo)
3. **Catálogo de piezas** (carga inicial)
4. **Stock** con saldos y movimientos
5. **Remitos** (emisión, recepción, diferencias, cierre)
6. **Personal** con documentación y vencimientos
7. **Alertas de vencimiento** (documentación de personal)
8. **Dashboard mínimo** (obras activas, alertas, stock)
9. **Auth con roles** (admin, operativo, depósito, campo)

## Qué dejar para después

- Oficina técnica y cómputos (Fase 2 — el proceso hoy se resuelve "a mano" y puede seguir así un poco más)
- Planificación con calendario (Fase 2)
- Permisos municipales (Fase 3 — se puede seguir con Excel temporalmente)
- Vehículos y mantenimiento (Fase 3)
- Dashboards avanzados (Fase 3)
- Automatizaciones inteligentes (Fase 4)
- IA (Fase 5)

## ¿Por qué este recorte?

El mayor dolor inmediato es: **no saber qué material hay, dónde está, y quién lo tiene.** El segundo dolor es **documentación vencida que genera riesgo legal.** El MVP ataca esos dos problemas.

Los proyectos técnicos y cómputos son importantes pero tienen más dependencias y complejidad. Pueden funcionar "en paralelo" fuera del sistema por un par de meses más mientras el MVP se estabiliza.

---

# 13. RIESGOS DE DISEÑO DEL SISTEMA

## Riesgos concretos y cómo evitarlos

### 1. Querer construir todo de entrada
**Riesgo:** Pasar 6 meses sin lanzar nada. El equipo se agota, el sistema nunca se usa.
**Mitigación:** Fases estrictas. MVP en 8-10 semanas. Lanzar y que la gente lo use.

### 2. Sobrecarga de carga manual
**Riesgo:** Si cargar un remito tarda 15 minutos, nadie lo va a hacer. El sistema queda vacío.
**Mitigación:** Cada formulario de campo debe completarse en < 2 minutos. Autocompletar todo lo posible. Valores por defecto inteligentes. Búsqueda rápida de piezas.

### 3. Mala experiencia en mobile
**Riesgo:** El capataz que tiene que cargar un parte de obra en la lluvia no va a usar una tabla de 20 columnas.
**Mitigación:** Diseñar las pantallas de campo primero, mobile-first. Botones grandes, formularios cortos, cámara de fotos directa.

### 4. Estados mal definidos
**Riesgo:** Si un remito puede quedar eternamente en "emitido" sin que nadie lo note, no hay trazabilidad real.
**Mitigación:** Cada estado tiene una duración esperada. Si se excede, alerta automática. No dejar procesos abiertos indefinidamente.

### 5. Stock descalzado
**Riesgo:** Si el stock del sistema no coincide con la realidad, nadie confía en el sistema.
**Mitigación:** Todo movimiento pasa por remito. Auditorías periódicas de conciliación. Ajustes manuales solo con aprobación y justificación.

### 6. Permisos demasiado laxos o demasiado restrictivos
**Riesgo:** Si todos pueden editar todo, se pierde integridad. Si nadie puede hacer nada sin 3 aprobaciones, el sistema traba la operación.
**Mitigación:** Empezar con permisos amplios para roles operativos de confianza y ir ajustando. No bloquear la operación por un permiso mal configurado.

### 7. Dashboards bonitos pero inútiles
**Riesgo:** Gráficos lindos que nadie mira porque no responden preguntas reales.
**Mitigación:** Cada métrica debe responder una pregunta operativa concreta. Si no la responde, no se incluye. Priorizar tableros accionables.

### 8. No contemplar la conciliación de material
**Riesgo:** Saber qué se envió pero no qué volvió. La pérdida se descubre meses después.
**Mitigación:** Flujo de devolución obligatorio. Cierre de obra imposible sin conciliación. Alertas de material en obra sin actividad.

### 9. Ignorar la resistencia al cambio
**Riesgo:** El sistema está listo pero nadie lo usa porque "es más fácil mandar un WhatsApp".
**Mitigación:** Involucrar a 2-3 usuarios clave desde la fase de diseño. Hacer que el sistema sea más fácil que el WhatsApp, no más difícil. Migrar un proceso a la vez.

### 10. No tener estrategia de datos iniciales
**Riesgo:** Sistema vacío el día 1. Sin catálogo de piezas, sin personal cargado, sin obras — nadie puede hacer nada.
**Mitigación:** Antes del lanzamiento, migrar datos existentes: catálogo de piezas (Excel → DB), personal activo, obras en curso.

---

# 14. PROPUESTA FINAL

## Resumen ejecutivo

Construir **AndamiosOS** como un sistema operativo de gestión de operaciones utilizando **Next.js + Supabase + Vercel**, desplegado en fases incrementales empezando por un MVP enfocado en stock, remitos, personal y obras.

## Principios de diseño del producto

1. **Lo que no se registra, no existe.** El sistema debe ser la única fuente de verdad.
2. **Mobile primero para campo.** Las pantallas de obra se diseñan para el celular del capataz.
3. **Trazabilidad sin fricción.** Cada pieza de andamio debe poder rastrearse sin que eso cueste 10 minutos de carga manual.
4. **Alertas proactivas.** El sistema avisa ANTES de que algo explote, no después.
5. **Datos para decidir.** Cada dashboard debe ayudar a tomar una decisión concreta.
6. **Progresividad.** Se lanza el MVP, se estabiliza, se agrega. Nunca big-bang.

## Plan de acción sugerido

| Semana | Actividad |
|---|---|
| 1-2 | Setup técnico, modelo de datos, auth, diseño UI base, migración de datos iniciales |
| 3-4 | Módulo Obras + Clientes |
| 5-6 | Módulo Stock + Catálogo + Movimientos |
| 7-8 | Módulo Remitos + flujo de entrega/recepción |
| 9-10 | Módulo Personal + Documentación + Alertas de vencimiento + Dashboard v1 |
| 11-12 | Testing, ajustes, deploy, piloto con usuarios reales |
| 13+ | Fase 2 según feedback del piloto |

---

# EXTRA A: ARQUITECTURA FUNCIONAL RESUMIDA

```
┌─────────────────────────────────────────────────────────────┐
│                     CAPA DE PRESENTACIÓN                     │
│  Next.js + shadcn/ui + Tailwind + TanStack                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Desktop  │ │  Mobile  │ │ Dashboards│ │  Alertas │       │
│  │ (full)   │ │ (campo)  │ │  (charts) │ │ (notif)  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                    CAPA DE SERVICIOS                         │
│  Supabase                                                    │
│  ┌──────┐ ┌────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Auth │ │Realtime │ │ Storage │ │Edge Funcs│ │   REST   │ │
│  │(JWT) │ │(notify) │ │(archivos│ │(lógica)  │ │(PostgREST│ │
│  └──────┘ └────────┘ └─────────┘ └──────────┘ └─────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    CAPA DE DATOS                             │
│  PostgreSQL                                                  │
│  ┌──────────────┐ ┌─────────┐ ┌───────────┐ ┌───────────┐  │
│  │   Tablas     │ │  RLS    │ │ Triggers  │ │ Functions │  │
│  │ (entidades)  │ │(permisos│ │(auditoría)│ │(cálculos) │  │
│  └──────────────┘ └─────────┘ └───────────┘ └───────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

# EXTRA B: LISTADO DE PANTALLAS PRINCIPALES

## Por módulo

### Obras (5 pantallas)
1. Lista de obras (tabla con filtros + badges de estado)
2. Detalle de obra (page con tabs)
3. Crear/editar obra (drawer)
4. Pipeline de obras (vista kanban por estado)
5. Mapa de obras (si hay coordenadas)

### Oficina Técnica (4)
1. Lista de proyectos técnicos
2. Detalle de proyecto (con archivos)
3. Lista de cómputos
4. Detalle/editor de cómputo (tabla de piezas)

### Planificación (2)
1. Calendario semanal/mensual
2. Crear/editar tarea (modal)

### Depósito (5)
1. Stock general (tabla)
2. Detalle de pieza (historial de movimientos)
3. Catálogo de piezas (gestión)
4. Órdenes de preparación
5. Recepción de devoluciones

### Logística (4)
1. Lista de remitos
2. Detalle de remito
3. Crear remito (wizard)
4. Entregas/retiros programados

### Personal (4)
1. Lista de personal
2. Legajo individual (detalle con docs)
3. Panel de habilitaciones (semáforo)
4. Carga de documentación (formulario)

### Gestoría (2)
1. Lista de permisos
2. Detalle de permiso (con seguimiento)

### Vehículos (3)
1. Lista de flota
2. Detalle de vehículo (con docs y mantenimiento)
3. Calendario de mantenimiento

### Partes de Obra (2)
1. Lista de partes
2. Formulario de parte (mobile-optimized)

### Incidentes (2)
1. Lista de incidentes
2. Formulario/detalle de incidente

### Reportes (4)
1. Dashboard dirección
2. Dashboard operativo
3. Dashboard stock
4. Dashboard oficina técnica

### Configuración (3)
1. Gestión de usuarios y roles
2. Catálogos del sistema (tipos de obra, tipos de andamio, etc.)
3. Configuración de alertas

### Solicitudes Extra (2)
1. Lista de solicitudes
2. Crear solicitud (mobile-optimized)

### Alertas (1)
1. Centro de notificaciones

**Total: ~43 pantallas** (muchas comparten componentes)

---

# EXTRA C: BACKLOG INICIAL PRIORIZADO

## IMPRESCINDIBLE (MVP — Fase 1)

- [ ] Setup del proyecto (Next.js, Supabase, deploy)
- [ ] Modelo de datos base (migraciones)
- [ ] Autenticación y gestión de usuarios
- [ ] Roles y permisos básicos (RLS)
- [ ] CRUD de Clientes
- [ ] CRUD de Obras con estados
- [ ] Catálogo de piezas
- [ ] Gestión de stock (saldos, movimientos manuales)
- [ ] Remitos de entrega (emisión, recepción, cierre)
- [ ] Remitos de devolución
- [ ] Conciliación de diferencias
- [ ] CRUD de Personal (legajo)
- [ ] Carga de documentación con vencimientos
- [ ] Alertas de vencimiento (documentación de personal)
- [ ] Dashboard mínimo
- [ ] Layout responsive con sidebar
- [ ] Componentes base (tabla, formularios, badges, modales)

## IMPORTANTE (Fase 2)

- [ ] Proyectos técnicos (CRUD con archivos)
- [ ] Cómputos de materiales (editor de lista de piezas)
- [ ] Verificación de stock contra cómputo
- [ ] Stock comprometido vs. disponible
- [ ] Orden de preparación para depósito
- [ ] Solicitudes extra de material (CRUD con aprobación)
- [ ] Sobrantes en obra
- [ ] Partes de obra (formulario mobile)
- [ ] Habilitación automática de personal (check de docs)
- [ ] Bloqueo de asignación si doc vencida
- [ ] Planificación (calendario básico)
- [ ] Asignación de cuadrillas y vehículos

## DESEABLE (Fase 3)

- [ ] Dashboards completos por rol
- [ ] KPIs y métricas avanzadas
- [ ] Reportes exportables (PDF/Excel)
- [ ] Permisos municipales (gestoría)
- [ ] Vehículos y flota completa
- [ ] Mantenimiento vehicular con alertas
- [ ] Insumos y herramientas
- [ ] Incidentes y observaciones
- [ ] Inspecciones periódicas
- [ ] Comunicaciones por obra
- [ ] Auditoría consultable

## FUTURO (Fase 4-5)

- [ ] Motor de alertas configurable
- [ ] Proyección de stock a futuro
- [ ] Offline mode (PWA con sync)
- [ ] Drag & drop en planificación
- [ ] Optimización de rutas
- [ ] Cómputo asistido por IA
- [ ] Detección de patrones de pérdida
- [ ] Chat / asistente inteligente
- [ ] App nativa (Capacitor)

---

# EXTRA D: STACK FINAL RECOMENDADO (resumen)

| Capa | Tecnología | Motivo |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Routing, SSR, API routes, optimizado para Vercel |
| Lenguaje | TypeScript estricto | Seguridad de tipos en todo el proyecto |
| UI Base | shadcn/ui + Tailwind CSS | Componentes profesionales, 100% customizables |
| Tablas | TanStack Table | Filtros, sort, paginación, virtualización |
| Data fetching | TanStack Query | Caché inteligente, sincronización, loading states |
| Formularios | React Hook Form + Zod | Performance, validación declarativa |
| Gráficos | Recharts | Integración React nativa, personalizable |
| Iconos | Lucide React | Consistente, liviano |
| Estado global | Zustand (mínimo) | Solo para UI state que no va en URL ni server |
| URL state | nuqs | Filtros y estado persistente en URL |
| Base de datos | Supabase (PostgreSQL) | Relacional, robusto, RLS, triggers |
| Auth | Supabase Auth | JWT, magic links, integrado con RLS |
| Storage | Supabase Storage | Archivos con control de acceso |
| Realtime | Supabase Realtime | Notificaciones y cambios en vivo |
| Server logic | Supabase Edge Functions | TypeScript, deploy integrado |
| Hosting | Vercel | Deploy automático, preview por branch, edge network |
| Repo | GitHub | CI/CD, code review, issues |
| Email | Resend | Transaccional moderno, API simple |
| Fechas | date-fns (locale es-AR) | Manipulación de fechas sin peso excesivo |

---

# EXTRA E: ESTRUCTURA DE NAVEGACIÓN

## Sidebar completa (desktop)

```
┌─────────────────────────────┐
│  🔶 AndamiosOS              │
│  Andamios Buenos Aires      │
├─────────────────────────────┤
│                             │
│  🏠 Inicio                  │
│                             │
│  ── OPERACIONES ──          │
│  📋 Obras                   │
│  📐 Oficina Técnica         │
│  📅 Planificación           │
│                             │
│  ── LOGÍSTICA ──            │
│  📦 Depósito / Stock        │
│  🚛 Remitos                 │
│  📝 Solicitudes Extra       │
│                             │
│  ── RECURSOS ──             │
│  👷 Personal                │
│  🏛️ Gestoría / Permisos    │
│  🚗 Vehículos               │
│  🔧 Insumos                 │
│                             │
│  ── CONTROL ──              │
│  📊 Partes de Obra          │
│  ⚠️ Incidentes              │
│  📈 Reportes                │
│                             │
│  ── SISTEMA ──              │
│  🔔 Alertas          [12]  │
│  ⚙️ Configuración          │
│                             │
├─────────────────────────────┤
│  👤 Juan Pérez              │
│  Gerente Operativo          │
│  🚪 Cerrar sesión           │
└─────────────────────────────┘
```

## Bottom nav (mobile — varía por rol)

**Capataz:**
```
[🏗️ Obras] [📝 Parte] [📦 Pedido] [🔔 Alertas] [👤 Perfil]
```

**Depósito:**
```
[📦 Stock] [📋 Preparar] [📥 Recibir] [🔔 Alertas] [👤 Perfil]
```

**Chofer:**
```
[🚛 Entregas] [📄 Remitos] [🔔 Alertas] [👤 Perfil]
```

---

# CONVENCIONES Y NOMENCLATURA

## Códigos del sistema

| Entidad | Formato | Ejemplo |
|---|---|---|
| Obra | OBR-YYYY-NNNN | OBR-2026-0142 |
| Remito entrega | RE-YYYY-NNNN | RE-2026-0087 |
| Remito devolución | RD-YYYY-NNNN | RD-2026-0034 |
| Proyecto técnico | PT-YYYY-NNNN | PT-2026-0142 |
| Solicitud extra | SE-YYYY-NNNN | SE-2026-0015 |
| Parte de obra | PO-YYYY-NNNN | PO-2026-0203 |
| Incidente | INC-YYYY-NNNN | INC-2026-0008 |
| Permiso | PM-YYYY-NNNN | PM-2026-0012 |

## Nomenclatura de estados

Todos los estados en UPPER_SNAKE_CASE en la base de datos. Se traducen a labels legibles con color en el frontend.

## Convención de timestamps

Todas las fechas en UTC en la base de datos. El frontend las convierte a la zona horaria del usuario (America/Argentina/Buenos_Aires).

---

*Este documento es la base fundacional del producto. Cada sección debe refinarse con el equipo antes de comenzar el desarrollo. El próximo paso recomendado es validar los flujos operativos con los usuarios clave de cada área y comenzar con el setup técnico y el modelo de datos del MVP.*
