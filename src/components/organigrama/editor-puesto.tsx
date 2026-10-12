"use client";

// Editar la ficha de un puesto EN EL BORRADOR (react-hook-form). La dependencia no se edita acá:
// se cambia con «Mover a…», que es el único camino que chequea ciclos.
//
// Las tareas son una lista con un input por fila, sus documentos (código + rol) y botones
// visibles ↑ ↓ y quitar, todos con aria-label: nada aparece solo con hover.

import { useFieldArray, useForm, type Control, type UseFormRegister } from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nodoDe } from "@/lib/organigrama/arbol";
import type { CodigoDoc, DocTarea, Nodo, RolDoc } from "@/lib/organigrama/tipos";
import { ChipDocumento } from "./chip-documento";
import { useOrg } from "./proveedor";

type Valores = {
  titulo: string;
  rol: string;
  mision: string;
  tareas: { texto: string; docs: DocTarea[] }[];
  noHace: string;
  kpis: string;
  notaDiseno: string;
  notaInterna: string;
};

const ROLES: RolDoc[] = ["emite", "firma", "recibe", "usa"];
const SELECT = "h-9 rounded-md border bg-background px-2 text-[13px] text-foreground max-sm:h-10 dark:[color-scheme:dark]";

const lineas = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function DocsDeTarea({ control, indice }: { control: Control<Valores>; indice: number }) {
  const { documentos } = useOrg();
  const { fields, append, remove } = useFieldArray({ control, name: `tareas.${indice}.docs` as const });
  const [codigo, setCodigo] = useState<CodigoDoc>("RS");
  const [rol, setRol] = useState<RolDoc>("emite");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {fields.map((f, j) => (
        <span key={f.id} className="inline-flex items-center gap-0.5">
          <ChipDocumento doc={{ codigo: f.codigo, rol: f.rol }} interactivo={false} />
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(j)} aria-label={`Quitar ${f.codigo} · ${f.rol}`}>
            <X aria-hidden />
          </Button>
        </span>
      ))}
      <span className="inline-flex flex-wrap items-center gap-1">
        <select aria-label="Documento" value={codigo} onChange={(e) => setCodigo(e.target.value as CodigoDoc)} className={SELECT}>
          {documentos.map((d) => (
            <option key={d.codigo} value={d.codigo}>
              {d.codigo} · {d.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Rol del puesto en el documento" value={rol} onChange={(e) => setRol(e.target.value as RolDoc)} className={SELECT}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" className="h-9 max-sm:h-10" onClick={() => append({ codigo, rol })}>
          <Plus aria-hidden /> Documento
        </Button>
      </span>
    </div>
  );
}

function ListaTareas({ control, register }: { control: Control<Valores>; register: UseFormRegister<Valores> }) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "tareas" });
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Qué hace ({fields.length})</legend>
      <ol className="grid gap-2">
        {fields.map((f, i) => (
          <li key={f.id} className="grid gap-2 rounded-md border bg-background/40 p-2">
            <div className="flex items-center gap-1">
              <span className="w-5 shrink-0 text-right font-mono text-[12px] text-muted-foreground">{i + 1}</span>
              <Input {...register(`tareas.${i}.texto` as const)} aria-label={`Tarea ${i + 1}`} className="h-9 max-sm:h-10" />
              <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Subir la tarea ${i + 1}`}>
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={i === fields.length - 1}
                onClick={() => move(i, i + 1)}
                aria-label={`Bajar la tarea ${i + 1}`}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Quitar la tarea ${i + 1}`}>
                <Trash2 aria-hidden />
              </Button>
            </div>
            <div className="pl-6">
              <DocsDeTarea control={control} indice={i} />
            </div>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" className="h-9 justify-self-start max-sm:h-10" onClick={() => append({ texto: "", docs: [] })}>
        <Plus aria-hidden /> Agregar tarea
      </Button>
    </fieldset>
  );
}

export function EditorPuesto({ clave, onCerrar }: { clave: string; onCerrar: () => void }) {
  const { datos, dispatch, enBorrador } = useOrg();
  const nodo = nodoDe(datos.nodos, clave);
  const padre = nodoDe(datos.nodos, nodo?.dependeDe);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Valores>({
    defaultValues: {
      titulo: nodo?.titulo ?? "",
      rol: nodo?.rol ?? "",
      mision: nodo?.mision ?? "",
      tareas: (nodo?.tareas ?? []).map((t) => ({ texto: t.texto, docs: t.docs ?? [] })),
      noHace: (nodo?.noHace ?? []).join("\n"),
      kpis: (nodo?.kpis ?? []).join("\n"),
      notaDiseno: nodo?.notaDiseno ?? "",
      notaInterna: nodo?.notaInterna ?? "",
    },
  });

  if (!nodo || !enBorrador) return null;

  const guardar = (v: Valores) => {
    const nuevo: Nodo = {
      ...nodo,
      titulo: v.titulo.trim(),
      rol: v.rol.trim() || undefined,
      mision: v.mision.trim() || undefined,
      tareas: v.tareas
        .filter((t) => t.texto.trim())
        .map((t) => ({ texto: t.texto.trim(), ...(t.docs.length ? { docs: t.docs.map((d) => ({ codigo: d.codigo, rol: d.rol })) } : {}) })),
      noHace: lineas(v.noHace),
      kpis: lineas(v.kpis),
      notaDiseno: v.notaDiseno.trim() || undefined,
      notaInterna: v.notaInterna.trim() || undefined,
    };
    dispatch({ tipo: "estructura", nodos: datos.nodos.map((x) => (x.clave === clave ? nuevo : x)) });
    toast(`Guardaste ${nuevo.titulo} en el borrador.`);
    onCerrar();
  };

  return (
    <HojaLateral
      abierta
      onCerrar={onCerrar}
      titulo={`Editar ficha · ${nodo.titulo}`}
      sub="Los cambios quedan en el borrador hasta que se publique."
      pie={
        <>
          <Button variant="outline" className="h-9 max-sm:h-10" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" form="editor-puesto" className="h-9 max-sm:h-10">
            Guardar en borrador
          </Button>
        </>
      }
    >
      <form id="editor-puesto" onSubmit={handleSubmit(guardar)} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ed-titulo">Título</Label>
          <Input
            id="ed-titulo"
            {...register("titulo", { validate: (x) => !!x.trim() || "El puesto necesita un título" })}
            aria-invalid={!!errors.titulo}
            className="h-9 max-sm:h-10"
          />
          {errors.titulo && <p className="text-[12.5px] text-red-700 dark:text-red-300">{errors.titulo.message}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ed-rol">Rol</Label>
          <Input id="ed-rol" {...register("rol")} placeholder="Ej.: Coordinación de viajes" className="h-9 max-sm:h-10" />
        </div>
        <p className="text-[13px] text-muted-foreground">
          Depende de: <span className="font-medium text-foreground">{padre?.titulo ?? "— (es la raíz)"}</span>. Se cambia con «Mover a…».
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="ed-mision">Para qué está (misión)</Label>
          <Textarea id="ed-mision" {...register("mision")} rows={3} />
        </div>
        <ListaTareas control={control} register={register} />
        <div className="grid gap-1.5">
          <Label htmlFor="ed-nohace">Qué NO hace (una por línea)</Label>
          <Textarea id="ed-nohace" {...register("noHace")} rows={3} placeholder="Si queda vacío, se muestra lo del área." />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ed-kpis">Cómo se mide (un KPI por línea)</Label>
          <Textarea id="ed-kpis" {...register("kpis")} rows={3} placeholder="Si queda vacío, se muestran los del área." />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ed-nota">Por qué está así (nota pública)</Label>
          <Textarea id="ed-nota" {...register("notaDiseno")} rows={2} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ed-interna">Nota interna (solo editores)</Label>
          <Textarea id="ed-interna" {...register("notaInterna")} rows={2} />
        </div>
      </form>
    </HojaLateral>
  );
}
