"use client";

/* ── Primitive skeleton shapes ────────────────────────────────── */

/** Low-level block skeleton with configurable dimensions. */
export function SkeletonBlock({
  width,
  height,
  radius,
  style,
}: {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{
        width: width ?? "100%",
        height: height ?? 16,
        borderRadius: radius ?? "var(--radius-sm)",
        ...style,
      }}
    />
  );
}

/**
 * Variant-based skeleton with semantic presets.
 *
 *  - `text`   — single line of text (default 100% width, 14px tall)
 *  - `card`   — rectangular card placeholder
 *  - `circle` — avatar / icon circle
 *  - `rect`   — generic rectangle with explicit width/height
 */
export function Skeleton({
  variant = "text",
  width,
  height,
  style,
}: {
  variant?: "text" | "card" | "circle" | "rect";
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}) {
  switch (variant) {
    case "circle":
      return (
        <SkeletonBlock
          width={width ?? 40}
          height={height ?? 40}
          radius="50%"
          style={{ flexShrink: 0, ...style }}
        />
      );
    case "card":
      return (
        <SkeletonBlock
          width={width ?? "100%"}
          height={height ?? 80}
          radius="var(--radius-md)"
          style={style}
        />
      );
    case "rect":
      return (
        <SkeletonBlock
          width={width ?? "100%"}
          height={height ?? 48}
          radius="var(--radius-sm)"
          style={style}
        />
      );
    case "text":
    default:
      return (
        <SkeletonBlock
          width={width ?? "100%"}
          height={height ?? 14}
          radius={4}
          style={style}
        />
      );
  }
}

/* ── Composite skeletons ──────────────────────────────────────── */

/** Skeleton for a project card in the project list. */
export function SkeletonProjectCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="card"
      style={{
        padding: "22px 28px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        alignItems: "center",
        animation: `fadeIn 0.3s ease ${delay}s both`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SkeletonBlock width={180} height={20} />
          <SkeletonBlock width={60} height={22} radius={100} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SkeletonBlock width={120} height={14} />
          <SkeletonBlock width={70} height={14} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <SkeletonBlock width={52} height={30} />
        <SkeletonBlock width={52} height={30} />
        <SkeletonBlock width={52} height={30} />
      </div>
    </div>
  );
}

/** Skeleton for a table row (e.g. admin panel). */
export function SkeletonTableRow({ columns = 5, delay = 0 }: { columns?: number; delay?: number }) {
  return (
    <tr style={{ animation: `fadeIn 0.3s ease ${delay}s both` }}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <SkeletonBlock
            width={i === 0 ? 36 : `${60 + Math.random() * 40}%`}
            height={i === 0 ? 36 : 14}
            radius={i === 0 ? 6 : undefined}
          />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton for the BOM panel while materials data is loading. */
export function SkeletonBomPanel() {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Total cost card skeleton */}
      <div
        style={{
          padding: "14px 16px",
          background: "var(--bg-tertiary)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
        }}
      >
        <Skeleton variant="text" width={90} height={10} style={{ marginBottom: 8 }} />
        <Skeleton variant="text" width={120} height={24} />
      </div>
      {/* BOM item skeletons */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: "12px 14px",
            background: "var(--bg-tertiary)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            animation: `fadeIn 0.3s ease ${i * 0.06}s both`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Skeleton variant="rect" width={28} height={28} />
            <Skeleton variant="text" width="60%" height={14} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Skeleton variant="text" width={48} height={12} />
            <Skeleton variant="text" width={60} height={12} />
            <div style={{ flex: 1 }} />
            <Skeleton variant="text" width={50} height={14} />
          </div>
        </div>
      ))}
      {/* Material browser skeleton */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
        <Skeleton variant="text" width={110} height={10} style={{ marginBottom: 10 }} />
        <Skeleton variant="rect" width="100%" height={32} />
      </div>
    </div>
  );
}

/** Skeleton for price comparison popup content. */
export function SkeletonPriceComparison() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: "14px 16px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            animation: `fadeIn 0.3s ease ${i * 0.06}s both`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Skeleton variant="text" width={100} height={14} />
              <Skeleton variant="text" width={50} height={18} style={{ borderRadius: 100 }} />
            </div>
            <Skeleton variant="text" width={60} height={16} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <Skeleton variant="text" width={80} height={11} />
            <Skeleton variant="text" width={60} height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full-page loading skeleton for the project editor. */
export function SkeletonProjectEditor() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header skeleton */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <SkeletonBlock width={32} height={32} />
        <div style={{ width: 1, height: 20, background: "var(--border)" }} />
        <SkeletonBlock width={200} height={20} />
        <div style={{ flex: 1 }} />
        <SkeletonBlock width={80} height={32} />
        <SkeletonBlock width={72} height={32} />
      </div>
      {/* Body skeleton */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <SkeletonBlock width={100} height={14} />
          <SkeletonBlock height="100%" radius="var(--radius-md)" />
        </div>
        <div style={{ width: 360, borderLeft: "1px solid var(--border)", padding: 16 }}>
          <SkeletonBlock width={140} height={18} style={{ marginBottom: 16 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} height={70} radius="var(--radius-sm)" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
