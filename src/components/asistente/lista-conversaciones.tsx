"use client";

import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Loader2, MessageSquarePlus, MoreHorizontal, Search, Trash2, X } from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useBuscarConversaciones } from "@/hooks/use-asistente";
import type { ConversacionListada } from "@/lib/asistente/datos";

// La lista de conversaciones, con el buscador arriba. El buscador encuentra también las
// archivadas (así se recuperan) y, a un admin, las de todos.

type Acciones = {
  onElegir: (id: string) => void;
  onArchivar: (id: string, archivar: boolean) => void;
  onEliminar: (id: string) => void;
};

export function ListaConversaciones({
  conversaciones,
  actual,
  onNueva,
  creando,
  ...acciones
}: Acciones & {
  conversaciones: ConversacionListada[];
  actual: string | null;
  onNueva: () => void;
  creando: boolean;
}) {
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const buscando = q.trim().length >= 2;
  const resultados = useBuscarConversaciones(buscado);
  const items = buscando ? (resultados.data ?? []) : conversaciones;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <Button className="w-full" onClick={onNueva} disabled={creando}>
          {creando ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />} Nueva conversación
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente, obra, S0…"
            aria-label="Buscar conversaciones"
            className="pr-8 pl-8"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Borrar la búsqueda"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {items.map((c) => <Item key={c.id} c={c} actual={actual} {...acciones} />)}
        {buscando && (resultados.isFetching || buscado !== q.trim()) && items.length === 0 && (
          <li className="flex items-center gap-2 px-2.5 py-2 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Buscando…</li>
        )}
        {buscando && !resultados.isFetching && buscado === q.trim() && items.length === 0 && (
          <li className="px-2.5 py-2 text-[12px] text-muted-foreground">No encontré nada con «{q.trim()}».</li>
        )}
        {!buscando && conversaciones.length === 0 && <li className="px-2.5 py-2 text-[12px] text-muted-foreground">Todavía no hay conversaciones.</li>}
      </ul>
    </div>
  );
}

function Item({ c, actual, onElegir, onArchivar, onEliminar }: Acciones & { c: ConversacionListada; actual: string | null }) {
  const obra = [c.cliente, c.obra].filter(Boolean).join(" · ");
  const pie = [
    c.venta,
    c.ultimo_mensaje_at ? `hace ${formatDistanceToNowStrict(parseISO(c.ultimo_mensaje_at), { locale: es })}` : "sin mensajes",
    c.archivada ? "archivada" : null,
    c.dueno ? `de ${c.dueno}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <li className="group relative">
      <button
        onClick={() => onElegir(c.id)}
        className={`w-full rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${c.id === actual ? "bg-muted" : "hover:bg-muted/60"}`}
      >
        <p className="truncate pr-7">{c.titulo ?? "Conversación nueva"}</p>
        {obra && <p className="truncate text-[12px] text-muted-foreground">{obra}</p>}
        {c.fragmento && (
          <p className="line-clamp-2 text-[12px] text-muted-foreground">
            {c.fragmento.map((t, i) => (t.marca ? <mark key={i} className="rounded-sm bg-primary/15 text-foreground">{t.t}</mark> : <span key={i}>{t.t}</span>))}
          </p>
        )}
        <p className="truncate text-[11px] text-muted-foreground">{pie}</p>
      </button>
      {/* Sólo sobre las propias. Siempre visible en el celular (no hay "pasar el mouse"). */}
      {!c.dueno && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground hover:bg-background focus-visible:opacity-100 data-[popup-open]:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                aria-label="Opciones de la conversación"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {!c.ultimo_mensaje_at ? (
              <DropdownMenuItem variant="destructive" onClick={() => onEliminar(c.id)}>
                <Trash2 /> Eliminar
              </DropdownMenuItem>
            ) : c.archivada ? (
              <DropdownMenuItem onClick={() => onArchivar(c.id, false)}>
                <ArchiveRestore /> Desarchivar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onArchivar(c.id, true)}>
                <Archive /> Archivar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
