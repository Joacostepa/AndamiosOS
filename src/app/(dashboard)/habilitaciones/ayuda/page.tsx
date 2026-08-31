"use client";

import Link from "next/link";
import { ArrowLeft, CircleQuestionMark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reiniciarTours } from "@/hooks/use-tour";
import { TOUR_BANDEJA, TOUR_FICHA } from "@/lib/habilitaciones/tour";
import { useRouter } from "next/navigation";

// La guía escrita del módulo.
//
// El recorrido guiado se ve una vez y se cierra; estos conceptos hacen falta el día 30.
// Acá el mismo contenido queda consultable y salteable: alguien que sólo quiere saber
// qué significa "observado" entra, lee tres líneas y se va.
//
// Es también el material de capacitación: con gente rotando, hay que poder mandarle un
// link a quien entra en lugar de sentarse a explicárselo de nuevo.

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-semibold">{titulo}</h2>
      <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Termino({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>;
}

export default function AyudaHabilitacionesPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl space-y-7 pb-10">
      <div className="flex items-center gap-2">
        <Link
          href="/habilitaciones"
          className="flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Habilitaciones
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cómo funciona Habilitaciones</h1>
          <p className="text-[13px] text-muted-foreground">
            Se lee entero en cinco minutos. Volvé cuando te haga falta.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            reiniciarTours([TOUR_BANDEJA, TOUR_FICHA]);
            router.push("/habilitaciones");
          }}
        >
          <CircleQuestionMark className="mr-1.5 h-3.5 w-3.5" />
          Ver el recorrido de nuevo
        </Button>
      </div>

      <Seccion titulo="Para qué sirve">
        <p>
          Antes de armar andamios en un edificio, el cliente casi siempre pide documentación:
          nómina de ART, cláusula de no repetición, seguro, capacitaciones. Este módulo lleva ese
          trámite: a quién le falta qué, desde cuándo, y si la obra está en condiciones de armarse.
        </p>
        <p>
          Las obras <Termino>entran solas</Termino> cuando Comercial crea la orden en Odoo. Acá no
          se da de alta nada — tu primera acción siempre es el triage.
        </p>
      </Seccion>

      <Seccion titulo="El triage: aplica o no aplica">
        <p>
          Es la primera decisión de toda obra nueva y define si entra a la cola.
        </p>
        <p>
          <Termino>No aplica</Termino> es una obra que no necesita tramitar documentación. No queda
          pendiente de nada: se da por habilitada y pasa a verde. Es la mitad de los casos, así que
          resolverlo rápido es lo que mantiene la bandeja limpia.
        </p>
        <p>
          <Termino>Aplica</Termino> la manda a la cola para pedirle los papeles al cliente.
        </p>
        <p>
          Se puede hacer de a varias con las casillas. Si te equivocaste, las descartadas quedan al
          pie de la bandeja, en <Termino>No aplican</Termino>, y desde ahí se traen de vuelta.
        </p>
      </Seccion>

      <Seccion titulo="Las cuatro etapas, y de quién es la pelota">
        <p>
          La etapa no describe un casillero: dice <Termino>quién tiene que mover</Termino>.
        </p>
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            <Termino>Nuestra — falta consultarle al cliente qué pide.</Termino> La obra aplica pero
            todavía no le preguntaste qué documentación exige. La pelota es tuya.
          </li>
          <li>
            <Termino>Del cliente — tiene que decir qué papeles pide.</Termino> Ya le preguntaste y
            estás esperando la lista.
          </li>
          <li>
            <Termino>Del cliente — tiene que validar lo que le mandamos.</Termino> Le mandaste al
            menos un papel y falta que los apruebe.
          </li>
          <li>
            <Termino>Habilitada.</Termino> Resuelta.
          </li>
        </ol>
        <p>
          Se pasa de la 1 a la 2 con el botón <Termino>Ya le consulté al cliente</Termino>. Triar no
          es consultar: decidir que la obra necesita papeles y haberle preguntado qué pide son dos
          cosas distintas, y hasta que aprietes ese botón la pelota la tenés vos, porque es verdad.
        </p>
      </Seccion>

      <Seccion titulo="Los requisitos">
        <p>
          Cada papel que el cliente pide es un requisito, y se mueve de a un paso:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li><Termino>Pendiente</Termino> — todavía no se lo mandaste.</li>
          <li><Termino>Enviado</Termino> — salió, esperás que lo apruebe.</li>
          <li><Termino>Observado</Termino> — lo rebotó. Pide el motivo obligatorio: sin él la fila se
            ve en rojo y no dice qué corregir, que es justo lo que te obliga a volver a leer el mail.</li>
          <li><Termino>Aprobado</Termino> — listo.</li>
        </ul>
        <p>
          Arriba de la lista están <Termino>marcar todo como enviado</Termino> y{" "}
          <Termino>aprobar todo</Termino>, porque normalmente mandás un mail con todos los papeles y
          el cliente contesta que está todo bien. Los botones de a uno siguen estando para cuando
          efectivamente va de a uno. Lo observado queda afuera de las acciones masivas a propósito:
          necesita que alguien lo mire.
        </p>
        <p>
          Los <Termino>paquetes</Termino> son los combos ya armados: elegís uno del desplegable y te
          crea todos los requisitos de una, en vez de cargarlos a mano.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li><Termino>Básico</Termino> — sólo la nómina de ART. Es el que se aplica solo al marcar &quot;aplica&quot;.</li>
          <li><Termino>+ No repetición</Termino> — la nómina más la cláusula de no repetición.</li>
          <li><Termino>+ SVO</Termino> — suma el SVO y el aviso de obra.</li>
          <li><Termino>Completo</Termino> — los ocho, para los clientes más exigentes.</li>
        </ul>
        <p>
          El paquete es un punto de partida, no una jaula: si cambiás a otro,{" "}
          <Termino>no se borra</Termino> lo que ya mandaste ni lo que agregaste a mano. Y si el cliente
          pide algo que no está en ningún combo, lo escribís abajo de la lista con el nombre que
          quieras y pasa a ser un requisito más.
        </p>
      </Seccion>

      <Seccion titulo="Habilitar">
        <p>
          El botón verde se prende solo cuando <Termino>todos</Termino> los requisitos están
          aprobados. Mientras falten, está apagado y te dice cuántos.
        </p>
        <p>
          No pasa solo: alguien tiene que decidirlo, y queda registrado quién y cuándo. Si te
          apuraste, <Termino>Revertir</Termino> lo deshace.
        </p>
        <p>
          <Termino>Habilitar por excepción</Termino> es para cuando el cliente autoriza por teléfono
          y los papeles llegan después. Pide un motivo escrito. Existe a propósito: un sistema que no
          admite lo que pasa en la realidad termina esquivado por afuera, y ahí sí no queda registro
          de nada.
        </p>
      </Seccion>

      <Seccion titulo="El vencimiento">
        <p>
          Muchas habilitaciones caducan: la nómina de ART vence, el seguro vence. Si la obra sigue
          armada cuando eso pasa, estás sin cobertura y nadie se entera.
        </p>
        <p>
          Por eso, en <Termino>Documentación del cliente</Termino> hay un campo{" "}
          <Termino>Vence el</Termino>. Cargalo siempre que la documentación tenga fecha de corte: es{" "}
          <Termino>el único aviso que te llega solo</Termino>, sin que tengas que acordarte de mirar.
        </p>
        <p>
          Con la fecha cargada, la obra aparece en el grupo{" "}
          <Termino>Vencen en menos de 30 días</Termino> de la bandeja, y el semáforo cambia cuando ya
          venció. Sin fecha, nadie te va a avisar nada.
        </p>
      </Seccion>

      <Seccion titulo="Las notas">
        <p>
          Para lo que no entra en ningún campo: <em>&quot;el administrador atiende después de las 11&quot;</em>,{" "}
          <em>&quot;la nómina la manda el contador, no el cliente&quot;</em>,{" "}
          <em>&quot;pidieron todo junto y no de a uno&quot;</em>.
        </p>
        <p>
          Es lo que hoy vive en tu cabeza o en un mail viejo, y que la próxima persona que agarre la
          obra no tiene forma de saber. Con gente rotando, es lo que evita empezar de cero.
        </p>
        <p>
          El <Termino>chinche</Termino> la fija arriba y además la muestra en el tablero, para quien
          planifica la obra. Usalo sólo para lo que alguien más necesita saber sí o sí — si fijás
          todo, deja de destacar nada.
        </p>
      </Seccion>

      <Seccion titulo="El permiso es otro trámite">
        <p>
          Va por separado de la documentación y es lo único que puede <Termino>frenar</Termino> el
          armado desde el tablero.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li><Termino>Sin permiso</Termino> — el cliente asume. No frena nada.</li>
          <li><Termino>Con expediente</Termino> — se arma amparado en un número de expediente. Si el
            número no está cargado, al confirmar pide motivo escrito.</li>
          <li><Termino>Esperar el permiso emitido</Termino> — el cliente pidió no armar hasta tenerlo.
            Bloquea la confirmación.</li>
        </ul>
        <p>
          La modalidad <Termino>la define el técnico</Termino>, no vos. Si no está definida, el tablero
          avisa al confirmar y registra el pedido al técnico.
        </p>
      </Seccion>

      <Seccion titulo="Los botones sólo registran">
        <p>
          Vale para todo el módulo: <Termino>ninguno manda mails</Termino>. El correo lo mandás vos
          por fuera y acá marcás que lo hiciste.
        </p>
        <p>
          Lo que aporta el sistema es la <Termino>fecha</Termino>: poder demostrar que reclamaste tres
          veces desde el 4 de agosto. Por eso el historial no se puede borrar — un error se corrige
          agregando, no tapando.
        </p>
      </Seccion>

      <Seccion titulo="Si aparece el aviso amarillo">
        <p>
          Dice que una habilitación no pudo actualizarse en Odoo. El módulo guarda tu cambio igual,
          pero el tablero puede estar mostrando un semáforo viejo hasta que se repare.
        </p>
        <p>
          Apretá <Termino>Reintentar</Termino> en ese mismo aviso. Si sigue fallando después de un
          par de intentos, avisá: es problema de conexión con Odoo, no algo que hayas hecho mal.
        </p>
      </Seccion>
    </div>
  );
}
