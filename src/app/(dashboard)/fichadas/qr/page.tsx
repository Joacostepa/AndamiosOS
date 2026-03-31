"use client";

import { useState, useEffect, useCallback } from "react";
import { useObras } from "@/hooks/use-obras";
import { useGenerarQR } from "@/hooks/use-fichadas";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { QrCode, RefreshCw } from "lucide-react";
import QRCode from "qrcode";

export default function GenerarQRPage() {
  const { data: obras } = useObras();
  const generarQR = useGenerarQR();

  const [obraId, setObraId] = useState("");
  const [ubicacion, setUbicacion] = useState("obra");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [token, setToken] = useState("");
  const [expira, setExpira] = useState("");
  const [countdown, setCountdown] = useState(0);

  const generateNewQR = useCallback(async () => {
    try {
      const result = await generarQR.mutateAsync({
        obra_id: obraId || undefined,
        ubicacion,
      });
      setToken(result.token);
      setExpira(result.expira_at);

      // Generate QR image
      const qrData = JSON.stringify({
        token: result.token,
        type: "fichada",
        app: "andamios-os",
      });
      const url = await QRCode.toDataURL(qrData, {
        width: 400,
        margin: 2,
        color: { dark: "#f59e0b", light: "#1a1a1a" },
      });
      setQrDataUrl(url);
      setCountdown(60);
    } catch (e) {
      console.error("Error generando QR:", e);
    }
  }, [obraId, ubicacion, generarQR]);

  // Auto-refresh QR every 60 seconds
  useEffect(() => {
    if (countdown <= 0 && (obraId || ubicacion === "deposito")) {
      generateNewQR();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          generateNewQR();
          return 60;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, obraId, ubicacion, generateNewQR]);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <PageHeader title="QR de Fichada" description="Mostra este QR al personal para que fiche" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuracion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Ubicacion</Label>
            <Select value={ubicacion} onValueChange={(v) => { if (v) { setUbicacion(v); setCountdown(0); } }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="obra">Obra</SelectItem>
                <SelectItem value="deposito">Deposito</SelectItem>
                <SelectItem value="oficina">Oficina</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {ubicacion === "obra" && (
            <div className="space-y-2">
              <Label>Obra</Label>
              <Select value={obraId} onValueChange={(v) => { if (v) { setObraId(v); setCountdown(0); } }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>
                  {obras?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Display */}
      <Card className="text-center">
        <CardContent className="py-8">
          {qrDataUrl ? (
            <div className="space-y-4">
              <img src={qrDataUrl} alt="QR Fichada" className="mx-auto rounded-lg" />
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Se renueva en {countdown} segundos
              </div>
              <p className="text-xs text-muted-foreground">
                El personal debe escanear este QR desde la app para registrar su fichada
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-8">
              <QrCode className="h-16 w-16 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">
                {ubicacion === "obra" ? "Selecciona una obra para generar el QR" : "Generando QR..."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
