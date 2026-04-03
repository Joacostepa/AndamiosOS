"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Search } from "lucide-react";

declare global {
  interface Window { google: any; }
}

interface LocationPickerProps {
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [suggestions, setSuggestions] = useState<{ description: string; placeId: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey || typeof window === "undefined") return;
    if (window.google?.maps) { setMapsReady(true); return; }

    const existing = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existing) { existing.addEventListener("load", () => setMapsReady(true)); return; }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geocoding`;
    script.async = true;
    script.onload = () => setMapsReady(true);
    document.head.appendChild(script);
  }, [apiKey]);

  const handleSearch = useCallback(
    (text: string) => {
      onChange(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!mapsReady || text.length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        try {
          // Try new AutocompleteSuggestion API first
          const { AutocompleteSuggestion } = await window.google.maps.importLibrary("places");
          const request = {
            input: text,
            includedRegionCodes: ["ar"],
          };
          const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
          const mapped = results.map((s: any) => ({
            description: s.placePrediction?.text?.text || s.placePrediction?.mainText?.text || "",
            placeId: s.placePrediction?.placeId || "",
          })).filter((s: any) => s.description);
          setSuggestions(mapped);
          setShowSuggestions(mapped.length > 0);
        } catch {
          // Fallback to legacy AutocompleteService
          try {
            const service = new window.google.maps.places.AutocompleteService();
            service.getPlacePredictions(
              { input: text, componentRestrictions: { country: "ar" } },
              (predictions: any[], status: string) => {
                if (status === "OK" && predictions) {
                  setSuggestions(predictions.map((p: any) => ({
                    description: p.description,
                    placeId: p.place_id,
                  })));
                  setShowSuggestions(true);
                }
              }
            );
          } catch {
            setSuggestions([]);
          }
        }
      }, 300);
    },
    [mapsReady, onChange]
  );

  const handleSelect = useCallback(
    async (suggestion: { description: string; placeId: string }) => {
      onChange(suggestion.description);
      setShowSuggestions(false);
      setSuggestions([]);

      if (!mapsReady) return;

      try {
        // Try new Place API
        const { Place } = await window.google.maps.importLibrary("places");
        const place = new Place({ id: suggestion.placeId });
        await place.fetchFields({ fields: ["location"] });
        const lat = place.location?.lat();
        const lng = place.location?.lng();
        if (lat && lng) {
          onChange(suggestion.description, lat, lng);
          setCoords({ lat, lng });
        }
      } catch {
        // Fallback to Geocoder
        try {
          const { Geocoder } = await window.google.maps.importLibrary("geocoding");
          const geocoder = new Geocoder();
          geocoder.geocode({ address: suggestion.description }, (results: any[], status: string) => {
            if (status === "OK" && results[0]) {
              const lat = results[0].geometry.location.lat();
              const lng = results[0].geometry.location.lng();
              onChange(suggestion.description, lat, lng);
              setCoords({ lat, lng });
            }
          });
        } catch { /* no coords */ }
      }
    },
    [mapsReady, onChange]
  );

  const streetViewUrl = coords
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${coords.lat},${coords.lng}&heading=0&pitch=0&fov=90&key=${apiKey}`
    : null;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        Ubicación / Dirección de obra
      </Label>
      <div className="relative">
        <Input
          defaultValue={value}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Escribí la dirección..."
          data-field="ubicacion"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={s.placeId || i}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s)}
              >
                <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {streetViewUrl && (
        <div className="rounded-lg overflow-hidden border">
          <img
            src={streetViewUrl}
            alt="Vista de la fachada"
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
