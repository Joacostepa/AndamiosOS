"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";

interface LocationPickerProps {
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
}

declare global {
  interface Window {
    google: any;
    initGoogleMaps: () => void;
  }
}

let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (googleMapsLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    loadCallbacks.push(resolve);
    if (googleMapsLoading) return;
    googleMapsLoading = true;
    window.initGoogleMaps = () => {
      googleMapsLoaded = true;
      loadCallbacks.forEach((cb) => cb());
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
    script.async = true;
    document.head.appendChild(script);
  });
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [ready, setReady] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(() => setReady(true));
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !inputRef.current || !window.google) return;

    const autocomplete = new window.google.maps.places.Autocomplete(
      inputRef.current,
      {
        componentRestrictions: { country: "ar" },
        fields: ["formatted_address", "geometry"],
      }
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) {
        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();
        onChange(place.formatted_address, lat, lng);
        if (lat && lng) setCoords({ lat, lng });
      }
    });
  }, [ready, onChange]);

  // Build Street View URL
  const streetViewUrl = coords
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${coords.lat},${coords.lng}&heading=0&pitch=0&fov=90&key=${apiKey}`
    : null;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        Ubicación / Dirección de obra
      </Label>
      <Input
        ref={inputRef}
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escribí la dirección y seleccioná de la lista..."
        data-field="ubicacion"
      />
      {streetViewUrl && (
        <div className="rounded-lg overflow-hidden border">
          <img
            src={streetViewUrl}
            alt="Street View"
            className="w-full h-[200px] object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}
