const OBJECT_URL_REVOKE_DELAY_MS = 30_000;

export function downloadDataUrl(dataUrl: string, filename: string): boolean {
  return clickDownloadLink(dataUrl, filename);
}

export function downloadBlob(blob: Blob, filename: string): boolean {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return false;
  }

  let url: string;
  try {
    url = URL.createObjectURL(blob);
  } catch {
    return false;
  }
  const started = clickDownloadLink(url, filename);

  if (typeof URL.revokeObjectURL === "function") {
    const revoke = () => URL.revokeObjectURL(url);
    if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      window.setTimeout(revoke, OBJECT_URL_REVOKE_DELAY_MS);
    } else {
      setTimeout(revoke, OBJECT_URL_REVOKE_DELAY_MS);
    }
  }

  return started;
}

function clickDownloadLink(href: string, filename: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;

  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";

  document.body.appendChild(link);
  try {
    link.click();
    return true;
  } catch {
    return false;
  } finally {
    link.remove();
  }
}
