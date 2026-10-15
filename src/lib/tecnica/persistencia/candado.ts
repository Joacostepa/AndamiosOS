/**
 * Serializa los guardados del autoguardado: nunca hay dos PATCH en vuelo. Si llega otro pedido mientras
 * uno está en curso, queda UNO pendiente (los pedidos intermedios se funden) y se manda al terminar, leyendo
 * en ese momento la revisión nueva. Sin esto, un PATCH lento y el siguiente debounce salían con la misma
 * revisión y el segundo daba 409 contra uno mismo.
 */
export function serializarGuardado(guardar: (forzar: boolean) => Promise<boolean>) {
  let enVuelo: Promise<boolean> | null = null;
  let pendiente: { forzar: boolean } | null = null;
  let esperando: Promise<boolean> | null = null;

  const pedir = (forzar = false): Promise<boolean> => {
    if (enVuelo) {
      pendiente = { forzar: forzar || !!pendiente?.forzar };
      // todos los que piden durante el vuelo esperan la MISMA vuelta siguiente
      if (!esperando) {
        esperando = enVuelo.then(() => {
          const p = pendiente;
          pendiente = null;
          esperando = null;
          return p ? pedir(p.forzar) : true;
        });
      }
      return esperando;
    }
    enVuelo = guardar(forzar).finally(() => {
      enVuelo = null;
    });
    return enVuelo;
  };
  return {
    pedir,
    enVuelo: () => enVuelo !== null,
    reiniciar: () => {
      enVuelo = null;
      pendiente = null;
      esperando = null;
    },
  };
}
