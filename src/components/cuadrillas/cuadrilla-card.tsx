"use client";

import { useState } from "react";
import { MoreVertical, UserPlus, X, RefreshCw, Trash2, Power, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InicialesAvatar } from "@/components/computos/iniciales-avatar";
import { inicialesCuadrilla, nombreCorto } from "@/lib/cuadrillas";
import {
  useAddOperarioPlantel,
  useRemoveOperarioPlantel,
  useUpdateCuadrilla,
  type CuadrillaConfig,
} from "@/hooks/use-cuadrillas";
import type { Personal } from "@/hooks/use-personal";
import { toast } from "sonner";

export function CuadrillaCard({
  cuadrilla,
  operariosSinCuadrilla,
  onEditarNombre,
  onToggleActivo,
  onEliminar,
}: {
  cuadrilla: CuadrillaConfig;
  operariosSinCuadrilla: Personal[];
  onEditarNombre: () => void;
  onToggleActivo: () => void;
  onEliminar: () => void;
}) {
  const addOperario = useAddOperarioPlantel();
  const removeOperario = useRemoveOperarioPlantel();
  const updateCuadrilla = useUpdateCuadrilla();
  const [quitarResp, setQuitarResp] = useState<{ id: string; nombre: string } | null>(null);

  const activa = cuadrilla.activo;
  const plantel = cuadrilla.cuadrilla_personal ?? [];
  const responsable = plantel.find((p) => p.personal_id === cuadrilla.responsable_id)?.personal ?? null;

  function quitar(personalId: string, nombre: string) {
    if (personalId === cuadrilla.responsable_id) {
      setQuitarResp({ id: personalId, nombre });
    } else {
      removeOperario.mutate({ cuadrillaId: cuadrilla.id, personalId });
    }
  }
  function cambiarResponsable(personalId: string) {
    updateCuadrilla.mutate(
      { id: cuadrilla.id, data: { responsable_id: personalId } },
      { onError: () => toast.error("No se pudo cambiar el responsable") },
    );
  }

  return (
    <div
      className={cn("flex flex-col rounded-lg border bg-card", !activa && "opacity-55")}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={
            activa
              ? { backgroundColor: "#FAECE7", color: "#993C1D" }
              : { backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }
          }
        >
          {inicialesCuadrilla(cuadrilla.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{cuadrilla.nombre}</p>
          <p className="text-[11px] text-muted-foreground">{plantel.length} operarios</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={
            activa
              ? { backgroundColor: "#EAF3DE", color: "#3B6D11" }
              : { backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }
          }
        >
          {activa ? "Activa" : "Inactiva"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Opciones" />}
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onEditarNombre}>
              <Pencil className="mr-2 h-4 w-4" /> Editar nombre
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleActivo}>
              <Power className="mr-2 h-4 w-4" /> {activa ? "Desactivar cuadrilla" : "Activar cuadrilla"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEliminar} style={{ color: "#D85A30" }}>
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar cuadrilla
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Responsable */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: "rgba(216,90,48,0.03)", borderBottom: "0.5px solid var(--border)" }}
      >
        {responsable ? (
          <>
            <InicialesAvatar nombre={`${responsable.nombre} ${responsable.apellido}`} size={28} bg="#D85A30" color="#fff" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.04em]" style={{ color: "#D85A30" }}>
                Responsable
              </p>
              <p className="truncate text-xs font-semibold" style={{ color: "#993C1D" }}>
                {responsable.nombre} {responsable.apellido}
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 text-[11px] text-muted-foreground">Sin responsable asignado</div>
        )}
        {activa && plantel.length > 0 && (
          <Popover>
            <PopoverTrigger render={<Button variant="ghost" size="xs" className="text-muted-foreground" />}>
              <RefreshCw className="mr-1 h-3 w-3" /> {responsable ? "Cambiar" : "Asignar"}
            </PopoverTrigger>
            <PopoverContent className="w-52 max-h-56 overflow-y-auto p-1">
              {plantel.map((p) => (
                <button
                  key={p.personal_id}
                  type="button"
                  onClick={() => cambiarResponsable(p.personal_id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <InicialesAvatar nombre={`${p.personal?.nombre} ${p.personal?.apellido}`} size={18} />
                  {p.personal?.nombre} {p.personal?.apellido}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Personal base */}
      <div className="flex-1 space-y-1 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Personal base</p>
        {plantel.length === 0 && <p className="py-2 text-[11px] text-muted-foreground">Sin operarios.</p>}
        {plantel.map((p) => (
          <div key={p.personal_id} className="group/op flex items-center gap-2 rounded px-1 py-0.5">
            <InicialesAvatar
              nombre={`${p.personal?.nombre} ${p.personal?.apellido}`}
              size={24}
              bg="var(--secondary)"
              color="var(--secondary-foreground)"
            />
            <span className="min-w-0 flex-1 truncate text-xs">
              {nombreCorto(p.personal?.nombre ?? "", p.personal?.apellido ?? "")}
            </span>
            {activa && (
              <button
                type="button"
                onClick={() => quitar(p.personal_id, `${p.personal?.nombre} ${p.personal?.apellido}`)}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/op:opacity-100"
                aria-label="Quitar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        {activa && (
          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" size="sm" className="mt-1 w-full justify-center border-dashed text-muted-foreground" />}
            >
              <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Agregar operario
            </PopoverTrigger>
            <PopoverContent className="w-56 max-h-64 overflow-y-auto p-1">
              {operariosSinCuadrilla.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">No hay operarios sin cuadrilla.</p>
              )}
              {operariosSinCuadrilla.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => addOperario.mutate({ cuadrillaId: cuadrilla.id, personalId: op.id })}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <InicialesAvatar nombre={`${op.nombre} ${op.apellido}`} size={18} />
                  {op.nombre} {op.apellido}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>

      <ConfirmDialog
        open={!!quitarResp}
        onOpenChange={(o) => !o && setQuitarResp(null)}
        title="Quitar responsable"
        description={`"${quitarResp?.nombre}" es el responsable de la cuadrilla. Si lo quitás, la cuadrilla queda sin responsable. ¿Continuar?`}
        confirmLabel="Quitar"
        variant="destructive"
        onConfirm={() => {
          if (quitarResp) removeOperario.mutate({ cuadrillaId: cuadrilla.id, personalId: quitarResp.id });
          setQuitarResp(null);
        }}
      />
    </div>
  );
}
