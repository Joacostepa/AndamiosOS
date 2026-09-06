// Espejo de los avisos en Slack.
//
// POR QUÉ SLACK ADEMÁS DE LA CAMPANITA. La campanita sólo le habla a quien ya está adentro
// de la app, y los dos destinatarios de estos avisos no viven adentro de la app: SyH
// trabaja sobre la documentación de obra y logística arma el día en el tablero, pero
// ninguno de los dos se queda mirando el header esperando que aparezca un número. El aviso
// tiene que ir a donde la gente ya está.
//
// LA IDEMPOTENCIA NO ES DE ACÁ. Este módulo postea lo que le den, sin preguntarse si ya lo
// mandó antes, y puede darse ese lujo porque su único llamador es crearAlertas(), que le
// pasa EXCLUSIVAMENTE las filas que el upsert insertó de verdad. Quién es "de verdad" lo
// decide el índice único de `alertas.clave` adentro de Postgres, no este código. Por eso el
// barrido diario puede correr diez veces por día, o dos veces en paralelo, sin repetir un
// mensaje: la deduplicación de Slack es exactamente la misma que la de la campanita, y no
// costó una línea.
//
// NO TIRA NUNCA. Misma regla que crearAlertas: un webhook caído no puede voltear la
// operación que originó el aviso —habilitar una obra, abrir la bandeja—. Loguea y sigue.

import type { NuevaAlerta, TipoAlerta } from "./servicio";

/** Los canales reales del workspace. Un Incoming Webhook está atado a UN canal. */
type Canal = "syh" | "logistica";

const NOMBRE_CANAL: Record<Canal, string> = {
  syh: "#syh-documentacion-de-obra",
  logistica: "#logistica-operativa",
};

/**
 * A qué canal va cada aviso.
 *
 * `ot_nueva` va a los DOS: SyH necesita saber que hay una obra nueva para empezar a
 * juntarle los papeles, y logística para saber que hay trabajo entrando. Son dos lecturas
 * distintas del mismo hecho, no un reenvío.
 *
 * `ot_deshabilitada` está acá aunque no se haya pedido, y es a propósito: mandar
 * "habilitada" a logística sin mandar la vuelta atrás recrea en Slack el mismo bug que se
 * arregló en la campanita. Logística planifica jornadas apoyada en esa habilitación; si se
 * cae y el canal se queda mudo, la noticia llega el día que la cuadrilla no puede entrar a
 * la obra. Si sobra, se borra esta línea.
 */
const DESTINOS: Record<TipoAlerta, Canal[]> = {
  ot_nueva: ["syh", "logistica"],
  ot_habilitada: ["logistica"],
  ot_deshabilitada: ["logistica"],
  ot_urgente: ["logistica"],
};

/**
 * Cómo se ve cada tipo en el canal.
 *
 * `destacado` es lo que separa a las urgencias del resto: van con un bloque de encabezado
 * —el texto grande de Slack— en vez de una línea más del feed. Un canal donde todo grita no
 * dice nada, así que grita uno solo.
 *
 * `prefijos` es la pelusa que hay que sacarle al título. Los avisos vienen titulados
 * "Urgente — Armado · S01933 · Granz SRL" porque en la campanita el prefijo es lo ÚNICO
 * que distingue un tipo de otro: es una lista de texto plano. Acá el emoji, el rótulo y la
 * barra de color ya lo dicen tres veces, así que dejarlo escribe "🔴 URGENTE / Urgente —
 * Armado…" y encima roba el ancho que necesita el nombre del cliente.
 */
const ESTILO: Record<
  TipoAlerta,
  { color: string; emoji: string; rotulo: string; plural: string; destacado: boolean; prefijos: string[] }
> = {
  ot_nueva: {
    color: "#64748b",
    emoji: "🆕",
    rotulo: "OT nueva",
    plural: "OTs nuevas",
    destacado: false,
    prefijos: [],
  },
  ot_habilitada: {
    color: "#16a34a",
    emoji: "✅",
    rotulo: "Habilitada",
    plural: "obras habilitadas",
    destacado: false,
    prefijos: ["Habilitada"],
  },
  ot_deshabilitada: {
    color: "#dc2626",
    emoji: "⛔",
    rotulo: "Se cayó la habilitación",
    plural: "habilitaciones caídas",
    destacado: true,
    prefijos: ["Se revirtió la habilitación"],
  },
  ot_urgente: {
    color: "#dc2626",
    emoji: "🔴",
    rotulo: "URGENTE",
    plural: "OTs urgentes",
    destacado: true,
    prefijos: ["Urgente"],
  },
};

/**
 * El título sin el prefijo que ya dice el rótulo.
 *
 * Se saca sólo si coincide con uno conocido: si mañana alguien cambia el texto del aviso,
 * lo peor que pasa es que vuelva a verse el prefijo duplicado. Nunca se come parte de un
 * título real —hay clientes con guión largo en el nombre—.
 */
function tituloLimpio(a: NuevaAlerta): string {
  let t = a.titulo;
  for (const p of ESTILO[a.tipo].prefijos) {
    if (t.startsWith(`${p} — `)) t = t.slice(p.length + 3);
  }
  return t;
}

/** Cuántas se listan cuando entran muchas juntas. El resto se resume en una línea. */
const MAX_EN_LISTA = 8;

function webhookDe(canal: Canal): string | undefined {
  return canal === "syh" ? process.env.SLACK_WEBHOOK_SYH : process.env.SLACK_WEBHOOK_LOGISTICA;
}

/**
 * La ruta interna convertida en algo clickeable desde Slack.
 *
 * Si no hay dominio configurado el mensaje sale igual, sin link: un aviso sin link sigue
 * sirviendo, y quedarse sin aviso porque falta una variable de entorno no.
 */
function urlAbsoluta(enlace: string | null | undefined): string | null {
  if (!enlace) return null;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${enlace}`;
}

/** Slack corta en 3000 y un texto cortado a la mitad se lee peor que uno corto. */
function recortar(texto: string, max = 280): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

/** `*negrita*` y `<url|texto>` son mrkdwn de Slack, no Markdown. */
function linea(a: NuevaAlerta): string {
  const url = urlAbsoluta(a.enlace);
  const texto = recortar(tituloLimpio(a), 150);
  const titulo = url ? `<${url}|${texto}>` : texto;
  return a.descripcion ? `*${titulo}*\n${recortar(a.descripcion)}` : `*${titulo}*`;
}

type Bloque = Record<string, unknown>;

function seccion(texto: string): Bloque {
  return { type: "section", text: { type: "mrkdwn", text: texto } };
}

/**
 * Un mensaje por tipo, no uno por OT.
 *
 * Cuando el barrido de las 8:00 encuentra ocho OTs nuevas de un lunes, esto manda UN
 * mensaje con las ocho. La alternativa —ocho mensajes seguidos— es la forma más rápida de
 * que el equipo silencie el canal en la primera semana, y ahí el sistema entero deja de
 * servir aunque cada aviso individual sea correcto.
 */
function armarMensaje(tipo: TipoAlerta, alertas: NuevaAlerta[]): Record<string, unknown> {
  const estilo = ESTILO[tipo];
  const bloques: Bloque[] = [];

  if (alertas.length === 1) {
    const [a] = alertas;
    if (estilo.destacado) {
      // El header es el texto grande de Slack. No acepta mrkdwn ni links: es un cartel.
      bloques.push({
        type: "header",
        text: { type: "plain_text", text: `${estilo.emoji} ${estilo.rotulo}`, emoji: true },
      });
      bloques.push(seccion(linea(a)));
    } else {
      bloques.push(seccion(`${estilo.emoji} *${estilo.rotulo}*\n${linea(a)}`));
    }
  } else {
    const encabezado = `${estilo.emoji} ${alertas.length} ${estilo.plural}`;
    bloques.push(
      estilo.destacado
        ? { type: "header", text: { type: "plain_text", text: encabezado, emoji: true } }
        : seccion(`*${encabezado}*`),
    );
    for (const a of alertas.slice(0, MAX_EN_LISTA)) {
      bloques.push(seccion(`• ${linea(a)}`));
    }
    if (alertas.length > MAX_EN_LISTA) {
      bloques.push({
        type: "context",
        elements: [
          { type: "mrkdwn", text: `_y ${alertas.length - MAX_EN_LISTA} más en la app_` },
        ],
      });
    }
  }

  return {
    // `text` es el fallback: es lo que se ve en la notificación del celular y en la lista
    // de canales, donde los blocks no se renderizan. Sin esto Slack muestra un mensaje vacío.
    text:
      alertas.length === 1
        ? `${estilo.emoji} ${estilo.rotulo} — ${tituloLimpio(alertas[0])}`
        : `${estilo.emoji} ${alertas.length} ${estilo.plural}`,
    // La barra de color es de attachments, no de blocks. Sigue siendo la única manera de
    // que un aviso rojo se distinga de uno gris de un vistazo, scrolleando el canal.
    attachments: [{ color: estilo.color, blocks: bloques }],
  };
}

async function postear(canal: Canal, cuerpo: Record<string, unknown>): Promise<void> {
  const url = webhookDe(canal);
  // Sin webhook configurado no es un error: es una app corriendo en local, o Slack todavía
  // no conectado. Se calla y sigue.
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      // Slack a veces se queda colgado. Cinco segundos y listo: esto corre después de
      // haber respondido, pero la función serverless igual sigue viva mientras espera.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // El webhook contesta el motivo en texto plano ("no_service", "channel_not_found").
      const detalle = await res.text().catch(() => "");
      console.error(
        `[slack] ${NOMBRE_CANAL[canal]} rechazó el mensaje (${res.status}) ${detalle}`.trim(),
      );
    }
  } catch (e) {
    console.error(`[slack] no se pudo postear en ${NOMBRE_CANAL[canal]}`, e);
  }
}

/**
 * Manda a Slack los avisos que se acaban de crear.
 *
 * Recibe SÓLO los que la base insertó de verdad — ver el comentario de arriba. Agrupa por
 * canal y por tipo, y manda un mensaje por grupo.
 */
export async function enviarASlack(alertas: NuevaAlerta[]): Promise<void> {
  if (alertas.length === 0) return;

  const grupos = new Map<string, { canal: Canal; tipo: TipoAlerta; items: NuevaAlerta[] }>();
  for (const a of alertas) {
    for (const canal of DESTINOS[a.tipo] ?? []) {
      const k = `${canal}:${a.tipo}`;
      const g = grupos.get(k) ?? { canal, tipo: a.tipo, items: [] };
      g.items.push(a);
      grupos.set(k, g);
    }
  }

  // En paralelo: son dos canales como mucho y cada webhook tarda lo suyo. allSettled
  // porque postear() ya no tira, pero si algún día tira no se lleva puestos a los otros.
  await Promise.allSettled(
    [...grupos.values()].map((g) => postear(g.canal, armarMensaje(g.tipo, g.items))),
  );
}
