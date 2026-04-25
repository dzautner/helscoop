"use client";

import { useState, type CSSProperties } from "react";

interface BeforeAfterComparisonProps {
  beforeImage?: string | null;
  afterImage: string;
  title?: string;
  initialSplit?: number;
  watermark?: boolean;
  beforeLabel: string;
  afterLabel: string;
  sliderLabel: string;
}

function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(95, Math.max(5, value));
}

export default function BeforeAfterComparison({
  beforeImage,
  afterImage,
  title,
  initialSplit = 50,
  watermark = false,
  beforeLabel,
  afterLabel,
  sliderLabel,
}: BeforeAfterComparisonProps) {
  const [split, setSplit] = useState(() => clampSplit(initialSplit));
  const hasBefore = Boolean(beforeImage);

  return (
    <figure className="before-after-comparison" aria-label={title || sliderLabel}>
      <div className="before-after-stage" style={{ "--before-after-split": `${split}%` } as CSSProperties}>
        {hasBefore && (
          <img
            className="before-after-image before-after-image-before"
            src={beforeImage || ""}
            alt={beforeLabel}
          />
        )}
        <img
          className="before-after-image before-after-image-after"
          src={afterImage}
          alt={afterLabel}
          data-has-before={hasBefore ? "true" : "false"}
        />
        {hasBefore && (
          <>
            <div className="before-after-divider" aria-hidden="true" />
            <div className="before-after-pill before-after-pill-before">{beforeLabel}</div>
            <div className="before-after-pill before-after-pill-after">{afterLabel}</div>
          </>
        )}
        {watermark && <div className="before-after-watermark">Made with Helscoop</div>}
      </div>
      {hasBefore && (
        <figcaption className="before-after-control">
          <span>{sliderLabel}</span>
          <input
            type="range"
            min={5}
            max={95}
            value={split}
            onChange={(event) => setSplit(clampSplit(Number(event.target.value)))}
            aria-label={sliderLabel}
          />
        </figcaption>
      )}
    </figure>
  );
}
