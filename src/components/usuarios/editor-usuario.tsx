"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, UserCheck, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import { MODULOS, PERFILES, type ModuloId, type Nivel, type Permisos, type Rol } from "@/lib/auth/acceso";
import {
  useCrearUsuario,
  useEditarUsuario,
  useResetearClave,
  type UsuarioAdmin,
} from "@/hooks/use-usuarios";

const GRUPOS = [...new Set(MODULOS.map((m) => m.grupo))];

function plantillaDe(rol: Rol): Permisos {
  return PERFILES.find((p) => p.rol === rol)?.permisos ?? {};
}

function mismosPermisos(a: Permisos, b: Permisos): boolean {
  return MODULOS.every((m) => (a[m.id] ?? null) === (b[m.id] ?? null));
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = alta. El padre remonta el componente (key) al cambiar de usuario. */
  usuario: UsuarioAdmin | null;
  yoId: string | null;
  onClaveTemporal: (datos: { email: string; clave: string }) => void;
};

export function EditorUsuario({ open, onOpenChange, usuario, yoId, onClaveTemporal }: Props) {
  const esYo = !!usuario && usuario.id === yoId;
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [apellido, setApellido] = useState(usuario?.apellido ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "");
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? "operativo");
  const [permisos, setPermisos] = useState<Permisos>(usuario ? usuario.permisos : plantillaDe("operativo"));
  const [confirmar, setConfirmar] = useState<"desactivar" | "clave" | null>(null);

  const crear = useCrearUsuario();
  const editar = useEditarUsuario();
  const resetear = useResetearClave();
  const guardando = crear.isPending || editar.isPending;

  const perfil = PERFILES.find((p) => p.rol === rol)!;
  const difiereDelPerfil = rol !== "admin" && !mismosPermisos(permisos, perfil.permisos);

  function elegirPerfil(r: Rol) {
    setRol(r);
    // En el alta el perfil carga sus módulos. Al editar NO: pisaría a mano lo que ya se
    // ajustó; para eso está "Volver a los módulos de…".
    if (!usuario) setPermisos(plantillaDe(r));
  }

  function setNivel(id: ModuloId, nivel: Nivel | null) {
    setPermisos((prev) => {
      const siguiente = { ...prev };
      if (nivel) siguiente[id] = nivel;
      else delete siguiente[id];
      return siguiente;
    });
  }

  function guardar() {
    const datos = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      telefono: telefono.trim() || null,
      rol,
      permisos: rol === "admin" ? {} : permisos,
    };
    if (!datos.nombre) {
      toast.error("Falta el nombre");
      return;
    }
    if (!usuario) {
      const mail = email.trim().toLowerCase();
      crear.mutate(
        { ...datos, email: mail },
        {
          onSuccess: (r) => {
            onOpenChange(false);
            onClaveTemporal({ email: mail, clave: r.clave });
          },
          onError: (e) => toast.error(e.message),
        },
      );
      return;
    }
    editar.mutate(
      { id: usuario.id, cambios: datos },
      {
        onSuccess: () => {
          toast.success("Cambios guardados");
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function cambiarActivo() {
    if (!usuario) return;
    editar.mutate(
      { id: usuario.id, cambios: { activo: !usuario.activo } },
      {
        onSuccess: () => {
          toast.success(usuario.activo ? "Usuario desactivado" : "Usuario reactivado");
          setConfirmar(null);
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function resetearClave() {
    if (!usuario) return;
    resetear.mutate(usuario.id, {
      onSuccess: (r) => {
        setConfirmar(null);
        onOpenChange(false);
        onClaveTemporal({ email: usuario.email, clave: r.clave });
      },
      onError: (e) => toast.error(e.message),
    });
  }

  const titulo = usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() || usuario.email : "Nuevo usuario";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>
              {usuario
                ? usuario.email
                : "Se crea con una contraseña temporal que la persona cambia la primera vez que entra."}
            </DialogDescription>
          </DialogHeader>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-nombre">Nombre</Label>
              <Input id="u-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-apellido">Apellido</Label>
              <Input id="u-apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!usuario}
                placeholder="nombre@andamiosbuenosaires.com.ar"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-telefono">Teléfono</Label>
              <Input id="u-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Perfil</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {PERFILES.map((p) => (
                <button
                  key={p.rol}
                  type="button"
                  aria-pressed={rol === p.rol}
                  disabled={esYo && p.rol !== "admin"}
                  onClick={() => elegirPerfil(p.rol)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    rol === p.rol ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <div className="text-sm font-medium">{p.titulo}</div>
                  <div className="text-xs text-muted-foreground">{p.descripcion}</div>
                </button>
              ))}
            </div>
            {esYo && (
              <p className="text-xs text-muted-foreground">
                No podés sacarte a vos mismo el perfil de administrador.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Módulos</h3>
              {difiereDelPerfil && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setPermisos(perfil.permisos)}
                >
                  Volver a los módulos de {perfil.titulo}
                </button>
              )}
            </div>
            {rol === "admin" ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Un administrador ve y edita todos los módulos, y administra los usuarios.
              </p>
            ) : (
              <div className="space-y-4">
                {GRUPOS.map((grupo) => (
                  <div key={grupo}>
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {grupo}
                    </div>
                    <div className="divide-y rounded-lg border">
                      {MODULOS.filter((m) => m.grupo === grupo).map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm">{m.titulo}</span>
                          <SelectorNivel
                            valor={permisos[m.id] ?? null}
                            soloLectura={!!m.soloLectura}
                            onChange={(n) => setNivel(m.id, n)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Alertas la ven todos: cada uno recibe sólo los avisos que le corresponden.
                </p>
              </div>
            )}
          </section>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {usuario && !usuario.sinPerfil && (
                <>
                  <Button variant="outline" onClick={() => setConfirmar("clave")} disabled={guardando}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Resetear contraseña
                  </Button>
                  {!esYo && (
                    <Button
                      variant="outline"
                      onClick={() => (usuario.activo ? setConfirmar("desactivar") : cambiarActivo())}
                      disabled={guardando}
                    >
                      {usuario.activo ? <UserX className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}
                      {usuario.activo ? "Desactivar" : "Reactivar"}
                    </Button>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={guardando}>
                {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {usuario ? (usuario.sinPerfil ? "Dar acceso" : "Guardar") : "Crear usuario"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmar === "desactivar"}
        onOpenChange={(o) => !o && setConfirmar(null)}
        title="Desactivar usuario"
        description={`${titulo} deja de poder entrar a la app en el momento, aunque tenga la sesión abierta. Se puede reactivar cuando quieras.`}
        confirmLabel="Desactivar"
        variant="destructive"
        loading={editar.isPending}
        onConfirm={cambiarActivo}
      />
      <ConfirmDialog
        open={confirmar === "clave"}
        onOpenChange={(o) => !o && setConfirmar(null)}
        title="Resetear contraseña"
        description={`Se genera una contraseña temporal nueva para ${titulo}. La actual deja de servir.`}
        confirmLabel="Generar contraseña"
        loading={resetear.isPending}
        onConfirm={resetearClave}
      />
    </>
  );
}

const OPCIONES: { valor: Nivel | null; etiqueta: string }[] = [
  { valor: null, etiqueta: "Sin acceso" },
  { valor: "ver", etiqueta: "Ver" },
  { valor: "editar", etiqueta: "Editar" },
];

function SelectorNivel({
  valor,
  soloLectura,
  onChange,
}: {
  valor: Nivel | null;
  soloLectura: boolean;
  onChange: (nivel: Nivel | null) => void;
}) {
  const opciones = soloLectura ? OPCIONES.filter((o) => o.valor !== "editar") : OPCIONES;
  return (
    <div className="inline-flex shrink-0 rounded-md border p-0.5 text-xs" role="group">
      {opciones.map((o) => {
        const activa = valor === o.valor;
        return (
          <button
            key={o.etiqueta}
            type="button"
            aria-pressed={activa}
            onClick={() => onChange(o.valor)}
            className={cn(
              "rounded px-2.5 py-1 transition-colors",
              !activa && "text-muted-foreground hover:text-foreground",
              activa && o.valor === "editar" && "bg-primary text-primary-foreground",
              activa && o.valor === "ver" && "bg-secondary text-secondary-foreground",
              activa && o.valor === null && "bg-muted text-foreground",
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
