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
//
// Reescrita el 09/10 para el rediseño (grupos por de quién es la pelota, el botón del paso
// en la fila, la ficha con una sola tarjeta de estado).

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
          trámite: qué falta, de quién es el próximo paso, desde cuándo, y si la obra está en
          condiciones de armarse.
        </p>
        <p>
          Las obras <Termino>entran solas</Termino> cuando Comercial crea la orden en Odoo. Acá no
          se da de alta nada.
        </p>
      </Seccion>

      <Seccion titulo="La bandeja: de quién es la pelota">
        <p>
          Arriba hay un resumen con cuántas obras hay en cada grupo; cada número te lleva a su
          grupo. Una obra aparece en <Termino>un solo grupo</Termino>, el primero que le corresponda:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Termino>Urgentes</Termino> — se arman en 3 días o menos, o la fecha ya pasó, y siguen sin
            habilitar. Le ganan a todo.
          </li>
          <li>
            <Termino>Nuevas</Termino> — todavía nadie decidió si piden papeles.
          </li>
          <li>
            <Termino>Para hacer</Termino> — la pelota es nuestra: mandar papeles, corregir uno
            observado, o habilitar porque ya está todo aprobado.
          </li>
          <li>
            <Termino>Esperando al cliente</Termino> — ya se le mandó todo y falta que apruebe.
          </li>
          <li>
            <Termino>Esperan el permiso</Termino> — plegado. Ver más abajo.
          </li>
          <li>
            <Termino>Vencen en menos de 30 días</Termino> — habilitadas con la documentación por
            vencer.
          </li>
        </ul>
        <p>
          Al pie quedan las <Termino>Pospuestas</Termino> y lo <Termino>Resuelto</Termino> (las
          habilitadas y las que no aplican), plegados. El buscador encuentra cualquier obra activa y
          abre lo plegado mientras buscás.
        </p>
      </Seccion>

      <Seccion titulo="Qué te dice cada fila">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Termino>El próximo paso</Termino> —<em>Mandar la Nómina ART</em>, <em>Falta que apruebe
            3 de 8</em>, <em>Lista para habilitar</em>— y hace cuánto está así. Los días se ponen en
            rojo cuando ya son demasiados: al día siguiente si el paso es tuyo, a la semana si espera
            al cliente, a las dos semanas si esperás que te diga qué pide. Si la obra estuvo
            pospuesta, lo tuyo empieza a contar el día que volvió.
          </li>
          <li>
            <Termino>Cuándo se arma</Termino>: la primera jornada del tablero si ya está planificada,
            o la fecha programada. En rojo si faltan 3 días o menos.
          </li>
          <li>
            <Termino>El botón del paso</Termino>: <em>Marcar enviado</em>, <em>Aprobó</em>,{" "}
            <em>Habilitar</em>. Lo que se resuelve en un clic se resuelve en la fila. Si te
            equivocaste, el aviso trae <Termino>Deshacer</Termino>. Habilitar pregunta antes, porque
            le avisa a Operaciones.
          </li>
          <li>
            En <Termino>⋯</Termino>: posponer, marcar que no aplica, ver la OT en Odoo.
          </li>
        </ul>
        <p>
          Los carteles aparecen sólo si cambian algo: prioridad, desarme o ampliación, SyH, papeles
          observados, nota fijada.
        </p>
      </Seccion>

      <Seccion titulo="El triage: ¿pide papeles?">
        <p>
          Es la primera decisión de toda obra nueva. <Termino>Aplica</Termino> la manda a la cola con
          la nómina de ART ya cargada; si llevamos técnico de Seguridad e Higiene, ese papel se suma
          solo. <Termino>No aplica</Termino> es una obra que no necesita tramitar documentación: queda
          habilitada en el acto. Es una de cada diez, más o menos.
        </p>
        <p>
          Con las casillas de Nuevas resolvés varias juntas. Si te equivocaste, el aviso trae
          Deshacer, y las que no aplican se traen de vuelta desde Resueltas.
        </p>
      </Seccion>

      <Seccion titulo="Los papeles">
        <p>Cada papel que el cliente pide es un requisito, y se mueve de a un paso:</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li><Termino>Pendiente</Termino> — todavía no se lo mandaste.</li>
          <li><Termino>Enviado</Termino> — salió, esperás que lo apruebe.</li>
          <li><Termino>Observado</Termino> — lo rebotó. Pide el motivo: sin él la fila no dice qué
            corregir, que es justo lo que te obliga a volver a leer el mail.</li>
          <li><Termino>Aprobado</Termino> — listo.</li>
        </ul>
        <p>
          Arriba de la lista están los botones para marcar o aprobar todos juntos. Lo observado queda
          afuera a propósito: necesita que alguien lo mire. Deshacer una aprobación te pide
          confirmación, y el tacho sólo saca papeles <Termino>pendientes</Termino>: uno mandado o
          aprobado es trabajo hecho ante el cliente. Si subís un archivo con el mismo nombre que otro,
          no lo pisa: se guardan los dos.
        </p>
        <p>
          Los <Termino>paquetes</Termino> crean los papeles de una: <Termino>Básico</Termino> (nómina
          de ART), <Termino>+ No repetición</Termino> (suma la cláusula), <Termino>+ SVO</Termino> (el SVO
          y el aviso de obra) y <Termino>Completo</Termino> (los ocho). Cambiar de paquete no borra lo
          que ya mandaste ni lo que agregaste a mano.
        </p>
      </Seccion>

      <Seccion titulo="Las que esperan el permiso">
        <p>
          Si el cliente pidió <Termino>no armar sin el permiso emitido</Termino>, mandar los papeles
          ahora no sirve: se vencen antes de que entre la cuadrilla. Esas obras esperan plegadas en su
          grupo y <Termino>vuelven solas</Termino> a la cola cuando la gestoría marca el permiso como
          emitido, o 10 días antes de armar, lo que pase primero. Te llega un aviso. No hace falta
          posponerlas.
        </p>
        <p>
          Las que se arman con número de expediente, o sin permiso, siguen el camino normal: los
          papeles se mandan enseguida. Y a un desarme el permiso no lo frena.
        </p>
      </Seccion>

      <Seccion titulo="Posponer">
        <p>
          Para cuando falta mucho para la obra por otro motivo. Sale de la cola hasta la fecha que
          elijas y vuelve sola, o antes si Operaciones la planifica para dentro de menos de 10 días,
          con un aviso a la campanita. El calendario no deja elegir después de 10 días antes de la
          obra. Desde Pospuestas o desde la ficha la podés reactivar o cambiarle la fecha.
        </p>
      </Seccion>

      <Seccion titulo="Habilitar y revertir">
        <p>
          Con todos los papeles aprobados aparece <Termino>Habilitar</Termino>. No pasa solo: alguien
          lo decide, y queda registrado quién y cuándo. Al habilitar,{" "}
          <Termino>Operaciones recibe un aviso</Termino>: desde ese momento la obra se puede programar.
        </p>
        <p>
          <Termino>Habilitar sin todos los papeles</Termino> (en el menú Más de la ficha) es para cuando
          el cliente autoriza por teléfono y los papeles llegan después. Pide un motivo escrito. Existe
          a propósito: lo que no se puede registrar se termina haciendo por afuera, sin rastro.
        </p>
        <p>
          <Termino>Revertir</Termino> pide el motivo, porque Operaciones recibe un aviso urgente con ese
          texto. Si después la volvés a habilitar, también les avisa.
        </p>
      </Seccion>

      <Seccion titulo="El vencimiento">
        <p>
          La nómina de ART vence, el seguro vence. Si la obra sigue armada cuando eso pasa, estamos
          sin cobertura. Al pie de los papeles hay un campo <Termino>La documentación vence el</Termino>:
          con la fecha cargada, 30 días antes la obra aparece en la bandeja. No llega ningún aviso
          aparte, así que sin fecha nadie se entera.
        </p>
      </Seccion>

      <Seccion titulo="Las notas">
        <p>
          Para lo que no entra en ningún campo: las razones sociales y CUIT de la cláusula,{" "}
          <em>&quot;el administrador atiende después de las 11&quot;</em>,{" "}
          <em>&quot;la nómina la manda el contador&quot;</em>. Lo que hoy vive en tu cabeza o en un
          mail viejo, y que la próxima persona que agarre la obra no tiene forma de saber.
        </p>
        <p>
          Es la conversación de los papeles. La de Operaciones con la obra va aparte, en el tablero,
          para que ninguna tape a la otra. El <Termino>chinche</Termino> deja la nota arriba y marca la
          obra en la bandeja.
        </p>
      </Seccion>

      <Seccion titulo="El permiso municipal">
        <p>
          Va por separado de la documentación y es lo único que puede <Termino>frenar</Termino> el
          armado desde el tablero:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li><Termino>Sin expediente ni permiso</Termino> — el cliente asume. No frena nada.</li>
          <li><Termino>Con número de expediente</Termino> — si el número no está cargado, al confirmar
            el tablero pide un motivo.</li>
          <li><Termino>Con el permiso emitido</Termino> — el tablero no deja confirmar hasta que salga.</li>
        </ul>
        <p>
          Lo carga <Termino>Comercial al cotizar</Termino>, y el trámite y el número de expediente los
          actualiza la gestoría de permisos. En la ficha se leen: si algo está mal,{" "}
          <Termino>se corrige en la venta, en Odoo</Termino>. A los desarmes el permiso no los frena.
        </p>
      </Seccion>

      <Seccion titulo="Los botones sólo registran">
        <p>
          Vale para todo el módulo: <Termino>ninguno manda mails</Termino>. El correo lo mandás vos
          por fuera y acá marcás que lo hiciste. Lo único que sale solo es el aviso a Operaciones
          cuando habilitás o revertís.
        </p>
        <p>
          Lo que aporta el sistema es la <Termino>fecha</Termino>: poder demostrar qué papel mandaste y
          cuándo, o que reclamaste tres veces desde el 4 de agosto. Por eso todo queda en el historial
          —también lo que se deshace, se quita o se cambia— y no se puede borrar: un error se corrige
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
