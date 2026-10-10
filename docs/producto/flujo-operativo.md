# Flujo Operativo — Andamios Buenos Aires (ABA)
> Documento de referencia para desarrollo de app web (React + Node.js).
> Última actualización: decisiones de arquitectura incorporadas.

---

## Contexto de Arquitectura

### Decisión: App propia integrada con Odoo vía API
- **Odoo** conserva todo lo de Comercial y facturación (lo que ya hace bien).
- **La app web (React + Node.js)** maneja el flujo operativo completo: Obras, OTs, Habilitaciones, Planificación, Remitos y Partes Diarios.
- La sincronización entre ambos sistemas es **vía API de Odoo (JSON-RPC / REST)**.
- Premisa de diseño: **experiencia didáctica y práctica para el área de Operaciones**. El sistema debe ser fácil de operar en campo, con flujos claros y bloqueos visuales explícitos.
- La app está **en producción pero incompleta** — este documento describe el flujo completo como referencia para completar los módulos faltantes sin romper lo existente.

---

## Modelo de Datos (decisiones tomadas)

### Jerarquía de entidades
```
Obra (entidad madre)
├── Materiales → Remitos (entrega / sobrante / devolución)  ← vinculados a la Obra
├── OT de Armado
│   └── Partes Diarios                                      ← vinculados a la OT
├── OT de Mantenimiento
│   └── Partes Diarios
├── OT Adicional (Change Order)
│   └── Partes Diarios
└── OT de Desarme
    └── Partes Diarios
```

**Regla clave:**
- Los **materiales (remitos)** se vinculan a la **Obra**, no a la OT — para tener visión global de stock por proyecto.
- Los **partes diarios** se vinculan a la **OT** — para tener trazabilidad de qué se hizo en cada tarea específica.

---

## Flujo Completo por Módulo

### 1. Comercial → Creación de la Obra *(en Odoo, se sincroniza a la app)*
- El cliente paga → Comercial crea la **Obra** en Odoo.
- La Obra se sincroniza a la app vía API.
- Datos obligatorios de la Obra:
  - Nombre / cliente
  - **Fecha de inicio**
  - **Fecha de fin estimada** *(para proyección de retorno de materiales)*
  - Estado: `Creada → Armada → Desarmada`

---

### 2. Oficina Técnica → Cómputo de Materiales
- Reciben la Obra confirmada.
- Cargan el **cómputo inicial de materiales** en la app (lista de ítems + cantidades).
- Este cómputo queda asociado a la Obra y es la línea base para medir desvíos.

---

### 3. Comercial → Generación de Orden de Trabajo

**Tipos de OT:**
| Tipo | Iniciador |
|---|---|
| Armado | Comercial |
| Desarme | Comercial |
| Mantenimiento | Comercial |
| Adicional (Change Order) | Operaciones → requiere aprobación de Comercial |
| Otro | Comercial |

**Estados de una OT:**
```
Creada → Pendiente de Habilitación → Habilitada → En Ejecución → Cerrada
```

**OTs Adicionales:**
- Las puede iniciar **Operaciones** desde la app.
- Quedan en estado `Pendiente de aprobación` hasta que **Comercial las aprueba en Odoo**.
- Una vez aprobadas, siguen el mismo flujo que cualquier OT estándar.
- Objetivo: evitar trabajos extra no facturados o no autorizados.

---

### 4. Habilitaciones → Habilitación del Personal *(módulo crítico)*

- Al crearse una OT, el área de **Habilitaciones recibe notificación automática**.
- La OT aparece en la app en estado **"Bloqueada — Pendiente de Habilitación"** con indicación visual clara.
- Habilitaciones gestiona y envía al cliente:
  - Nóminas de personal
  - Pólizas de seguro (RT)
  - Cláusulas de no repetición
  - Capacitación SPA del personal
  - Otros requisitos de seguridad, higiene y seguros del cliente
- Una vez gestionado, Habilitaciones marca la OT como **"Habilitada"** en la app.
- Solo entonces Operaciones puede comenzar la ejecución.

> ⚠️ **UX importante:** la OT debe ser visible para Operaciones desde el momento de su creación, pero con bloqueo explícito y mensaje claro de qué falta. No ocultarla — que el equipo sepa que viene trabajo y pueda ir preparándose.

---

### 5. Planificación y Operaciones → Ejecución

#### 5.1 Planificación
- Operaciones recibe la OT habilitada.
- Asigna **personal** (cuadrillas) y **vehículos**.
- Genera **timeline visual** (diario y semanal) — debe ser didáctico, fácil de leer en campo.

#### 5.2 Partes Diarios *(vinculados a la OT)*
Cada parte diario registra:
- Fecha
- Personal presente
- Tareas realizadas en el día
- Tiempo insumido
- Observaciones

#### 5.3 Cierre de OT
- Operaciones marca la OT como **"Cerrada"**.
- Cuando todas las OTs de armado están cerradas → la Obra pasa a estado **"Armada"**.

---

### 6. Depósito → Gestión de Remitos *(vinculados a la Obra)*

#### Remito de Entrega (material → obra)
- El encargado de depósito ve todos los materiales del proyecto.
- Genera remitos de entrega para cada envío a obra.
- Puede haber **múltiples remitos** por obra (el material se lleva en varios viajes o en etapas).
- El material puede variar respecto al cómputo original (faltantes, modificaciones de proyecto).

#### Remito de Sobrante (material → depósito, durante el armado)
- Material que no se usó y vuelve al depósito mientras se está armando.
- Queda registrado para calcular **desvíos** vs. el cómputo de Oficina Técnica.

#### Remito de Devolución (material → depósito, en el desarme)
- Al terminar el desarme, todo el material vuelve al depósito.
- El sistema debe validar que el material devuelto coincida con el que estaba registrado en obra.

---

### 7. Ciclo de Desarme

Cuando el cliente finaliza el uso de la estructura:

1. **Comercial** genera OT de **Desarme** (en Odoo → se sincroniza a la app).
2. **Habilitaciones** gestiona la habilitación del personal (mismo flujo).
3. **Operaciones** planifica y coordina el desarme.
4. **Depósito** genera remitos de devolución.
5. Al cerrar la OT de Desarme → la Obra pasa a estado **"Desarmada"**.

---

## Resumen de Entidades

| Entidad | Descripción | Vinculada a |
|---|---|---|
| **Obra** | Entidad madre. Fecha inicio/fin. Estado global. | — |
| **Cómputo de Materiales** | Lista de materiales planificados por Oficina Técnica | Obra |
| **Orden de Trabajo (OT)** | Armado / Desarme / Mantenimiento / Adicional / Otro | Obra |
| **Parte Diario** | Registro diario de trabajo (personal, tareas, tiempo) | OT |
| **Remito de Entrega** | Material enviado del depósito a la obra | Obra |
| **Remito de Sobrante** | Material que vuelve durante el armado | Obra |
| **Remito de Devolución** | Material que vuelve al finalizar el desarme | Obra |

---

## Resumen de Áreas, Roles y Permisos

| Área | Acciones principales en la app |
|---|---|
| **Comercial** | Ver Obras sincronizadas desde Odoo. Aprobar OTs adicionales. |
| **Oficina Técnica** | Cargar y editar cómputo de materiales por Obra. |
| **Habilitaciones** | Ver OTs pendientes. Marcar OTs como habilitadas. |
| **Planificación / Operaciones** | Ver OTs (con estado de bloqueo). Asignar personal y vehículos. Completar partes diarios. Cerrar OTs. Iniciar OTs adicionales. |
| **Depósito** | Ver materiales por Obra. Generar y gestionar remitos (entrega, sobrante, devolución). |

---

## Flujo Simplificado — Happy Path (Armado)

```
[Odoo] Comercial crea Obra → sincroniza a la app vía API
        ↓
[App] Oficina Técnica carga cómputo de materiales
        ↓
[Odoo] Comercial genera OT de Armado → sincroniza a la app
        ↓
[App] OT aparece como "Bloqueada — Pendiente de Habilitación"
        ↓
[App] Habilitaciones gestiona seguros → marca OT como "Habilitada"
        ↓
[App] Operaciones asigna cuadrillas y vehículos → arma planificación (timeline)
        ↓
[App] Depósito genera remitos de entrega → material va a obra en etapas
        ↓
[App] Operaciones completa partes diarios por OT
        ↓
        ├── [Si hay sobrante] → Depósito genera remito de sobrante
        └── [Si surge trabajo extra] → Operaciones crea OT Adicional
                                        → Comercial aprueba en Odoo
                                        → sigue el flujo estándar
        ↓
[App] Operaciones cierra OT → Obra pasa a estado "Armada"

─────────────────── [cuando el cliente termina] ───────────────────

[Odoo] Comercial genera OT de Desarme → sincroniza a la app
        ↓
[App] Habilitaciones habilita → Operaciones planifica → Depósito genera remitos de devolución
        ↓
[App] OT de Desarme cerrada → Obra pasa a estado "Desarmada"
```

---

## Integración con Odoo (API)

| Evento en Odoo | Acción en la app |
|---|---|
| Obra creada / confirmada | Crear entidad Obra en la app |
| OT generada desde Comercial | Crear OT en la app, notificar a Habilitaciones y Operaciones |
| OT Adicional aprobada por Comercial | Cambiar estado de OT Adicional a "Aprobada" en la app |
| *(a definir)* | Sincronización de cliente / datos de facturación |

