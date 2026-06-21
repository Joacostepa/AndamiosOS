"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useObra } from "@/hooks/use-obras";
import { useCatalogo } from "@/hooks/use-catalogo";
import {
  useComputoByObra,
  useSaveComputoItems,
  useUpdateComputo,
} from "@/hooks/use-computos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CategoriaSidebar } from "@/components/computos/categoria-sidebar";
import { MaterialRow } from "@/components/computos/material-row";
import { ResumenBar } from "@/components/computos/resumen-bar";
import { InicialesAvatar } from "@/components/computos/iniciales-avatar";
import {
  ordenarCategorias,
  labelDeCategoria,
} from "@/lib/constants/categorias-material";
import { esCompletado, ESTADO_AL_CONFIRMAR } from "@/lib/computos/estado";
import { formatDate } from "@/lib/utils/formatters";
import { ArrowLeft, Save, Search, Package } from "lucide-react";
import { toast } from "sonner";

const DEBOUNCE_MS = 1500;

export default function ComputoObraPage({
  params,
}: {
  params: Promise<{ obraId: string }>;
}) {
  const { obraId } = use(params);
  const router = useRouter();

  const { data: obra, isLoading: obraLoading } = useObra(obraId);
  const { data: catalogo, isLoading: catLoading } = useCatalogo();
  const { data: computo, isLoading: compLoading } = useComputoByObra(obraId);
  const saveItems = useSaveComputoItems();
  const updateComputo = useUpdateComputo();

  // Cantidad por pieza (0 / ausente = inactivo).
  const [cantidades, setCantidades] = useState<Map<string, number>>(new Map());
  const [computoId, setComputoId] = useState<string | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const [desactivar, setDesactivar] = useState<{ id: string; nombre: string } | null>(null);

  const [hidratado, setHidratado] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendienteRef = useRef(false);

  const modoLectura = !!computo && esCompletado(computo.estado);

  // Categorías presentes en el catálogo, ordenadas.
  const categorias = useMemo(
    () => ordenarCategorias([...new Set((catalogo ?? []).map((p) => p.categoria))]),
    [catalogo],
  );
  // Categoría activa derivada: la elegida por el usuario o la primera disponible.
  const catActiva = categoriaActiva || categorias[0] || "";

  // Hidratar el estado local desde el cómputo guardado, una sola vez (fase de
  // render para no clobberear ediciones tras el refetch del autoguardado).
  if (!compLoading && !hidratado) {
    if (computo) {
      const map = new Map<string, number>();
      for (const it of computo.computo_items ?? []) {
        map.set(it.pieza_id, it.cantidad_requerida);
      }
      setCantidades(map);
      setComputoId(computo.id);
    }
    setHidratado(true);
  }

  // Aviso de cambios sin guardar al cerrar la pestaña (best-effort).
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (pendienteRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function buildItems() {
    return [...cantidades.entries()]
      .filter(([, n]) => n > 0)
      .map(([pieza_id, cantidad_requerida]) => ({ pieza_id, cantidad_requerida }));
  }

  async function persist(): Promise<string> {
    const res = await saveItems.mutateAsync({
      computoId,
      obraId,
      items: buildItems(),
    });
    setComputoId(res.id);
    pendienteRef.current = false;
    return res.id;
  }

  function scheduleSave() {
    if (modoLectura) return;
    pendienteRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      persist().catch(() => toast.error("No se pudo guardar el cómputo"));
    }, DEBOUNCE_MS);
  }

  function setCant(piezaId: string, n: number) {
    if (modoLectura) return;
    setCantidades((prev) => {
      const next = new Map(prev);
      if (n <= 0) next.delete(piezaId);
      else next.set(piezaId, Math.floor(n));
      return next;
    });
    scheduleSave();
  }

  function onToggle(piezaId: string, nombre: string) {
    const cant = cantidades.get(piezaId) ?? 0;
    if (cant === 0) setCant(piezaId, 1);
    else if (cant > 1) setDesactivar({ id: piezaId, nombre });
    else setCant(piezaId, 0);
  }

  async function guardarBorrador() {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await persist();
      toast.success("Borrador guardado");
    } catch {
      toast.error("No se pudo guardar el borrador");
    }
  }

  async function confirmarComputo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      const id = await persist();
      await updateComputo.mutateAsync({ id, data: { estado: ESTADO_AL_CONFIRMAR } });
      toast.success("Cómputo confirmado");
      router.push("/oficina-tecnica/computos");
    } catch {
      toast.error("No se pudo confirmar el cómputo");
    }
  }

  if (obraLoading || catLoading || compLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  if (!obra) {
    return (
      <EmptyState
        icon={Package}
        title="Obra no encontrada"
        description="La obra no existe o fue eliminada."
      />
    );
  }

  // Datos derivados para sidebar / panel / resumen.
  const catPorPieza = new Map((catalogo ?? []).map((p) => [p.id, p.categoria]));
  const conteoPorCategoria: Record<string, number> = {};
  let unidadesTotales = 0;
  const categoriasConItems = new Set<string>();
  for (const [piezaId, n] of cantidades) {
    if (n <= 0) continue;
    const cat = catPorPieza.get(piezaId) ?? "otro";
    conteoPorCategoria[cat] = (conteoPorCategoria[cat] ?? 0) + 1;
    unidadesTotales += n;
    categoriasConItems.add(cat);
  }
  const itemsSeleccionados = [...cantidades.values()].filter((n) => n > 0).length;

  const materialesCategoria = (catalogo ?? [])
    .filter((p) => p.categoria === catActiva)
    .filter((p) => {
      if (!busqueda.trim()) return true;
      const q = busqueda.toLowerCase();
      return (
        p.descripcion.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
      );
    });
  const seleccionadosEnCategoria = materialesCategoria.filter(
    (p) => (cantidades.get(p.id) ?? 0) > 0,
  ).length;

  const responsable = computo?.responsable
    ? `${computo.responsable.nombre} ${computo.responsable.apellido}`
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/oficina-tecnica/computos")}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Obras
            </Button>
            <h1 className="text-base font-medium">{obra.nombre}</h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={
                modoLectura
                  ? { backgroundColor: "#EAF3DE", color: "#3B6D11" }
                  : { backgroundColor: "#FAECE7", color: "#993C1D" }
              }
            >
              {modoLectura ? "Completado" : "Cómputo en curso"}
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{obra.codigo}</span>
            {obra.clientes?.razon_social && <>· <span>Cliente: {obra.clientes.razon_social}</span></>}
            {obra.fecha_inicio_estimada && (
              <>· <span>Inicio: {formatDate(obra.fecha_inicio_estimada)}</span></>
            )}
            {responsable && (
              <>
                ·{" "}
                <span className="inline-flex items-center gap-1">
                  <InicialesAvatar nombre={responsable} /> {responsable}
                </span>
              </>
            )}
          </p>
        </div>
        {!modoLectura && (
          <Button
            onClick={guardarBorrador}
            disabled={saveItems.isPending}
            style={{ backgroundColor: "#D85A30", color: "#fff" }}
          >
            <Save className="mr-2 h-4 w-4" />
            Guardar borrador
          </Button>
        )}
      </div>

      {/* Sidebar + panel principal */}
      <div className="flex min-h-0 flex-1 gap-6">
        <CategoriaSidebar
          categorias={categorias}
          activa={catActiva}
          onSelect={setCategoriaActiva}
          conteoPorCategoria={conteoPorCategoria}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar material..."
              className="bg-secondary pl-9"
            />
          </div>

          <div className="flex items-center justify-between text-[13px]">
            <p className="text-muted-foreground">
              {labelDeCategoria(catActiva)} · {materialesCategoria.length} materiales
            </p>
            <p className="text-xs text-muted-foreground">
              {seleccionadosEnCategoria} seleccionados
            </p>
          </div>

          <div className="space-y-2">
            {materialesCategoria.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No hay materiales en esta categoría.
              </p>
            ) : (
              materialesCategoria.map((p) => {
                const cant = cantidades.get(p.id) ?? 0;
                return (
                  <MaterialRow
                    key={p.id}
                    nombre={p.descripcion}
                    unidad={p.unidad_medida}
                    cantidad={cant}
                    disabled={modoLectura}
                    onIncrement={() => setCant(p.id, cant + 1)}
                    onDecrement={() => setCant(p.id, Math.max(1, cant - 1))}
                    onSetCantidad={(n) => setCant(p.id, n)}
                    onToggle={() => onToggle(p.id, p.descripcion)}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Barra de resumen inferior */}
      <ResumenBar
        itemsSeleccionados={itemsSeleccionados}
        unidadesTotales={unidadesTotales}
        categorias={categoriasConItems.size}
        modoLectura={modoLectura}
        guardando={saveItems.isPending}
        onConfirmar={() => setConfirmarOpen(true)}
      />

      <ConfirmDialog
        open={confirmarOpen}
        onOpenChange={setConfirmarOpen}
        title="Confirmar cómputo"
        description="Se va a marcar el cómputo como completado y queda como línea base de materiales de la obra. Después no se edita desde acá."
        confirmLabel="Confirmar cómputo"
        loading={updateComputo.isPending || saveItems.isPending}
        onConfirm={confirmarComputo}
      />

      <ConfirmDialog
        open={!!desactivar}
        onOpenChange={(o) => !o && setDesactivar(null)}
        title="Quitar material"
        description={`"${desactivar?.nombre}" tiene una cantidad cargada. ¿Quitarlo del cómputo?`}
        confirmLabel="Quitar"
        variant="destructive"
        onConfirm={() => {
          if (desactivar) setCant(desactivar.id, 0);
          setDesactivar(null);
        }}
      />
    </div>
  );
}
