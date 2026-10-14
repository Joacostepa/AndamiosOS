"use client";

// La ficha de puesto (?puesto=<clave>): el manual de funciones de ese lugar. Quién lo ocupa, a
// quién reporta, para qué está, qué hace (con los documentos que emite, firma, recibe o usa),
// qué NO hace, cómo se mide y por qué está así (docs/organigrama/propuesta.md § 3.6).
//
// HERENCIA DEL ÁREA: el seed solo trae "qué NO hace", KPIs y notas en las áreas. Si el puesto no
// tiene los suyos, se muestran los del área con la etiqueta «(del área)».
//
// En el celular la caja de tareas va antes que la misión: es lo que se viene a buscar.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Link2, Pencil, PencilLine, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Caja, HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { Button } from "@/components/ui/button";
import {
  ancestros,
  areaDe,
  estadoPuesto,
  fechaCorta,
  hijos,
  nodoDe,
  nombreCompleto,
  ocupantesVigentes,
  quienResponde,
  vacanteDesde,
} from "@/lib/organigrama/arbol";
import type { Nodo } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { ChipDocumento } from "./chip-documento";
import { clasesArea } from "./colores-area";
import { CuadrillasEnVivo } from "./cuadrillas-en-vivo";
import { FilaOcupante, useEnlaces } from "./fila-ocupante";
import { EVENTO_ELIMINAR, EVENTO_RENOMBRAR } from "./lienzo/comun";
import { useOrg } from "./proveedor";

function DelArea({ propio }: { propio: boolean }) {
  return propio ? null : <span className="text-[12px] font-normal text-muted-foreground">(del área)</span>;
}

function Cadena({ nodos }: { nodos: Nodo[] }) {
  const enlaces = useEnlaces();
  if (!nodos.length) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {nodos.map((n, i) => (
        <span key={n.clave}>
          {i > 0 && <span className="text-muted-foreground"> → </span>}
          <Link href={enlaces.puesto(n.clave)} scroll={false} className="font-medium underline-offset-2 hover:underline">
            {n.titulo}
          </Link>
        </span>
      ))}
    </>
  );
}

export function FichaPuesto({ clave, onCerrar }: { clave: string; onCerrar: () => void }) {
  const { datos, puedeEditar, enBorrador, dispatch, abrir, usuario } = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const enlaces = useEnlaces();
  const nodo = nodoDe(datos.nodos, clave);
  // En el Lienzo, «Renombrar» cierra la ficha y deja la tarjeta editándose (en el celular no hay
  // doble clic ni F2). Se avisa cuando la hoja ya se cerró, así no le saca el foco al campo.
  const enLienzo = pathname.includes("lienzo");

  if (!nodo) {
    return (
      <HojaLateral abierta onCerrar={onCerrar} titulo="Puesto no encontrado">
        <Aviso tono="bloqueo" titulo="Ese puesto no está en el organigrama vigente">
          Puede que lo hayan eliminado o que el link esté mal.{" "}
          <Link href="/organigrama" className="font-medium underline">
            Volver al mapa
          </Link>
        </Aviso>
      </HojaLateral>
    );
  }

  const area = areaDe(datos.nodos, clave);
  const c = clasesArea(area?.color);
  const e = estadoPuesto(datos, clave);
  const vigentes = ocupantesVigentes(datos, clave);
  const responde = quienResponde(datos, clave);
  const desde = vacanteDesde(datos, clave);
  const deCuadrillas = nodo.fuenteOcupantes === "cuadrillas";
  const heredar = nodo.tipo === "puesto" && area && area.clave !== nodo.clave;
  const noHace = nodo.noHace.length || !heredar ? nodo.noHace : area.noHace;
  const kpis = nodo.kpis.length || !heredar ? nodo.kpis : area.kpis;
  const nota = nodo.notaDiseno || (heredar ? area.notaDiseno : undefined);
  const arriba = ancestros(datos.nodos, clave);
  const abajo = hijos(datos.nodos, clave);
  const asignarCoral = e.vacante && !e.interino && !deCuadrillas;

  const copiarLink = async () => {
    const url = `${window.location.origin}/organigrama?puesto=${encodeURIComponent(clave)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copiado. Mandalo por WhatsApp y abre esta ficha.");
    } catch {
      toast("No pudimos copiar el link", { description: url });
    }
  };

  const renombrar = () => {
    onCerrar();
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(EVENTO_RENOMBRAR, { detail: clave })), 350);
  };

  // En el Lienzo sigue el mismo camino que el tacho (animación y deshacer); en el Mapa, el diálogo.
  const eliminarNodo = () => {
    if (enLienzo) {
      onCerrar();
      window.setTimeout(() => window.dispatchEvent(new CustomEvent(EVENTO_ELIMINAR, { detail: clave })), 350);
      return;
    }
    if (!enBorrador) dispatch({ tipo: "entrar", autor: usuario ? nombreCompleto(usuario) : "Editor" });
    abrir({ tipo: "eliminar", clave });
    router.push(enlaces.cerrar, { scroll: false });
  };

  const editarFicha = () => {
    if (!enBorrador) dispatch({ tipo: "entrar", autor: usuario ? nombreCompleto(usuario) : "Editor" });
    abrir({ tipo: "editar", clave });
    router.push(enlaces.cerrar, { scroll: false });
  };

  return (
    <HojaLateral
      abierta
      onCerrar={onCerrar}
      titulo={nodo.titulo}
      sub={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-full", c.punto)} />
          {area && area.clave !== nodo.clave ? area.titulo : nodo.tipo === "direccion" ? "Dirección" : "Responsable del área"}
          {nodo.rol && ` · ${nodo.rol}`}
        </span>
      }
      pie={
        <>
          <Button variant="outline" className="h-9 max-sm:h-10" onClick={copiarLink}>
            <Link2 aria-hidden /> Copiar link
          </Button>
          {puedeEditar && enLienzo && (
            <Button variant="outline" className="h-9 max-sm:h-10" onClick={renombrar}>
              <PencilLine aria-hidden /> Renombrar
            </Button>
          )}
          {puedeEditar && (
            <Button variant="outline" className="h-9 max-md:hidden" onClick={editarFicha}>
              <Pencil aria-hidden /> Editar ficha
            </Button>
          )}
          {puedeEditar && !deCuadrillas && (
            <Button
              variant={asignarCoral ? "default" : "outline"}
              className="h-9 max-sm:h-10"
              onClick={() => abrir({ tipo: "asignar", nodo: clave })}
            >
              <UserPlus aria-hidden /> Asignar persona
            </Button>
          )}
          {puedeEditar && nodo.dependeDe && (
            <Button
              variant="outline"
              className="h-9 text-destructive hover:text-destructive max-sm:h-10"
              onClick={eliminarNodo}
            >
              <Trash2 aria-hidden /> Eliminar
            </Button>
          )}
        </>
      }
    >
      <Caja titulo={deCuadrillas ? `Quién lo ocupa · ${vigentes.length} capataces` : "Quién lo ocupa"}>
        {vigentes.length > 0 && (
          <div>
            {vigentes.map((o) => (
              <FilaOcupante key={o.id} ocupante={o} nodo={nodo} />
            ))}
          </div>
        )}
        {e.vacante && !e.interino && (
          <Aviso tono="aviso" titulo={`Este puesto está vacante${desde ? ` desde el ${fechaCorta(desde)}` : ""}.`}>
            {responde?.subio && responde.personas.length
              ? `Las preguntas sobre estas tareas van a ${responde.personas.map(nombreCompleto).join(", ")} (${responde.nodo.titulo}).`
              : "Todavía no hay a quién derivar las preguntas."}
          </Aviso>
        )}
        {e.vacante && e.interino && <p className="text-[12.5px] text-muted-foreground">Sin titular: lo cubre un interino.</p>}
        {e.baja && !e.vacante && responde?.subio && (
          <p className="text-[12.5px] text-muted-foreground">
            Mientras tanto, las preguntas van a {responde.personas.map(nombreCompleto).join(", ")} ({responde.nodo.titulo}).
          </p>
        )}
        {deCuadrillas && <p className="text-[12.5px] text-muted-foreground">Los capataces salen de las cuadrillas; se cambian en Configuración › Cuadrillas.</p>}
      </Caja>

      {deCuadrillas && <CuadrillasEnVivo />}

      <div className="grid gap-1 px-1 text-[13px]">
        <p>
          <span className="text-muted-foreground">Reporta a: </span>
          <Cadena nodos={arriba} />
        </p>
        <p>
          <span className="text-muted-foreground">Le reportan: </span>
          {abajo.length ? (
            abajo.map((h, i) => (
              <span key={h.clave}>
                {i > 0 && ", "}
                <Link href={enlaces.puesto(h.clave)} scroll={false} className="font-medium underline-offset-2 hover:underline">
                  {h.titulo}
                </Link>
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </p>
      </div>

      {(nodo.mision || puedeEditar) && (
        <Caja titulo="Para qué está" className="max-sm:order-2">
          {nodo.mision ? (
            <p className="text-[13.5px] leading-relaxed">{nodo.mision}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground italic">Falta la misión. Completala en el borrador con «Editar ficha».</p>
          )}
        </Caja>
      )}

      <Caja titulo={`Qué hace (${nodo.tareas.length})`} className="max-sm:order-1">
        {nodo.tareas.length ? (
          <ol className="grid gap-2">
            {nodo.tareas.map((t, i) => (
              <li key={`${i}-${t.texto}`} className="flex gap-2 text-[13.5px]">
                <span className="w-4 shrink-0 text-right font-mono text-[12px] text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  {t.texto}
                  {t.docs?.length ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {t.docs.map((d) => (
                        <ChipDocumento key={`${d.codigo}-${d.rol}`} doc={d} />
                      ))}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-muted-foreground">Sin tareas cargadas.</p>
        )}
      </Caja>

      {noHace.length > 0 && (
        <Caja
          titulo={
            <>
              Qué NO hace <DelArea propio={!!nodo.noHace.length} />
            </>
          }
          className="max-sm:order-3"
        >
          <ul className="grid gap-1.5">
            {noHace.map((x) => (
              <li key={x} className="flex gap-2 text-[13.5px]">
                <X aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                {x}
              </li>
            ))}
          </ul>
        </Caja>
      )}

      {kpis.length > 0 && (
        <Caja
          titulo={
            <>
              Cómo se mide <DelArea propio={!!nodo.kpis.length} />
            </>
          }
          className="max-sm:order-3"
        >
          <ul className="flex flex-wrap gap-1.5">
            {kpis.map((k) => (
              <li key={k} className="rounded-full border bg-background px-2.5 py-0.5 text-[12.5px]">
                {k}
              </li>
            ))}
          </ul>
        </Caja>
      )}

      {nota && (
        <Caja
          titulo={
            <>
              Por qué está así <DelArea propio={!!nodo.notaDiseno} />
            </>
          }
          className="max-sm:order-3"
        >
          <p className="text-[13.5px] leading-relaxed">«{nota}»</p>
        </Caja>
      )}

      {puedeEditar && (
        <Caja
          titulo={
            <>
              Nota interna <span className="text-[12px] font-normal text-muted-foreground">(solo editores)</span>
            </>
          }
          className="max-sm:order-3"
        >
          <p className={cn("text-[13.5px]", !nodo.notaInterna && "text-muted-foreground")}>{nodo.notaInterna || "Sin nota."}</p>
        </Caja>
      )}
    </HojaLateral>
  );
}
