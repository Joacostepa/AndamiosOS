// Las fotos del chat, de la más nueva a la más vieja. Puro, con tests en fotos-chat.test.ts.
//
// POR FECHA DE SUBIDA, NO POR NOMBRE: las de la pantalla se llaman <Date.now()>-…, pero las de
// WhatsApp wa-<wamid>-…, y el wamid no ordena por hora. Ordenadas por nombre, «la última foto»
// podía ser cualquiera (auditoría 12/10). Sin fecha (no debería pasar), van al final, por nombre.

export type ObjetoStorage = { name: string; created_at?: string | null };

export function ordenarPorSubida<T extends ObjetoStorage>(objetos: T[]): T[] {
  return [...objetos].sort((a, b) => {
    if (a.created_at && b.created_at) return b.created_at.localeCompare(a.created_at) || b.name.localeCompare(a.name);
    if (a.created_at) return -1;
    if (b.created_at) return 1;
    return b.name.localeCompare(a.name);
  });
}
