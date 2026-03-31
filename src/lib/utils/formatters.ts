import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "dd/MM/yyyy", { locale: es });
}

export function formatDateTime(
  date: string | Date | null | undefined
): string {
  if (!date) return "—";
  return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: es });
}

export function formatRelativeDate(
  date: string | Date | null | undefined
): string {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
}

export function formatCuit(cuit: string | null | undefined): string {
  if (!cuit) return "—";
  const clean = cuit.replace(/\D/g, "");
  if (clean.length !== 11) return cuit;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
}
