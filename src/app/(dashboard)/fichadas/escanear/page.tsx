"use client";

import { useState, useEffect, useRef } from "react";
import { usePersonal } from "@/hooks/use-personal";
import { useRegistrarFichada } from "@/hooks/use-fichadas";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScanLine, MapPin, CheckCircle, XCircle, Loader2, Camera } from "lucide-react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // Get device ID
  function getDeviceId(): string {
    let id = localStorage.getItem("andamios_device_id");
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("andamios_device_id", id);
    }
    return id;
  }

  async function handleScanResult(qrData: string) {
    setScanning(false);
    stopCamera();

    try {
      const parsed = JSON.parse(qrData);
      if (parsed.type !== "fichada" || !parsed.token) {
        toast.error("QR invalido. No es un QR de fichada.");
        return;
      }
      await procesarFichada(parsed.token);
    } catch {
      // Maybe it's just the token directly
      if (qrData.length > 20) {
        await procesarFichada(qrData);
      } else {
        toast.error("QR no reconocido");
      }
    }
  }

  async function procesarFichada(token: string) {
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
  }

  // Camera scanner
  async function startCamera() {
    setScanning(true);
    setResultado(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanQRFromVideo();
      }
    } catch {
      toast.error("No se pudo acceder a la camara");
      setScanning(false);
    }
  }

  function stopCamera() {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }

  function scanQRFromVideo() {
    // Simple QR scanning using canvas - in production use html5-qrcode
    // For now, use manual input as fallback
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <PageHeader title="Fichar Asistencia" />

      {/* Resultado */}
      {resultado && (
        <Card className={resultado.ok ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}>
          <CardContent className="py-4 flex items-center gap-3">
            {resultado.ok ? <CheckCircle className="h-6 w-6 text-green-400" /> : <XCircle className="h-6 w-6 text-red-400" />}
            <div>
              <p className="font-medium text-sm">{resultado.ok ? "Fichada registrada" : "Error"}</p>
              <p className="text-sm text-muted-foreground">{resultado.mensaje}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* GPS Status */}
      <Card>
        <CardContent className="py-3 flex items-center gap-3">
          <MapPin className={`h-5 w-5 ${geoStatus === "success" ? "text-green-400" : geoStatus === "error" ? "text-red-400" : "text-yellow-400"}`} />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {geoStatus === "loading" ? "Obteniendo ubicacion..." :
               geoStatus === "success" ? `GPS OK (precision: ${Math.round(coords?.accuracy || 0)}m)` :
               "GPS no disponible"}
            </p>
            {coords && <p className="text-xs text-muted-foreground">{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</p>}
          </div>
          <Badge variant="outline" className={geoStatus === "success" ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"}>
            {geoStatus === "success" ? "OK" : "..."}
          </Badge>
        </CardContent>
      </Card>

      {/* Seleccion */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos de fichada</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tu nombre *</Label>
            <Select value={personalId} onValueChange={(v) => v && setPersonalId(v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {personal?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre} ({p.dni})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={tipo === "entrada" ? "default" : "outline"} onClick={() => setTipo("entrada")} className="h-14 text-lg">
                Entrada
              </Button>
              <Button variant={tipo === "salida" ? "default" : "outline"} onClick={() => setTipo("salida")} className="h-14 text-lg">
                Salida
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scanner */}
      <Card>
        <CardHeader><CardTitle className="text-base">Escanear QR del supervisor</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {scanning ? (
            <div className="space-y-4">
              <video ref={videoRef} className="w-full rounded-lg bg-black aspect-square object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <Button variant="outline" className="w-full" onClick={() => { setScanning(false); stopCamera(); }}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button onClick={startCamera} className="w-full h-16 text-lg" disabled={!personalId}>
              <Camera className="mr-2 h-6 w-6" />
              Abrir camara y escanear QR
            </Button>
          )}

          {/* Manual input fallback */}
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">O ingresa el codigo manualmente:</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Codigo QR..."
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
