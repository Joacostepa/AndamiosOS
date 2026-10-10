import type { ClaveAccion, Quien } from "@/lib/permisos-via-publica/estado";

// Los textos que se repiten entre la lista y la ficha, con el glosario del rediseño (09/10):
// "Gobierno" y no "GCBA", "la oficina" y no "ABA", "corregir" y no "subsanar".

/** El verbo del botón de cada acción. */
export const BOTON: Record<ClaveAccion, string> = {
  copiar_link: "Copiar el link",
  perseguir_cliente: "Recordar al cliente",
  revisar_dueno: "Corregir y mandar el endoso",
  pedir_endoso: "Pedir el endoso",
  volver_a_pedir_endoso: "Volver a pedir el endoso",
  generar_documentos: "Generar informe y croquis",
  armar_encomienda: "Armar la encomienda",
  volver_a_armar: "Volver a armarla",
  reanudar_cierre: "Reanudar el cierre",
  revisar_cpau: "Ya revisé el CPAU",
  ver_encomienda: "Ver la encomienda",
  presentar: "Presentar en TAD",
  volver_a_presentar: "Volver a presentar",
  empezar_de_cero: "Empezar de cero",
  seguir_borrador: "Seguir desde el borrador",
  revisar_confirmar: "Ver el expediente",
  confirmar_venta: "Confirmar la venta",
  subsanar: "Ver qué corregir",
  ver_archivado: "Ya lo miré",
  decidir_expediente: "Decidir",
};

export const LO_TIENE: Record<Quien, string> = {
  Cliente: "Cliente",
  Segucom: "Segucom",
  CPAU: "CPAU",
  Robot: "Robot",
  Gobierno: "Gobierno",
  Oficina: "Oficina",
};

export const ESPERANDO_A: Record<Exclude<Quien, "Oficina" | "Gobierno">, { titulo: string; bajada: string }> = {
  Cliente: { titulo: "Esperando al cliente", bajada: "Pasan a «Te toca» a los 2 días sin cargar el dueño, o a los 3 con algo que falta o hay que corregir." },
  Segucom: { titulo: "Esperando a Segucom", bajada: "El endoso de la póliza. El robot le manda recordatorios." },
  CPAU: { titulo: "Esperando al CPAU", bajada: "El certificado de la encomienda. El robot revisa el mail cada 15 min." },
  Robot: { titulo: "Lo está haciendo el robot", bajada: "La Mac de la oficina tiene que estar prendida." },
};

/** "Te toca: Tamara", "Te toca: la oficina". */
export const teTocaA = (corto: string | null | undefined) => `Te toca: ${corto ?? "la oficina"}`;
