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
  const inputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sessionToken, setSessionToken] = useState<any>(null);
  const [autocompleteService, setAutocompleteService] = useState<any>(null);
  const [geocoder, setGeocoder] = useState<any>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

  // Load Google Maps
  useEffect(() => {
    if (!apiKey || typeof window === "undefined") return;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      if (window.google) {
        setAutocompleteService(new window.google.maps.places.AutocompleteService());
        setGeocoder(new window.google.maps.Geocoder());
        setSessionToken(new window.google.maps.places.AutocompleteSessionToken());
      }
    };

    // Check if already loaded
    if (window.google?.maps?.places) {
      setAutocompleteService(new window.google.maps.places.AutocompleteService());
      setGeocoder(new window.google.maps.Geocoder());
      setSessionToken(new window.google.maps.places.AutocompleteSessionToken());
    } else {
      document.head.appendChild(script);
    }
  }, [apiKey]);

  const handleInputChange = useCallback(
    (text: string) => {
      onChange(text);
      if (!autocompleteService || text.length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      autocompleteService.getPlacePredictions(
        {
          input: text,
          componentRestrictions: { country: "ar" },
          sessionToken,
        },
        (predictions: any[], status: string) => {
          if (status === "OK" && predictions) {
            setSuggestions(predictions);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
          }
        }
      );
    },
    [autocompleteService, sessionToken, onChange]
  );

  const handleSelect = useCallback(
    (prediction: any) => {
      const address = prediction.description;
      onChange(address);
      setShowSuggestions(false);
      setSuggestions([]);

      // Geocode to get coordinates
      if (geocoder) {
        geocoder.geocode({ address }, (results: any[], status: string) => {
          if (status === "OK" && results[0]) {
            const loc = results[0].geometry.location;
            const lat = loc.lat();
            const lng = loc.lng();
            onChange(address, lat, lng);
            setCoords({ lat, lng });
          }
        });
      }

      // New session token for next search
      if (window.google) {
        setSessionToken(new window.google.maps.places.AutocompleteSessionToken());
      }
    },
    [geocoder, onChange]
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
          ref={inputRef}
          defaultValue={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Escribí la dirección..."
          data-field="ubicacion"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s.place_id}
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
