"use client";

import { useState, useRef, useEffect } from "react";
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

    // Use importLibrary approach (new API)
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
    script.async = true;
    script.onload = () => {
      googleMapsLoaded = true;
      loadCallbacks.forEach((cb) => cb());
    };
    document.head.appendChild(script);
  });
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

  useEffect(() => {
    if (!apiKey) { setManualMode(true); return; }
    loadGoogleMaps(apiKey).then(() => setReady(true)).catch(() => setManualMode(true));
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.google) return;

    async function init() {
      try {
        const { Geocoder } = await window.google.maps.importLibrary("geocoding");
        const geocoder = new Geocoder();

        // Try the new PlaceAutocompleteElement
        try {
          const { PlaceAutocompleteElement } = await window.google.maps.importLibrary("places");
          const placeEl = new PlaceAutocompleteElement({
            componentRestrictions: { country: "ar" },
          });

          placeEl.style.width = "100%";
          placeEl.style.height = "36px";

          // Clear container and append
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
            containerRef.current.appendChild(placeEl);
          }

          placeEl.addEventListener("gmp-placeselect", async (e: any) => {
            const place = e.place;
            await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
            const address = place.formattedAddress || place.displayName || "";
            const lat = place.location?.lat();
            const lng = place.location?.lng();
            onChange(address, lat, lng);
            if (lat && lng) setCoords({ lat, lng });
          });
        } catch {
          // Fallback: use Autocomplete (legacy) if PlaceAutocompleteElement not available
          try {
            const { Autocomplete } = await window.google.maps.importLibrary("places");
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = "Escribí la dirección...";
            input.defaultValue = value;
            input.className = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm";

            if (containerRef.current) {
              containerRef.current.innerHTML = "";
              containerRef.current.appendChild(input);
            }

            const autocomplete = new Autocomplete(input, {
              componentRestrictions: { country: "ar" },
              fields: ["formatted_address", "geometry"],
            });

            autocomplete.addListener("place_changed", () => {
              const place = autocomplete.getPlace();
              if (place.formatted_address) {
                const lat = place.geometry?.location?.lat();
                const lng = place.geometry?.location?.lng();
                onChange(place.formatted_address, lat, lng);
                if (lat && lng) setCoords({ lat, lng });
              }
            });
          } catch {
            setManualMode(true);
          }
        }
      } catch {
        setManualMode(true);
      }
    }

    init();
  }, [ready, onChange, value]);

  const streetViewUrl = coords
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${coords.lat},${coords.lng}&heading=0&pitch=0&fov=90&key=${apiKey}`
    : null;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        Ubicación / Dirección de obra
      </Label>

      {manualMode ? (
        <Input
          defaultValue={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej: Av. Corrientes 1234, CABA"
        />
      ) : (
        <div ref={containerRef} className="min-h-[36px]">
          <Input
            defaultValue={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Cargando Google Maps..."
            disabled
          />
        </div>
      )}

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
