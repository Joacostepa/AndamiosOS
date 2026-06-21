// Derivación de roles desde personal.puesto (no existe un campo 'tipo' obra/depósito).
// Editable acá si cambian las reglas de negocio.

// Personal de obra que integra cuadrillas (excluye depósito/administración/chofer).
export const PUESTOS_OBRA = ["operario", "capataz", "tecnico", "supervisor"];

// Personal que puede manejar camiones.
export const PUESTOS_CHOFER = ["chofer"];

export function esPersonalDeObra(puesto: string): boolean {
  return PUESTOS_OBRA.includes(puesto);
}

export function esChofer(puesto: string): boolean {
  return PUESTOS_CHOFER.includes(puesto);
}
