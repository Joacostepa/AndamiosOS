"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useComputos, type Computo } from "@/hooks/use-computos";
import { useObras, type Obra } from "@/hooks/use-obras";
import { useCatalogo } from "@/hooks/use-catalogo";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InicialesAvatar } from "@/components/computos/iniciales-avatar";
import {
  bucketDeComputo,
  progresoComputo,
  BUCKET_TOKENS,
} from "@/lib/computos/estado";
import { formatDate } from "@/lib/utils/formatters";
import {
  Calculator,
  Plus,
  Clock,
  Loader,
  CircleCheck,
  Eye,
  EyeOff,
  Pencil,
  ArrowRight,
  Building2,
} from "lucide-react";

const LS_KEY = "computos:mostrarCompletados";

function responsableNombre(c: Computo): string | null {
  return c.responsable ? `${c.responsable.nombre} ${c.responsable.apellido}` : null;
}

function SectionHeader({
  icon: Icon,
  iconColor,
  title,
  count,
  badgeBg,
  badgeText,
  right,
}: {
  icon: typeof Clock;
  iconColor: string;
  title: string;
  count: number;
  badgeBg: string;
  badgeText: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" style={{ color: iconColor }} />
      <h2 className="text-sm font-semibold">{title}</h2>
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: badgeBg, color: badgeText }}
      >
        {count}
      </span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export default function ComputosPage() {
  const router = useRouter();
  const { data: computos, isLoading } = useComputos();
  const { data: obras } = useObras();
  const { data: catalogo } = useCatalogo();

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [mostrarCompletados, setMostrarCompletados] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(LS_KEY) !== "false";
  });

  const totalCategorias = useMemo(
    () => new Set((catalogo ?? []).map((p) => p.categoria)).size,
    [catalogo],
  );

  const irAObra = (obraId: string) =>
    router.push(`/oficina-tecnica/computos/${obraId}`);

  function toggleCompletados() {
    setMostrarCompletados((prev) => {
      const next = !prev;
      window.localStorage.setItem(LS_KEY, String(next));
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const lista = computos ?? [];
  const conComputo = new Set(lista.map((c) => c.obra_id));
  const pendientes = (obras ?? []).filter(
    (o) =>
      o.estado !== "cancelada" &&
      o.estado !== "desarmado" &&
      !conComputo.has(o.id),
  );
  const enProceso = lista.filter((c) => bucketDeComputo(c.estado) === "en_proceso");
  const completados = lista.filter((c) => bucketDeComputo(c.estado) === "completado");

  const sinNada =
    pendientes.length === 0 && enProceso.length === 0 && completados.length === 0;

  return (
    <div className="space-y-8 pb-6">
      <PageHeader
        title="Cómputos de materiales"
        description="Cómputo madre de cada obra · línea base para remitos y desvíos"
      >
        <Button
          onClick={() => setSelectorOpen(true)}
          disabled={pendientes.length === 0}
          style={{ backgroundColor: "#D85A30", color: "#fff" }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo cómputo
        </Button>
      </PageHeader>

      {sinNada && (
        <EmptyState
          icon={Calculator}
          title="Sin cómputos"
          description="Cuando se confirmen obras en Odoo, van a aparecer acá como pendientes de cómputo."
        />
      )}

      {/* Sección 1 — Pendientes de cómputo */}
      {pendientes.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            icon={Clock}
            iconColor="#BA7517"
            title="Pendientes de cómputo"
            count={pendientes.length}
            badgeBg={BUCKET_TOKENS.pendiente.badgeBg}
            badgeText={BUCKET_TOKENS.pendiente.badgeText}
          />
          <div className="space-y-2">
            {pendientes.map((o) => (
              <ObraPendienteCard key={o.id} obra={o} onComputar={() => irAObra(o.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Sección 2 — En proceso */}
      {enProceso.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            icon={Loader}
            iconColor="#185FA5"
            title="En proceso"
            count={enProceso.length}
            badgeBg={BUCKET_TOKENS.en_proceso.badgeBg}
            badgeText={BUCKET_TOKENS.en_proceso.badgeText}
          />
          <div className="space-y-2">
            {enProceso.map((c) => (
              <ComputoEnProcesoCard
                key={c.id}
                computo={c}
                totalCategorias={totalCategorias}
                onContinuar={() => irAObra(c.obra_id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sección 3 — Completados */}
      {completados.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            icon={CircleCheck}
            iconColor="#3B6D11"
            title="Completados"
            count={completados.length}
            badgeBg={BUCKET_TOKENS.completado.badgeBg}
            badgeText={BUCKET_TOKENS.completado.badgeText}
            right={
              <Button variant="ghost" size="sm" onClick={toggleCompletados}>
                {mostrarCompletados ? (
                  <>
                    <EyeOff className="mr-1.5 h-4 w-4" />
                    Ocultar completados
                  </>
                ) : (
                  <>
                    <Eye className="mr-1.5 h-4 w-4" />
                    Mostrar completados
                  </>
                )}
              </Button>
            }
          />
          {mostrarCompletados ? (
            <div className="space-y-2">
              {completados.map((c) => (
                <ComputoCompletadoCard
                  key={c.id}
                  computo={c}
                  onVer={() => irAObra(c.obra_id)}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={toggleCompletados}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-transparent py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
            >
              <Eye className="h-4 w-4" />
              Mostrar {completados.length} cómputos completados
            </button>
          )}
        </section>
      )}

      {/* Selector de obra para "Nuevo cómputo" */}
      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo cómputo</DialogTitle>
            <DialogDescription>
              Elegí la obra a computar. Solo aparecen las obras confirmadas sin cómputo.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {pendientes.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setSelectorOpen(false);
                  irAObra(o.id);
                }}
                className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/60"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.nombre}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {o.codigo}
                    {o.clientes?.razon_social ? ` · ${o.clientes.razon_social}` : ""}
                  </p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Cards ---------- */

function MetaLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function ObraPendienteCard({ obra, onComputar }: { obra: Obra; onComputar: () => void }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
      style={{ borderLeft: `3px solid ${BUCKET_TOKENS.pendiente.borde}` }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{obra.nombre}</p>
        <MetaLine>
          <span className="font-mono">{obra.codigo}</span>
          {obra.clientes?.razon_social && <>· <span>{obra.clientes.razon_social}</span></>}
          {obra.fecha_inicio_estimada && (
            <>· <span>Inicio: {formatDate(obra.fecha_inicio_estimada)}</span></>
          )}
        </MetaLine>
      </div>
      <Button
        size="sm"
        onClick={onComputar}
        style={{ backgroundColor: "#D85A30", color: "#fff" }}
      >
        <Calculator className="mr-1.5 h-4 w-4" />
        Computar
      </Button>
    </div>
  );
}

function ComputoEnProcesoCard({
  computo,
  totalCategorias,
  onContinuar,
}: {
  computo: Computo;
  totalCategorias: number;
  onContinuar: () => void;
}) {
  const items = (computo.computo_items ?? []).map((i) => ({
    cantidad: i.cantidad_requerida,
    categoria: i.catalogo_piezas?.categoria ?? "otro",
  }));
  const progreso = progresoComputo(items, totalCategorias);
  const resp = responsableNombre(computo);

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border bg-card p-3"
      style={{ borderLeft: `3px solid ${BUCKET_TOKENS.en_proceso.borde}` }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{computo.obras?.nombre}</p>
        <MetaLine>
          <span className="font-mono">{computo.obras?.codigo}</span>
          {computo.obras?.clientes?.razon_social && (
            <>· <span>{computo.obras.clientes.razon_social}</span></>
          )}
          {resp && (
            <>
              ·{" "}
              <span className="inline-flex items-center gap-1">
                <InicialesAvatar nombre={resp} /> {resp}
              </span>
            </>
          )}
        </MetaLine>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-[5px] w-20 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={progreso}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${progreso}%`, backgroundColor: BUCKET_TOKENS.en_proceso.barra }}
          />
        </div>
        <span className="w-9 text-right text-xs text-muted-foreground">{progreso}%</span>
      </div>
      <Button size="sm" variant="outline" onClick={onContinuar}>
        <Pencil className="mr-1.5 h-4 w-4" />
        Continuar
      </Button>
    </div>
  );
}

function ComputoCompletadoCard({
  computo,
  onVer,
}: {
  computo: Computo;
  onVer: () => void;
}) {
  const resp = responsableNombre(computo);
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 opacity-70"
      style={{ borderLeft: `3px solid ${BUCKET_TOKENS.completado.borde}` }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{computo.obras?.nombre}</p>
        <MetaLine>
          <span className="font-mono">{computo.obras?.codigo}</span>
          {computo.obras?.clientes?.razon_social && (
            <>· <span>{computo.obras.clientes.razon_social}</span></>
          )}
          <>· <span>Completado {formatDate(computo.created_at)}</span></>
          {resp && (
            <>
              ·{" "}
              <span className="inline-flex items-center gap-1">
                <InicialesAvatar nombre={resp} /> {resp}
              </span>
            </>
          )}
        </MetaLine>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onVer}
        style={{
          backgroundColor: BUCKET_TOKENS.completado.badgeBg,
          color: BUCKET_TOKENS.completado.badgeText,
          borderColor: BUCKET_TOKENS.completado.botonBorde,
        }}
      >
        <Eye className="mr-1.5 h-4 w-4" />
        Ver
      </Button>
    </div>
  );
}
