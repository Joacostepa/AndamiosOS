"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Plus } from "lucide-react";
import { CuadrillaCard } from "@/components/cuadrillas/cuadrilla-card";
import { NuevaCuadrillaCard } from "@/components/cuadrillas/nueva-cuadrilla-card";
import { OperarioPool } from "@/components/cuadrillas/operario-pool";
import { CuadrillaModal } from "@/components/cuadrillas/cuadrilla-modal";
import {
  useCuadrillasConfig,
  useCreateCuadrilla,
  useUpdateCuadrilla,
  useDeleteCuadrilla,
  useFuturasPorCuadrilla,
  type CuadrillaConfig,
} from "@/hooks/use-cuadrillas";
import { usePersonal } from "@/hooks/use-personal";
import { esPersonalDeObra } from "@/lib/planificacion/constantes";

export default function CuadrillasConfigPage() {
  const { data: cuadrillas, isLoading } = useCuadrillasConfig();
  const { data: personal } = usePersonal();
  const { data: futuras } = useFuturasPorCuadrilla();
  const createCuadrilla = useCreateCuadrilla();
  const updateCuadrilla = useUpdateCuadrilla();
  const deleteCuadrilla = useDeleteCuadrilla();

  const [modal, setModal] = useState<{ modo: "crear" | "editar"; id?: string; nombre?: string } | null>(null);
  const [eliminar, setEliminar] = useState<CuadrillaConfig | null>(null);
  const [desactivar, setDesactivar] = useState<{ c: CuadrillaConfig; fut: number } | null>(null);

  const personalObra = useMemo(() => (personal ?? []).filter((p) => esPersonalDeObra(p.puesto)), [personal]);

  // personalId → nombre de cuadrilla
  const cuadrillaDe = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of cuadrillas ?? []) {
      for (const p of c.cuadrilla_personal ?? []) map[p.personal_id] = c.nombre;
    }
    return map;
  }, [cuadrillas]);
  const operariosSinCuadrilla = useMemo(
    () => personalObra.filter((op) => !cuadrillaDe[op.id]),
    [personalObra, cuadrillaDe],
  );

  function handleToggle(c: CuadrillaConfig) {
    const fut = futuras?.[c.id] ?? 0;
    if (c.activo && fut > 0) {
      setDesactivar({ c, fut });
      return;
    }
    updateCuadrilla.mutate(
      { id: c.id, data: { activo: !c.activo } },
      { onSuccess: () => toast.success(c.activo ? "Cuadrilla desactivada" : "Cuadrilla activada") },
    );
  }
  function handleEliminar(c: CuadrillaConfig) {
    if ((futuras?.[c.id] ?? 0) > 0) {
      toast.error("No se puede eliminar: tiene jornadas futuras asignadas.");
      return;
    }
    setEliminar(c);
  }
  function submitModal(nombre: string) {
    if (modal?.modo === "crear") {
      createCuadrilla.mutate(
        { nombre },
        { onSuccess: () => { toast.success("Cuadrilla creada"); setModal(null); }, onError: () => toast.error("No se pudo crear") },
      );
    } else if (modal?.modo === "editar" && modal.id) {
      updateCuadrilla.mutate(
        { id: modal.id, data: { nombre } },
        { onSuccess: () => { toast.success("Nombre actualizado"); setModal(null); }, onError: () => toast.error("No se pudo actualizar") },
      );
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cuadrillas"
        description="Composición base de cada cuadrilla · se precarga al planificar cada jornada"
      >
        <Button onClick={() => setModal({ modo: "crear" })} style={{ backgroundColor: "#D85A30", color: "#fff" }}>
          <Plus className="mr-2 h-4 w-4" /> Nueva cuadrilla
        </Button>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(cuadrillas ?? []).map((c) => (
          <CuadrillaCard
            key={c.id}
            cuadrilla={c}
            operariosSinCuadrilla={operariosSinCuadrilla}
            onEditarNombre={() => setModal({ modo: "editar", id: c.id, nombre: c.nombre })}
            onToggleActivo={() => handleToggle(c)}
            onEliminar={() => handleEliminar(c)}
          />
        ))}
        <NuevaCuadrillaCard onClick={() => setModal({ modo: "crear" })} />
      </div>

      <OperarioPool operarios={personalObra} cuadrillaDe={cuadrillaDe} />

      <CuadrillaModal
        open={!!modal}
        onOpenChange={(o) => !o && setModal(null)}
        modo={modal?.modo ?? "crear"}
        nombreInicial={modal?.nombre ?? ""}
        saving={createCuadrilla.isPending || updateCuadrilla.isPending}
        onSubmit={submitModal}
      />

      <ConfirmDialog
        open={!!desactivar}
        onOpenChange={(o) => !o && setDesactivar(null)}
        title="Desactivar cuadrilla"
        description={`Esta cuadrilla tiene ${desactivar?.fut ?? 0} jornadas planificadas en el futuro. Desactivarla no eliminará esas asignaciones.`}
        confirmLabel="Desactivar"
        onConfirm={() => {
          if (desactivar)
            updateCuadrilla.mutate(
              { id: desactivar.c.id, data: { activo: false } },
              { onSuccess: () => toast.success("Cuadrilla desactivada") },
            );
          setDesactivar(null);
        }}
      />

      <ConfirmDialog
        open={!!eliminar}
        onOpenChange={(o) => !o && setEliminar(null)}
        title="Eliminar cuadrilla"
        description={`¿Eliminar "${eliminar?.nombre}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={deleteCuadrilla.isPending}
        onConfirm={() => {
          if (eliminar)
            deleteCuadrilla.mutate(eliminar.id, {
              onSuccess: () => { toast.success("Cuadrilla eliminada"); setEliminar(null); },
              onError: () => toast.error("No se pudo eliminar"),
            });
        }}
      />
    </div>
  );
}
