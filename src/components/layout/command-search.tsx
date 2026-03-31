"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useClientes } from "@/hooks/use-clientes";
import { useCotizaciones } from "@/hooks/use-cotizaciones";
import { useOportunidades } from "@/hooks/use-oportunidades";
import { navigation } from "@/lib/constants/navigation";
import {
  Search,
  Users,
  DollarSign,
  Target,
  FileText,
} from "lucide-react";

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const { data: clientes } = useClientes();
  const { data: cotizaciones } = useCotizaciones();
  const { data: oportunidades } = useOportunidades();

  // Cmd+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  // Flatten navigation items
  const navItems = navigation.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      label: group.label,
    }))
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden sm:inline-flex ml-2 h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-mono">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
        <CommandInput placeholder="Buscar páginas, clientes, cotizaciones..." />
        <CommandList>
          <CommandEmpty>No se encontraron resultados.</CommandEmpty>

          {/* Páginas */}
          <CommandGroup heading="Páginas">
            {navItems.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => go(item.href)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.title}</span>
                {item.label && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {item.label}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>

          {/* Clientes */}
          {clientes && clientes.length > 0 && (
            <CommandGroup heading="Clientes">
              {clientes.slice(0, 10).map((c) => (
                <CommandItem
                  key={c.id}
                  onSelect={() => go(`/clientes/${c.id}`)}
                  className="gap-2"
                >
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{c.razon_social}</span>
                  {c.telefono && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.telefono}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Cotizaciones */}
          {cotizaciones && cotizaciones.length > 0 && (
            <CommandGroup heading="Cotizaciones">
              {cotizaciones.slice(0, 10).map((c) => (
                <CommandItem
                  key={c.id}
                  onSelect={() => go(`/comercial/cotizaciones/${c.id}`)}
                  className="gap-2"
                >
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{c.codigo}</span>
                  <span className="truncate">{c.titulo}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    ${Number(c.total).toLocaleString()}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Oportunidades */}
          {oportunidades && oportunidades.length > 0 && (
            <CommandGroup heading="Oportunidades">
              {oportunidades.slice(0, 10).map((o) => (
                <CommandItem
                  key={o.id}
                  onSelect={() => go(`/comercial/oportunidades/${o.id}`)}
                  className="gap-2"
                >
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{o.codigo}</span>
                  <span className="truncate">{o.titulo}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
