"use client";
import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImagePlus, Clipboard, X, Maximize2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function resizeDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale) || 1;
      const h = Math.round(img.height * scale) || 1;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error("Invalid image"));
    img.src = dataUrl;
  });
}

interface ChartAttachmentProps {
  label: string;
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
}

export function ChartAttachment({ label, value, onChange }: ChartAttachmentProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function processFile(file: Blob) {
    setLoading(true);
    try {
      const raw = await fileToDataUrl(file);
      const resized = await resizeDataUrl(raw);
      onChange(resized);
    } catch {
      toast({ title: "Couldn't process image", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (file) {
      e.preventDefault();
      processFile(file);
    }
  }

  async function handlePasteButton() {
    try {
      if (!navigator.clipboard?.read) {
        toast({ title: "Focus the box above and press Ctrl+V to paste an image", variant: "destructive" });
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          await processFile(blob);
          return;
        }
      }
      toast({ title: "No image found on clipboard", variant: "destructive" });
    } catch {
      toast({ title: "Clipboard access denied — try Ctrl+V over the box instead", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      {value ? (
        <div className="relative group rounded-lg overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="w-full h-32 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => setExpanded(true)}>
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          tabIndex={0}
          onPaste={handlePaste}
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border hover:border-blue-500 focus:border-blue-500 focus:outline-none transition-colors py-6 text-center cursor-pointer"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground px-2">Click to upload, or focus and paste (Ctrl+V)</span>
            </>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handleFileInput} />

      <Button type="button" variant="outline" size="sm" className="w-full text-xs h-7" onClick={handlePasteButton} disabled={loading}>
        <Clipboard className="mr-1.5 h-3 w-3" />
        Paste from clipboard
      </Button>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value && <img src={value} alt={label} className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
