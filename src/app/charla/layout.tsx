import { Poppins } from "next/font/google";

// La página pública de una charla compartida (/charla/<token>): con la letra de los
// presupuestos de ABA (Poppins), sin el menú de la app.
const poppins = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-poppins" });

export default function CharlaLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${poppins.className} min-h-dvh bg-[#FAF7F6] text-[#1a1a1a]`}>{children}</div>;
}
