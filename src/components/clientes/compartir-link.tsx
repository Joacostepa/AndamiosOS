"use client";

import { useState } from "react";
import { Copy, ExternalLink, Link2, Link2Off, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// «Compartir link» (JS, 16/11): genera la página pública de la charla (/charla/<token>), con la
// ficha, las fotos, los audios, los videos y la charla. Vence a los 30 días; se puede cortar antes.
// El link se copia al portapapeles con ClipboardItem y una promesa (Safari no deja copiar
// después de esperar un pedido si no es así).

type Link = { url: string; venceAt: string; visitas: number } | null;
const base = (id: string) => `/api/comercial/clientes/conversaciones/${id}/link`;

async function pedir(url: string, init?: RequestInit): Promise<{ link: Link }> {
  const r = await fetch(url, init);
  const body = (await r.json().catch(() => null)) as ({ link?: Link; error?: string } | null);
  if (!r.ok) throw new Error(body?.error ?? `Error ${r.status}`);
  return { link: body?.link ?? null };
}

async function copiar(texto: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": texto.then((t) => new Blob([t], { type: "text/plain" })) })]);
    } else {
      await navigator.clipboard.writeText(await texto);
    }
    return true;
  } catch {
    await texto; // si falló el pedido, que se vea ese error
    return false;
  }
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function CompartirLink({ charlaId, onCerrar }: { charlaId: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const clave = ["clientes-link", charlaId];
  const actual = useQuery({ queryKey: clave, queryFn: () => pedir(base(charlaId)), staleTime: 10_000 });
  const [copiando, setCopiando] = useState(false);
  const cortar = useMutation({
    mutationFn: () => pedir(base(charlaId), { method: "DELETE" }),
    onSuccess: () => {
      qc.setQueryData(clave, { link: null });
      void qc.invalidateQueries({ queryKey: ["clientes-charla", charlaId] });
      toast.success("Link cortado", { description: "Ya no abre. Si hace falta, generá uno nuevo." });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generarYCopiar = () => {
    setCopiando(true);
    const pedido = pedir(base(charlaId), { method: "POST" });
    const url = pedido.then((r) => {
      if (!r.link) throw new Error("No se pudo crear el link.");
      return r.link.url;
    });
    copiar(url)
      .then(async (ok) => {
        const r = await pedido;
        qc.setQueryData(clave, r);
        void qc.invalidateQueries({ queryKey: ["clientes-charla", charlaId] });
        if (ok) toast.success("Link copiado", { description: `Pegalo en Slack o WhatsApp. Vence el ${r.link ? fecha(r.link.venceAt) : ""}.` });
        else toast("Link listo", { description: "El navegador no dejó copiarlo solo: copialo de la casilla." });
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setCopiando(false));
  };

  const link = actual.data?.link ?? null;
  return (
    <div className="space-y-2 pt-1.5 pb-1 text-[13.5px]">
      {actual.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : link ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link de la charla" className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-[12.5px]" />
            <Button className="h-10" onClick={generarYCopiar} disabled={copiando}>
              {copiando ? <Loader2 className="animate-spin" /> : <Copy />} Copiar
            </Button>
            <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-[13.5px] hover:bg-muted">
              <ExternalLink className="size-4" /> Abrir
            </a>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Lo abre cualquiera que tenga el link, hasta el {fecha(link.venceAt)}. {link.visitas ? `Se abrió ${link.visitas} ${link.visitas === 1 ? "vez" : "veces"}.` : "Todavía no lo abrió nadie."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="h-10 text-destructive" onClick={() => cortar.mutate()} disabled={cortar.isPending}>
              {cortar.isPending ? <Loader2 className="animate-spin" /> : <Link2Off />} Cortar el link
            </Button>
            <Button variant="ghost" className="h-10" onClick={onCerrar}>Cerrar</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            Arma una página con los datos del cliente, el servicio, las fotos, los audios, los videos y la charla, para pasarla por Slack o WhatsApp. La abre cualquiera que tenga el link, durante 30 días.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10" onClick={generarYCopiar} disabled={copiando}>
              {copiando ? <Loader2 className="animate-spin" /> : <Link2 />} Generar y copiar el link
            </Button>
            <Button variant="ghost" className="h-10" onClick={onCerrar}>Cancelar</Button>
          </div>
        </>
      )}
    </div>
  );
}
