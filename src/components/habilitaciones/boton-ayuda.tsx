"use client";

import Link from "next/link";
import { BookOpen, CircleQuestionMark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * La puerta de entrada a la ayuda, siempre visible.
 *
 * El recorrido guiado se ve una vez y se cierra; el problema es que los conceptos de este
 * módulo hacen falta el día 30, no el día 1. Por eso el botón queda fijo en las dos
 * pantallas y ofrece las dos cosas: repetir el recorrido, o ir a la guía escrita, que es
 * la que se puede consultar salteada cuando aparece una duda puntual.
 */
export function BotonAyuda({ onRecorrido }: { onRecorrido: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <CircleQuestionMark className="mr-1.5 h-3.5 w-3.5" />
        ¿Cómo funciona?
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onRecorrido} className="gap-2">
          <CircleQuestionMark className="h-4 w-4" />
          Ver el recorrido guiado
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/habilitaciones/ayuda" />} className="gap-2">
          <BookOpen className="h-4 w-4" />
          Leer la guía completa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
