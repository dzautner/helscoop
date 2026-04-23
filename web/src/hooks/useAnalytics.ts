"use client";

/**
 * Privacy-first analytics hook using Plausible Analytics.
 *
 * Plausible is GDPR-compliant by design: no cookies, no personal data,
 * no consent banner required. All events are anonymous.
 *
 * The hook provides a thin `track()` wrapper so we can swap providers
 * later without touching every component.
 */

import { useCallback, useEffect, useRef } from "react";

// ── Event name literals ────────────────────────────────────────────
export type AnalyticsEvent =
  | "address_search"
  | "project_created"
  | "renovation_wizard_opened"
  | "renovation_wizard_step_viewed"
  | "renovation_wizard_completed"
  | "editor_mode_changed"
  | "editor_session"
  | "bom_item_added"
  | "bom_imported"
  | "bom_item_removed"
  | "bom_item_undo_remove"
  | "bom_aggregated"
  | "photo_estimate_generated"
  | "photo_estimate_imported"
  | "bom_package_material_replaced"
  | "bom_optimization_applied"
  | "bom_optimization_dismissed"
  | "bom_optimization_undo"
  | "bom_supplier_price_applied"
  | "material_surface_selected"
  | "material_surface_replaced"
  | "presentation_link_copied"
  | "presentation_render_downloaded"
  | "quote_request_submitted"
  | "financing_widget_viewed"
  | "financing_partner_clicked"
  | "financing_conversion_reported"
  | "bom_exported"
  | "project_exported"
  | "project_imported"
  | "chat_message_sent"
  | "chat_code_applied"
  | "auth_register"
  | "auth_login"
  | "auth_google_login"
  | "auth_apple_login"
  | "bulk_archive"
  | "bulk_delete"
  | "bulk_add_tag"
  | "page_view";

// ── Property maps per event ────────────────────────────────────────
export interface AnalyticsEventProps {
  address_search: { query_length: number; had_result: boolean };
  project_created: { source: "address" | "template" | "blank" | "wizard"; building_type?: string };
  renovation_wizard_opened: { source: "project_list" | "editor" };
  renovation_wizard_step_viewed: { source: "project_list" | "editor"; step: number; step_id: string; renovation_type: string };
  renovation_wizard_completed: { source: "project_list" | "editor"; renovation_type: string; estimated_cost: number; bom_count: number };
  editor_mode_changed: { mode: "simple" | "advanced" };
  editor_session: { duration_s: number; used_code_editor: boolean; used_chat: boolean };
  bom_item_added: { material_id: string; category?: string };
  bom_imported: { count: number; mode: "merge" | "replace" };
  bom_item_removed: { material_id: string };
  bom_item_undo_remove: { material_id: string };
  bom_aggregated: { project_count: number; item_count: number };
  photo_estimate_generated: { project_id: string; photo_count: number; scope_count: number; estimate_mid: number };
  photo_estimate_imported: { project_id: string; item_count: number; estimate_mid: number };
  bom_package_material_replaced: { from_material_id: string; to_material_id: string; category?: string; source?: string };
  bom_optimization_applied: { type: string; material_id: string; savings_amount: number };
  bom_optimization_dismissed: { type: string; material_id: string; savings_amount: number };
  bom_optimization_undo: { type: string; material_id: string };
  bom_supplier_price_applied: { material_id: string; supplier: string; unit_price: number };
  material_surface_selected: { material_id: string; object_id?: string };
  material_surface_replaced: { from_material_id: string; to_material_id: string; category?: string };
  presentation_link_copied: { preset: string };
  presentation_render_downloaded: { preset: string; watermarked: boolean };
  quote_request_submitted: { project_id: string; bom_line_count: number; estimated_cost: number };
  financing_widget_viewed: { bom_total: number; loan_amount: number; term_years: number; offer_count: number; energy_grant_signal: boolean };
  financing_partner_clicked: { partner: string; loan_amount: number; term_years: number; target: "loan_comparison" | "materials_bnpl" };
  financing_conversion_reported: { partner: string; amount: number; status: "started" | "qualified" | "approved" | "rejected" };
  bom_exported: { format: "pdf" | "csv" | "json" };
  project_exported: { format: "helscoop" | "ara_grant_package" | "ifc4x3_permit" | "permit_pack_zip" };
  project_imported: { format: "helscoop" };
  chat_message_sent: { suggestion_used: boolean };
  chat_code_applied: Record<string, never>;
  auth_register: Record<string, never>;
  auth_login: Record<string, never>;
  auth_google_login: Record<string, never>;
  auth_apple_login: Record<string, never>;
  bulk_archive: { count: number };
  bulk_delete: { count: number };
  bulk_add_tag: { tag: string; count: number };
  page_view: { path: string };
}

// ── Plausible global type (injected by their <script>) ─────────────
declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
  }
}

// ── The domain we report to — matches the Plausible site ID ────────
const PLAUSIBLE_DOMAIN = "helscoop.fi";

/**
 * Whether analytics is enabled.
 * Disabled during SSR, in dev (localhost), and when Plausible hasn't loaded.
 * We still accept `track()` calls gracefully (they become no-ops).
 */
function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  // Disable in dev / localhost
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return false;
  }
  return typeof window.plausible === "function";
}

/**
 * Low-level fire-and-forget event dispatch.
 */
function sendEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
) {
  if (!isEnabled()) {
    // In dev, log to console for debugging
    if (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1")
    ) {
      // eslint-disable-next-line no-console
      console.debug(`[analytics] ${name}`, props ?? "");
    }
    return;
  }
  window.plausible!(name, props ? { props } : undefined);
}

// ── Public hook ────────────────────────────────────────────────────

export function useAnalytics() {
  /**
   * Track a typed analytics event.
   *
   * Usage:
   *   const { track } = useAnalytics();
   *   track("address_search", { query_length: 12, had_result: true });
   */
  const track = useCallback(
    <E extends AnalyticsEvent>(
      event: E,
      props: AnalyticsEventProps[E],
    ) => {
      sendEvent(event, props as Record<string, string | number | boolean>);
    },
    [],
  );

  return { track };
}

/**
 * Hook to track editor session duration.
 * Call once per editor mount; it fires `editor_session` on unmount
 * with the elapsed seconds.
 */
export function useEditorSession() {
  const startRef = useRef(Date.now());
  const usedCodeRef = useRef(false);
  const usedChatRef = useRef(false);

  const markCodeEditor = useCallback(() => {
    usedCodeRef.current = true;
  }, []);

  const markChat = useCallback(() => {
    usedChatRef.current = true;
  }, []);

  useEffect(() => {
    const start = startRef.current;
    return () => {
      const duration_s = Math.round((Date.now() - start) / 1000);
      if (duration_s < 2) return; // skip bounces
      sendEvent("editor_session", {
        duration_s,
        used_code_editor: usedCodeRef.current,
        used_chat: usedChatRef.current,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { markCodeEditor, markChat };
}

// Re-export domain for the script tag
export { PLAUSIBLE_DOMAIN };
