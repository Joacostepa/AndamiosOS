"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePersonal } from "@/hooks/use-personal";
import { useRegistrarFichada } from "@/hooks/use-fichadas";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle, XCircle, Loader2, Camera, ScanLine } from "lucide-react";
import { toast } from "sonner";

export default function EscanearPage() {
  const { data: personal } = usePersonal();
  const registrarFichada = useRegistrarFichada();

  const [personalId, setPersonalId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  const [scanning, setScanning] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [qrInput, setQrInput] = useState("");
  const scannerRef = useRef<any>(null);
  const scannerContainerId = "qr-reader";

  // Get geolocation
  useEffect(() => {
    setGeoStatus("loading");
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
          setGeoStatus("success");
        },
        () => setGeoStatus("error"),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setGeoStatus("error");
    }
  }, []);

  function getDeviceId(): string {
    let id = localStorage.getItem("andamios_device_id");
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("andamios_device_id", id);
    }
    return id;
  }

  const procesarFichada = useCallback(async (token: string) => {
    if (!personalId) {
      toast.error("Selecciona tu nombre primero");
      return;
    }

    try {
      const result = await registrarFichada.mutateAsync({
        personal_id: personalId,
        tipo,
        qr_token: token,
        latitud: coords?.lat,
        longitud: coords?.lng,
        precision_gps: coords?.accuracy,
        device_id: getDeviceId(),
        nombre_dispositivo: navigator.userAgent.slice(0, 50),
      });
      setResultado({ ok: true, mensaje: result.mensaje });
      toast.success(result.mensaje);
    } catch (error: any) {
      setResultado({ ok: false, mensaje: error.message });
      toast.error(error.message);
    }
  }, [personalId, tipo, coords, registrarFichada]);

  async function handleScanResult(qrData: string) {
    // Stop scanner
    stopScanner();

    try {
      const parsed = JSON.parse(qrData);
      if (parsed.type === "fichada" && parsed.token) {
        await procesarFichada(parsed.token);
        return;
      }
    } catch {}

    // If not JSON, try as raw token
    if (qrData.length > 20) {
      await procesarFichada(qrData);
    } else {
      toast.error("QR no reconocido");
    }
  }

  async function startScanner() {
    setScanning(true);
    setResultado(null);

    // Dynamic import to avoid SSR issues
    const { Html5Qrcode } = await import("html5-qrcode");

    try {
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleScanResult(decodedText);
        },
        () => {} // ignore errors during scanning
      );
    } catch (err) {
      console.error("Scanner error:", err);
      toast.error("No se pudo acceder a la camara. Usa el input manual.");
      setScanning(false);
    }
  }

  function stopScanner() {
    setScanning(false);
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear().catch(() => {});
      scannerRef.current = null;
    }
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <PageHeader title="Fichar Asistencia" />

      {/* Resultado */}
      {resultado && (
        <Card className={resultado.ok ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}>
          <CardContent className="py-4 flex items-center gap-3">
            {resultado.ok ? <CheckCircle className="h-6 w-6 text-green-400 shrink-0" /> : <XCircle className="h-6 w-6 text-red-400 shrink-0" />}
            <div>
              <p className="font-medium text-sm">{resultado.ok ? "Fichada registrada" : "Error"}</p>
              <p className="text-sm text-muted-foreground">{resultado.mensaje}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* GPS */}
      <Card>
        <CardContent className="py-3 flex items-center gap-3">
          <MapPin className={`h-5 w-5 shrink-0 ${geoStatus === "success" ? "text-green-400" : geoStatus === "error" ? "text-red-400" : "text-yellow-400 animate-pulse"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {geoStatus === "loading" ? "Obteniendo ubicacion..." : geoStatus === "success" ? `GPS OK (${Math.round(coords?.accuracy || 0)}m)` : "GPS no disponible"}
            </p>
          </div>
          <Badge variant="outline" className={geoStatus === "success" ? "bg-green-500/15 text-green-400 border-green-500/25" : ""}>
            {geoStatus === "success" ? "OK" : "..."}
          </Badge>
        </CardContent>
      </Card>

      {/* Datos */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-2">
            <Label>Tu nombre *</Label>
            <Select value={personalId} onValueChange={(v) => v && setPersonalId(v)}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {personal?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre} ({p.dni})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant={tipo === "entrada" ? "default" : "outline"} onClick={() => setTipo("entrada")} className="h-14 text-lg">
              Entrada
            </Button>
            <Button variant={tipo === "salida" ? "default" : "outline"} onClick={() => setTipo("salida")} className="h-14 text-lg">
              Salida
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scanner */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {scanning ? (
            <div className="space-y-3">
              <div id={scannerContainerId} className="w-full rounded-lg overflow-hidden" />
              <Button variant="outline" className="w-full" onClick={stopScanner}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button onClick={startScanner} className="w-full h-16 text-lg" disabled={!personalId}>
              <Camera className="mr-2 h-6 w-6" />
              Escanear QR
            </Button>
          )}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">O ingresa el codigo manualmente:</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Pegar token QR..."
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
              />
              <Button
                onClick={() => { if (qrInput) handleScanResult(qrInput); }}
                disabled={!qrInput || !personalId || registrarFichada.isPending}
              >
                {registrarFichada.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
