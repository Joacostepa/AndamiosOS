"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Cambiar la contraseña propia.
//
// Es a donde el proxy manda a quien entra con una contraseña temporal —el alta desde
// Configuración → Usuarios, o un reseteo—, y no lo deja salir de acá hasta que elija la
// suya. También se llega desde el menú del usuario, cuando alguien la quiere cambiar.

export default function CambiarClavePage() {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (clave.length < 8) {
      setError("La contraseña tiene que tener al menos 8 caracteres.");
      return;
    }
    if (clave !== repetida) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/cuenta/clave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `Error ${res.status}`);
      setLoading(false);
      return;
    }

    // Carga completa y no router.push: al iniciar sesión el router del cliente guardó que
    // "/" redirigía acá, y con push reusaba esa respuesta — se quedaba en esta misma
    // pantalla con el botón girando. Una carga nueva pasa por el proxy, que ya ve la
    // contraseña cambiada y lo manda a su pantalla de arranque.
    window.location.assign("/");
  }

  async function salir() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Elegí tu contraseña</CardTitle>
        <CardDescription>
          Si entraste con una contraseña temporal, elegí una propia para seguir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="clave">Contraseña nueva</Label>
            <Input
              id="clave"
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Al menos 8 caracteres.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="repetida">Repetila</Label>
            <Input
              id="repetida"
              type="password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar contraseña
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => window.location.assign("/")}>
              Volver
            </button>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={salir}>
              Cerrar sesión
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
