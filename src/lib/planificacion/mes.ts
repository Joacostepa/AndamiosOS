import { startOfMonth, endOfMonth, startOfWeek, addDays, addWeeks } from "date-fns";

// Semanas naturales (Lun–Vie) que intersectan el mes de `ref`.
export function semanasDelMes(ref: Date): Date[][] {
  const last = endOfMonth(ref);
  let wkStart = startOfWeek(startOfMonth(ref), { weekStartsOn: 1 });
  const semanas: Date[][] = [];
  while (wkStart <= last) {
    semanas.push(Array.from({ length: 5 }, (_, i) => addDays(wkStart, i)));
    wkStart = addWeeks(wkStart, 1);
  }
  return semanas;
}
