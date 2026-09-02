import { useRef, useState } from "react";
import { getBaseUrl } from "@workspace/api-client-react";
import { getAssetUrl } from "@/lib/asset-url";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  folder?: "products" | "categories" | "restaurants" | "drivers";
  label?: string;
  className?: string;
}

/**
 * Admin image upload widget: pick a file from device (camera/gallery/file
 * picker), upload it to the server for compression + WebP conversion, and
 * store only the resulting URL. Never accepts a manually typed URL.
 */
export function ImageUpload({ value, onChange, folder = "products", label, className }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const previewUrl = getAssetUrl(value);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "الملف غير صالح", description: "يرجى اختيار صورة (JPG, PNG, WEBP...)", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "الصورة كبيرة جداً", description: "الحد الأقصى لحجم الصورة هو 8 ميغابايت", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("folder", folder);

      const base = getBaseUrl() ?? "";
      const res = await fetch(`${base}/api/uploads/image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "فشل رفع الصورة");
      }

      const data: { url: string } = await res.json();
      onChange(data.url);
    } catch (err: any) {
      toast({ title: "فشل رفع الصورة", description: err?.message || "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={className}>
      {label && <p className="text-sm font-medium mb-1.5">{label}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        data-testid="input-image-upload"
      />

      {previewUrl ? (
        <div className="flex items-center gap-3">
          <div className="h-20 w-20 rounded-md overflow-hidden border border-border bg-secondary shrink-0">
            <img src={previewUrl} alt="معاينة الصورة" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              data-testid="button-replace-image"
            >
              {uploading ? <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="ml-2 h-3.5 w-3.5" />}
              استبدال الصورة
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={uploading}
              onClick={() => onChange("")}
              className="text-destructive hover:text-destructive"
              data-testid="button-remove-image"
            >
              <X className="ml-2 h-3.5 w-3.5" /> إزالة
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border py-6 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
          data-testid="button-upload-image"
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">جاري رفع الصورة...</span>
            </>
          ) : (
            <>
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">اضغط لاختيار صورة من جهازك</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
