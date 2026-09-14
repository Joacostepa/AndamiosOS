"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";

// Los mensajes de Supabase llegan en inglés y no dicen qué hacer. Los que alguien ve de
// verdad, en castellano y con el paso siguiente.
function traducir(error: { message: string; code?: string }): string {
  if (error.code === "invalid_credentials") return "Email o contraseña incorrectos.";
  if (error.code === "user_banned") return "Tu usuario está desactivado. Hablá con un administrador.";
  if (error.code === "email_not_confirmed") return "Tu cuenta no está confirmada. Hablá con un administrador.";
  return `Error: ${error.message}`;
}

// El proxy manda acá con ?motivo= cuando saca a alguien de la app.
const AVISOS: Record<string, string> = {
  desactivado: "Tu usuario está desactivado o no tiene acceso. Hablá con un administrador.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}

function FormularioLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const aviso = AVISOS[useSearchParams().get("motivo") ?? ""];
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Login error:", error.message, error.status, error);
      setError(traducir(error));
      setLoading(false);
      return;
    }

    // A "/" y que decida el proxy: su pantalla de arranque, o cambiar la contraseña
    // temporal si todavía la tiene.
    router.push("/");
    router.refresh();
  }

  const mensaje = error ?? aviso;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          Andamios<span className="text-primary">OS</span>
        </CardTitle>
        <CardDescription>
          Ingresá con tu cuenta para continuar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mensaje && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {mensaje}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Iniciar sesión
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
