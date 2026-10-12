"use client";

// «Para revisar» (docs/organigrama/propuesta.md § 3.10): lo que está mal salta solo. Mismo
// patrón que «Legajo dado de baja con cosas a cargo» del pañol: el sistema avisa y una persona
// decide. Orden fijo por gravedad; acciones en outline (no hay una próxima acción única).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, OctagonAlert, TriangleAlert } from "lucide-react";
import { Seccion } from "@/components/permisos-via-publica/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { areaDe, fechaCorta, nombreCompleto, pendientes } from "@/lib/organigrama/arbol";
import { HOY } from "@/lib/organigrama/datos-maqueta";
import { useOrg } from "./proveedor";

function Pastilla({ n }: { n: number }) {
  return <span className="rounded-full bg-muted px-2 text-[12px] font-normal text-muted-foreground tabular-nums">{n}</span>;
}

const FILA = "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-3 text-[13.5px] last:border-b-0";
const BOTON = "h-9 max-sm:h-10";

export function BandejaRevisar() {
  const { datosVigentes: datos, quitar, abrir, dispatch, usuario } = useOrg();
  const router = useRouter();
  const p = pendientes(datos, HOY);
  const area = (clave: string) => areaDe(datos.nodos, clave)?.titulo;
  const ver = (clave: string) => `/organigrama/revisar?puesto=${encodeURIComponent(clave)}`;
  const hay = p.bajas.length + p.vacantes.length + p.sobrecarga.length + p.interinos.length + p.sinPuesto.length;

  if (!hay) {
    return (
      <div className="rounded-md border bg-card">
        <EmptyState icon={Check} title="Todo en orden" description="No hay vacantes, bajas ni sobrecargas." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13.5px] text-muted-foreground">
        <span className="font-semibold text-foreground">{p.accionables}</span> {p.accionables === 1 ? "cosa para resolver" : "cosas para resolver"} (bajas, vacantes sin
        cubrir y sobrecargas). Lo demás es para tener a la vista.
      </p>

      {p.bajas.length > 0 && (
        <Seccion
          titulo={
            <span className="inline-flex items-center gap-2">
              <OctagonAlert aria-hidden className="size-4 text-red-700 dark:text-red-300" /> Bajas con puesto <Pastilla n={p.bajas.length} />
            </span>
          }
        >
          {p.bajas.map((b) => (
            <div key={b.ocupante.id} className={FILA}>
              <p className="min-w-0 flex-1">
                <span className="font-medium">{nombreCompleto(b.persona)}</span> · {b.nodo.titulo}
                <span className="text-muted-foreground"> · baja en Legajos {b.persona.bajaEl ? fechaCorta(b.persona.bajaEl) : ""}</span>
              </p>
              <Button variant="outline" className={BOTON} onClick={() => quitar(b.ocupante.id)}>
                Quitar del puesto
              </Button>
              <Button variant="outline" className={BOTON} onClick={() => abrir({ tipo: "asignar", nodo: b.nodo.clave, reemplaza: b.ocupante.id })}>
                Asignar reemplazo
              </Button>
            </div>
          ))}
        </Seccion>
      )}

      {p.vacantes.length > 0 && (
        <Seccion
          titulo={
            <span className="inline-flex items-center gap-2">
              <TriangleAlert aria-hidden className="size-4 text-amber-800 dark:text-amber-300" /> Vacantes <Pastilla n={p.vacantes.length} />
            </span>
          }
        >
          {p.vacantes.map((v) => (
            <div key={v.nodo.clave} className={FILA}>
              <p className="min-w-0 flex-1">
                <span className="font-medium">{v.nodo.titulo}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {area(v.nodo.clave)} ·{" "}
                  {v.interino ? `cubierta por ${nombreCompleto(v.interino)} (interino)` : v.desde ? `vacante desde ${fechaCorta(v.desde)}` : "desde siempre"}
                </span>
              </p>
              {v.interino ? (
                <Button variant="outline" className={BOTON} nativeButton={false} render={<Link href={ver(v.nodo.clave)} scroll={false} />}>
                  Ver
                </Button>
              ) : (
                <Button variant="outline" className={BOTON} onClick={() => abrir({ tipo: "asignar", nodo: v.nodo.clave })}>
                  Asignar
                </Button>
              )}
            </div>
          ))}
        </Seccion>
      )}

      {p.sobrecarga.length > 0 && (
        <Seccion
          titulo={
            <span className="inline-flex items-center gap-2">
              <TriangleAlert aria-hidden className="size-4 text-amber-800 dark:text-amber-300" /> Acumulan 3 o más puestos <Pastilla n={p.sobrecarga.length} />
            </span>
          }
        >
          {p.sobrecarga.map((s) => (
            <div key={s.persona.id} className={FILA}>
              <p className="min-w-0 flex-1">
                <span className="font-medium">{nombreCompleto(s.persona)}</span> <span className="text-muted-foreground">· {s.puestos} puestos</span>
              </p>
              <Button
                variant="outline"
                className={BOTON}
                nativeButton={false}
                render={<Link href={`/organigrama/revisar?persona=${s.persona.id}`} scroll={false} />}
              >
                Ver
              </Button>
            </div>
          ))}
        </Seccion>
      )}

      {p.interinos.length > 0 && (
        <Seccion
          titulo={
            <span className="inline-flex items-center gap-2">
              <Clock aria-hidden className="size-4 text-muted-foreground" /> Interinos <Pastilla n={p.interinos.length} />
            </span>
          }
        >
          {p.interinos.map((x) => (
            <div key={x.ocupante.id} className={FILA}>
              <p className="min-w-0 flex-1">
                <span className="font-medium">{nombreCompleto(x.persona)}</span> en {x.nodo.titulo}
                <span className="text-muted-foreground">
                  {" "}
                  · desde {fechaCorta(x.ocupante.desde)} · {x.dias} días
                </span>
              </p>
              <Button variant="outline" className={BOTON} nativeButton={false} render={<Link href={ver(x.nodo.clave)} scroll={false} />}>
                Ver
              </Button>
            </div>
          ))}
        </Seccion>
      )}

      {p.sinPuesto.length > 0 && (
        <Seccion
          titulo={
            <span className="inline-flex items-center gap-2">
              Activos sin puesto <Pastilla n={p.sinPuesto.length} />
            </span>
          }
        >
          {p.sinPuesto.map((x) => (
            <div key={x.id} className={FILA}>
              <p className="min-w-0 flex-1">
                <span className="font-medium">{nombreCompleto(x)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {x.tarea ?? "sin tarea"} · sin cuadrilla
                </span>
              </p>
              <Button variant="outline" className={BOTON} onClick={() => abrir({ tipo: "asignar", persona: x.id })}>
                Asignar
              </Button>
            </div>
          ))}
        </Seccion>
      )}

      <Seccion
        titulo={
          <span className="inline-flex items-center gap-2">
            Fichas incompletas <Pastilla n={new Set([...p.incompletas.sinMision, ...p.incompletas.sinKpis]).size} />
          </span>
        }
      >
        <div className={FILA}>
          <p className="min-w-0 flex-1">
            {p.incompletas.sinMision.length} puestos sin misión · {p.incompletas.sinKpis.length} sin KPIs propios
            <span className="block text-[12.5px] text-muted-foreground">Mientras tanto, la ficha muestra lo del área.</span>
          </p>
          <Button
            variant="outline"
            className={`${BOTON} max-md:hidden`}
            onClick={() => {
              dispatch({ tipo: "entrar", autor: usuario ? nombreCompleto(usuario) : "Editor" });
              router.push("/organigrama");
            }}
          >
            Editar en borrador
          </Button>
        </div>
      </Seccion>
    </div>
  );
}
