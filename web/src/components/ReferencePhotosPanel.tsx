"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import { api } from "@/lib/api";
import type { ProjectImage } from "@/types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PROJECT_IMAGES = 10;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

interface ReferencePhotosPanelProps {
  projectId: string;
  images: ProjectImage[];
  onImagesChange: (images: ProjectImage[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isAcceptedFile(file: File): boolean {
  if (/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type)) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export default function ReferencePhotosPanel({
  projectId,
  images,
  onImagesChange,
}: ReferencePhotosPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deletingImage, setDeletingImage] = useState<ProjectImage | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const remainingSlots = MAX_PROJECT_IMAGES - images.length;
  const imageIds = useMemo(() => images.map((image) => image.id).join(","), [images]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    async function loadThumbnails() {
      const next: Record<string, string> = {};
      for (const image of images) {
        try {
          const blob = await api.getProjectImageAsset(image.urls.thumb_200);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          next[image.id] = url;
        } catch {
          // Keep broken thumbnails non-fatal; metadata can still be deleted.
        }
      }
      if (!cancelled) setThumbUrls(next);
    }

    void loadThumbnails();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageIds, images]);

  async function uploadFiles(files: FileList | File[]) {
    const queue = Array.from(files).slice(0, remainingSlots);
    let nextImages = images;
    if (queue.length === 0) {
      toast("A project can have at most 10 reference photos.", "error");
      return;
    }

    for (const file of queue) {
      if (!isAcceptedFile(file)) {
        toast(`${file.name}: accepted formats are JPEG, PNG, HEIC, HEIF, and WebP.`, "error");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast(`${file.name}: image must be 10MB or smaller.`, "error");
        continue;
      }

      const abort = new AbortController();
      uploadAbortRef.current = abort;
      setUploadProgress(0);
      try {
        const result = await api.uploadProjectImage(projectId, file, {
          signal: abort.signal,
          onProgress: setUploadProgress,
        });
        nextImages = [result.image, ...nextImages].slice(0, MAX_PROJECT_IMAGES);
        onImagesChange(nextImages);
        toast("Reference photo uploaded.", "success");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          toast("Upload cancelled.", "info");
        } else {
          toast(err instanceof Error ? err.message : "Upload failed", "error");
        }
      } finally {
        uploadAbortRef.current = null;
        setUploadProgress(null);
      }
    }
  }

  async function confirmDelete() {
    if (!deletingImage) return;
    try {
      await api.deleteProjectImage(projectId, deletingImage.id);
      onImagesChange(images.filter((image) => image.id !== deletingImage.id));
      toast("Reference photo deleted.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setDeletingImage(null);
    }
  }

  return (
    <section className="reference-photos-panel" aria-labelledby="reference-photos-title">
      <div className="reference-photos-header">
        <div>
          <div className="label-mono reference-photos-eyebrow">House context</div>
          <h3 id="reference-photos-title">Reference photos</h3>
          <p>Upload exterior photos so AI advice can use real roof, facade, trim, condition, and landscaping context.</p>
        </div>
        <span className="badge badge-forest">{images.length}/10</span>
      </div>

      <button
        type="button"
        className="reference-photo-dropzone"
        data-dragging={dragging}
        disabled={remainingSlots <= 0 || uploadProgress !== null}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles(event.dataTransfer.files);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>{remainingSlots > 0 ? "Drop photos here or browse" : "Photo limit reached"}</span>
        <small>JPEG, PNG, HEIC, WebP. 10MB each.</small>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) void uploadFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {uploadProgress !== null && (
        <div className="reference-photo-progress" role="status" aria-live="polite">
          <div>
            <span>Uploading...</span>
            <strong>{uploadProgress}%</strong>
          </div>
          <progress value={uploadProgress} max={100} />
          <button type="button" className="btn btn-ghost" onClick={() => uploadAbortRef.current?.abort()}>
            Cancel
          </button>
        </div>
      )}

      {images.length > 0 ? (
        <div className="reference-photo-grid" aria-label="Uploaded house reference photos">
          {images.map((image) => (
            <article key={image.id} className="reference-photo-card">
              {thumbUrls[image.id] ? (
                <img src={thumbUrls[image.id]} alt={image.original_filename} />
              ) : (
                <div className="reference-photo-skeleton" aria-label="Loading thumbnail" />
              )}
              <div>
                <strong>{image.original_filename}</strong>
                <span>{image.width && image.height ? `${image.width}x${image.height}` : "processed"} · {formatFileSize(image.byte_size)}</span>
              </div>
              <button
                type="button"
                className="reference-photo-delete"
                aria-label={`Delete ${image.original_filename}`}
                onClick={() => setDeletingImage(image)}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="reference-photo-empty">No house photos yet. Add one before asking the AI about roof, facade, or material choices.</p>
      )}

      <ConfirmDialog
        open={Boolean(deletingImage)}
        title="Delete reference photo?"
        message={deletingImage ? `Remove ${deletingImage.original_filename} from this project?` : ""}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingImage(null)}
      />
    </section>
  );
}
