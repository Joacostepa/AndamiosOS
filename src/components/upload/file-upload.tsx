"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Loader2, FileText, Image } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  bucket: string;
  path: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  onUpload: (urls: string[]) => void;
  existingFiles?: string[];
  onRemove?: (url: string) => void;
  variant?: "default" | "camera";
}

export function FileUpload({
  bucket,
  path,
  accept = "image/*,.pdf,.dwg,.doc,.docx",
  multiple = true,
  maxSize = 10 * 1024 * 1024,
  onUpload,
  existingFiles = [],
  onRemove,
  variant = "default",
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const oversized = Array.from(files).find((f) => f.size > maxSize);
    if (oversized) {
      toast.error(`El archivo "${oversized.name}" supera el limite de ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }

    setUploading(true);
    const urls: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const fileName = `${path}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage.from(bucket).upload(fileName, file);

      if (error) {
        toast.error(`Error subiendo ${file.name}`);
        continue;
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      urls.push(urlData.publicUrl);
    }

    if (urls.length > 0) {
      onUpload(urls);
      toast.success(`${urls.length} archivo(s) subidos`);
    }
    setUploading(false);
  }

  function isImage(url: string) {
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {variant === "camera" ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 h-16"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
              Sacar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 h-16"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-2 h-5 w-5" />
              Subir archivo
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Subir archivos
          </Button>
        )}
      </div>

      {/* Preview */}
      {existingFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {existingFiles.map((url, i) => (
            <div key={i} className="relative group rounded-md border overflow-hidden aspect-square bg-muted">
              {isImage(url) ? (
                <img src={url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-2">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground mt-1 truncate w-full text-center">
                    {url.split("/").pop()?.slice(0, 15)}
                  </span>
                </div>
              )}
              {onRemove && (
                <button
                  onClick={() => onRemove(url)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
