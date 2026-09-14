"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditorUsuario } from "@/components/usuarios/editor-usuario";
import { ClaveTemporalDialog } from "@/components/usuarios/clave-temporal-dialog";
import { useUsuarios, type UsuarioAdmin } from "@/hooks/use-usuarios";
import { useUser } from "@/hooks/use-user";
import { MODULOS, etiquetaRol } from "@/lib/auth/acceso";

// Configuración → Usuarios. Sólo admin (lo bloquea el proxy y lo vuelve a chequear la API).

const MAX_CHIPS = 5;

export default function UsuariosPage() {
  const { data: usuarios, isLoading, error } = useUsuarios();
  const { data: yo } = useUser();
  // undefined = cerrado; null = alta.
  const [editando, setEditando] = useState<UsuarioAdmin | null | undefined>(undefined);
  const [clave, setClave] = useState<{ email: string; clave: string } | null>(null);

  // Primero lo que pide atención (cuentas sin perfil), después los activos, y al final
  // los desactivados.
  const ordenados = useMemo(
    () =>
      [...(usuarios ?? [])].sort(
        (a, b) =>
          rango(a) - rango(b) ||
          `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, "es"),
      ),
    [usuarios],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Usuarios" description="Quién entra a la app y qué puede hacer en cada módulo">
        <Button onClick={() => setEditando(null)} style={{ backgroundColor: "#D85A30", color: "#fff" }}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo usuario
        </Button>
      </PageHeader>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error.message}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead>Último ingreso</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((u) => (
                <TableRow
                  key={u.id}
                  className={cnFila(u)}
                  onClick={() => setEditando(u)}
                >
                  <TableCell>
                    <div className="font-medium">
                      {`${u.nombre} ${u.apellido}`.trim() || "—"}
                      {u.id === yo?.id && <span className="ml-1.5 text-xs text-muted-foreground">(vos)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>{u.sinPerfil ? "—" : etiquetaRol(u.rol)}</TableCell>
                  <TableCell>
                    <ChipsModulos usuario={u} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.ultimoIngreso
                      ? `hace ${formatDistanceToNowStrict(parseISO(u.ultimoIngreso), { locale: es })}`
                      : "Nunca entró"}
                  </TableCell>
                  <TableCell>
                    <Estado usuario={u} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editando !== undefined && (
        <EditorUsuario
          key={editando?.id ?? "nuevo"}
          open
          onOpenChange={(o) => !o && setEditando(undefined)}
          usuario={editando}
          yoId={yo?.id ?? null}
          onClaveTemporal={setClave}
        />
      )}

      <ClaveTemporalDialog key={clave?.clave} datos={clave} onClose={() => setClave(null)} />
    </div>
  );
}

function rango(u: UsuarioAdmin): number {
  if (u.sinPerfil) return 0;
  return u.activo ? 1 : 2;
}

function cnFila(u: UsuarioAdmin): string {
  return u.activo || u.sinPerfil ? "cursor-pointer" : "cursor-pointer opacity-60";
}

function ChipsModulos({ usuario }: { usuario: UsuarioAdmin }) {
  if (usuario.sinPerfil) return <span className="text-sm text-muted-foreground">—</span>;
  if (usuario.rol === "admin") return <span className="text-sm">Todos</span>;

  const modulos = MODULOS.filter((m) => usuario.permisos[m.id]);
  if (modulos.length === 0) return <span className="text-sm text-muted-foreground">Sólo alertas</span>;

  return (
    <div className="flex max-w-md flex-wrap gap-1">
      {modulos.slice(0, MAX_CHIPS).map((m) => {
        const soloVer = usuario.permisos[m.id] === "ver";
        return (
          <Badge key={m.id} variant={soloVer ? "outline" : "secondary"} title={soloVer ? "Sólo ver" : "Editar"}>
            {m.titulo}
            {soloVer && <span className="ml-1 text-muted-foreground">· ver</span>}
          </Badge>
        );
      })}
      {modulos.length > MAX_CHIPS && <Badge variant="outline">+{modulos.length - MAX_CHIPS}</Badge>}
    </div>
  );
}

function Estado({ usuario }: { usuario: UsuarioAdmin }) {
  if (usuario.sinPerfil) {
    return (
      <Badge variant="destructive" title="La cuenta existe pero no tiene perfil: no puede entrar">
        Sin perfil
      </Badge>
    );
  }
  if (!usuario.activo) return <Badge variant="outline">Desactivado</Badge>;
  if (usuario.debeCambiarClave) {
    return (
      <Badge variant="secondary" title="Todavía no eligió su contraseña">
        Clave temporal
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground">Activo</span>;
}
