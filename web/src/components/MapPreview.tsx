"use client";

import { useState } from "react";

interface MapPreviewProps {
  lat: number;
  lon: number;
  zoom?: number;
}

export default function MapPreview({ lat, lon, zoom = 17 }: MapPreviewProps) {
  const [loaded, setLoaded] = useState(false);

  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.002},${lat - 0.001},${lon + 0.002},${lat + 0.001}&layer=mapnik&marker=${lat},${lon}`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 180,
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        border: "1px solid var(--border)",
        background: "var(--bg-tertiary)",
        marginBottom: 12,
      }}
    >
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: 6, opacity: 0.5 }}
          >
            <circle cx="12" cy="10" r="3" />
            <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
          </svg>
        </div>
      )}
      <iframe
        src={src}
        width="100%"
        height="100%"
        style={{
          border: "none",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.3s ease",
          filter: "saturate(0.6) contrast(1.1)",
          pointerEvents: "none",
        }}
        loading="lazy"
        title="Map preview"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
