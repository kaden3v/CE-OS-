import { useEffect, useRef, useState } from "react";
import { Camera, Upload, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { logDbError } from "@/lib/dbErrors";
import { demoWhere, demoInsert, demoDelete } from "@/lib/demo/store";
import type { Tables } from "@/lib/database.types";

/** Read a File into a data URL (used to persist demo photos in localStorage). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type Photo = Tables<"plant_photos">;

const BUCKET = "plant-photos";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB client-side cap (server cap is 10 MB)
const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp", "image/avif"];

interface Props {
  inventoryId: string;
}

/**
 * Plant photo uploader for an inventory item.
 *
 * Storage path convention: <user_id>/<inventory_id>/<uuid>.<ext>
 * The leading user_id segment is required by the Storage RLS policy that
 * restricts writes to the authed user's namespace.
 */
export function PhotoUploader({ inventoryId }: Props) {
  const { user, isDemo } = useAuth();
  const { addToast } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<Array<Photo & { signedUrl: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const isAuthed = !!user && (isDemo || !!supabase);

  useEffect(() => {
    if (!isAuthed) {
      setPhotos([]);
      return;
    }
    if (isDemo) {
      // In demo mode storage_path holds a data URL, used directly as the src.
      const rows = demoWhere<Photo>("plant_photos", { inventory_id: inventoryId })
        .sort((a, b) => (a.taken_at < b.taken_at ? 1 : -1));
      setPhotos(rows.map((p) => ({ ...p, signedUrl: p.storage_path })));
      return;
    }
    let cancelled = false;
    supabase!
      .from("plant_photos")
      .select("*")
      .eq("inventory_id", inventoryId)
      .eq("user_id", user!.id)
      .order("taken_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || !data) return;
        if (error) {
          logDbError("photos.list", error);
          return;
        }
        Promise.all(
          data.map(async (p) => {
            const { data: signed } = await supabase!.storage.from(BUCKET).createSignedUrl(p.storage_path, 3600);
            return { ...p, signedUrl: signed?.signedUrl ?? "" };
          }),
        ).then((withUrls) => !cancelled && setPhotos(withUrls));
      });
    return () => {
      cancelled = true;
    };
  }, [inventoryId, user?.id, isAuthed]);

  const handleFile = async (file: File) => {
    if (!isAuthed) {
      addToast({ title: "Sign in to upload photos", status: "info" });
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      addToast({ title: "Unsupported file type", description: "Use PNG, JPEG, WebP, or AVIF.", status: "warn" });
      return;
    }
    if (file.size > MAX_BYTES) {
      addToast({ title: "File too large", description: "Max 8 MB.", status: "warn" });
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user!.id}/${inventoryId}/${crypto.randomUUID()}.${ext}`;

    setUploading(true);

    if (isDemo) {
      try {
        const dataUrl = await fileToDataUrl(file);
        const row = {
          id: crypto.randomUUID(),
          user_id: user!.id,
          inventory_id: inventoryId,
          cultivar_id: null,
          caption: null,
          storage_path: dataUrl,
          taken_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        } as Photo;
        demoInsert("plant_photos", row);
        setPhotos((prev) => [{ ...row, signedUrl: dataUrl }, ...prev]);
        addToast({ title: "Photo added", status: "ok" });
      } catch {
        addToast({ title: "Couldn't read that file", status: "alert" });
      } finally {
        setUploading(false);
      }
      return;
    }

    const { error: uploadErr } = await supabase!.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadErr) {
      logDbError("photo upload", uploadErr as any);
      addToast({ title: "Upload failed", description: "Try again or use a smaller file.", status: "alert" });
      setUploading(false);
      return;
    }

    const { data: row, error: insertErr } = await supabase!
      .from("plant_photos")
      .insert({
        user_id: user!.id,
        inventory_id: inventoryId,
        storage_path: path,
      })
      .select()
      .single();
    if (insertErr || !row) {
      logDbError("photo insert", insertErr);
      // Best-effort cleanup of the orphaned object
      await supabase!.storage.from(BUCKET).remove([path]);
      addToast({ title: "Couldn't save photo", status: "alert" });
      setUploading(false);
      return;
    }

    const { data: signed } = await supabase!.storage.from(BUCKET).createSignedUrl(path, 3600);
    setPhotos((prev) => [{ ...row, signedUrl: signed?.signedUrl ?? "" }, ...prev]);
    setUploading(false);
    addToast({ title: "Photo added", status: "ok" });
  };

  const handleDelete = async (photo: Photo) => {
    if (!isAuthed) return;
    if (!confirm("Delete this photo?")) return;
    if (isDemo) {
      demoDelete("plant_photos", photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      addToast({ title: "Photo removed", status: "info" });
      return;
    }
    const { error: storageErr } = await supabase!.storage.from(BUCKET).remove([photo.storage_path]);
    if (storageErr) {
      logDbError("photo storage delete", storageErr as any);
    }
    const { error: dbErr } = await supabase!.from("plant_photos").delete().eq("id", photo.id).eq("user_id", user!.id);
    if (dbErr) {
      logDbError("photo db delete", dbErr);
      addToast({ title: "Delete failed", status: "alert" });
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    addToast({ title: "Photo removed", status: "info" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wide text-text-secondary">Photos</h3>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !isAuthed}
          className="inline-flex items-center gap-2 text-xs px-2 py-2 rounded-md border border-border-strong hover:bg-bg-hover disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {!isAuthed && (
        <div className="text-xs text-text-tertiary italic p-2 rounded border border-dashed border-border-subtle">
          Photo storage is only available when signed in.
        </div>
      )}

      {isAuthed && photos.length === 0 && (
        <div className="border border-dashed border-border-subtle rounded-lg p-8 flex flex-col items-center justify-center text-text-tertiary">
          <Camera className="w-6 h-6 mb-2 opacity-50" />
          <p className="text-xs">No photos yet</p>
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-lg border border-border-subtle overflow-hidden bg-bg-active group">
              {p.signedUrl ? (
                <img src={p.signedUrl} alt={p.caption ?? "Plant photo"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-tertiary"><Camera className="w-5 h-5" /></div>
              )}
              <button
                onClick={() => handleDelete(p)}
                aria-label="Delete photo"
                className="absolute top-1 right-1 p-1 rounded bg-bg-base/80 backdrop-blur text-text-secondary hover:text-status-alert opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="absolute bottom-1 right-1 bg-bg-elevated/80 backdrop-blur text-[10px] px-2 rounded text-text-secondary border border-border-subtle">
                {new Date(p.taken_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
