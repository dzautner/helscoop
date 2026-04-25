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
  | "quantity_takeoff_generated"
  | "quantity_takeoff_imported"
  | "room_scan_imported"
  | "room_scan_applied"
  | "room_scan_bom_imported"
  | "blueprint_scene_generated"
  | "blueprint_scene_applied"
  | "project_photo_overlay_uploaded"
  | "bom_package_material_replaced"
  | "bom_optimization_applied"
  | "bom_optimization_dismissed"
  | "bom_optimization_undo"
  | "bom_supplier_price_applied"
  | "material_surface_selected"
  | "thermal_surface_inspected"
  | "material_surface_replaced"
  | "presentation_link_copied"
  | "presentation_render_downloaded"
  | "before_after_share_generated"
  | "before_after_share_link_copied"
  | "before_after_share_downloaded"
  | "ar_camera_opened"
  | "ar_screenshot_saved"
  | "scenario_render_generated"
  | "scenario_render_downloaded"
  | "gallery_viewed"
  | "gallery_project_opened"
  | "gallery_project_cloned"
  | "construction_timelapse_started"
  | "construction_timelapse_exported"
  | "quote_request_submitted"
  | "financing_widget_viewed"
  | "financing_partner_clicked"
  | "financing_conversion_reported"
  | "bom_exported"
  | "project_exported"
  | "project_imported"
  | "chat_message_sent"
  | "chat_code_applied"
  | "chat_code_validation_failed"
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
  project_created: { source: "address" | "template" | "blank" | "wizard"; building_type?: string; project_type?: "omakotitalo" | "taloyhtio" };
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
  quantity_takeoff_generated: { project_id: string; drawing_count: number; room_count: number; estimate_mid: number; confidence: number };
  quantity_takeoff_imported: { project_id: string; item_count: number; estimate_mid: number };
  room_scan_imported: { project_id: string; source_format: string; room_count: number; wall_count: number; opening_count: number; coverage_percent: number; parser: string };
  room_scan_applied: { project_id: string; room_count: number; wall_count: number; merge_mode: "append" | "replace" };
  room_scan_bom_imported: { project_id: string; item_count: number; estimate_mid: number };
  blueprint_scene_generated: { file_type: string; room_count: number; confidence: number };
  blueprint_scene_applied: { room_count: number; confidence: number };
  project_photo_overlay_uploaded: { file_type: string };
  bom_package_material_replaced: { from_material_id: string; to_material_id: string; category?: string; source?: string };
  bom_optimization_applied: { type: string; material_id: string; savings_amount: number };
  bom_optimization_dismissed: { type: string; material_id: string; savings_amount: number };
  bom_optimization_undo: { type: string; material_id: string };
  bom_supplier_price_applied: { material_id: string; supplier: string; unit_price: number };
  material_surface_selected: { material_id: string; object_id?: string };
  thermal_surface_inspected: { material_id: string; object_id?: string };
  material_surface_replaced: { from_material_id: string; to_material_id: string; category?: string };
  presentation_link_copied: { preset: string };
  presentation_render_downloaded: { preset: string; watermarked: boolean };
  before_after_share_generated: { project_id: string; preset: string; has_before_image: boolean; watermarked: boolean };
  before_after_share_link_copied: { project_id: string };
  before_after_share_downloaded: { project_id: string; preset: string };
  ar_camera_opened: { project_id: string; has_render: boolean };
  ar_screenshot_saved: { project_id: string };
  scenario_render_generated: { project_id: string; view_count: number; lighting_preset: string; has_before_image: boolean; source: "manual" | "toolbar" };
  scenario_render_downloaded: { project_id: string; artifact: "single" | "contact_sheet"; view_count: number; lighting_preset: string };
  gallery_viewed: { result_count: number; has_query: boolean; project_type?: string; cost_range?: string };
  gallery_project_opened: { project_id: string; source: "card" | "viewer" };
  gallery_project_cloned: { project_id: string; source: "gallery" | "shared_viewer" };
  construction_timelapse_started: { project_name: string; step_count: number; camera_mode: string; speed: number };
  construction_timelapse_exported: { project_name: string; format: "json" | "svg"; step_count: number; camera_mode: string };
  quote_request_submitted: { project_id: string; bom_line_count: number; estimated_cost: number };
  financing_widget_viewed: { bom_total: number; loan_amount: number; term_years: number; offer_count: number; energy_grant_signal: boolean };
  financing_partner_clicked: { partner: string; loan_amount: number; term_years: number; target: "loan_comparison" | "materials_bnpl" };
  financing_conversion_reported: { partner: string; amount: number; status: "started" | "qualified" | "approved" | "rejected" };
  bom_exported: { format: "pdf" | "csv" | "json" };
  project_exported: { format: "helscoop" | "ara_grant_package" | "ifc4x3_permit" | "permit_pack_zip" | "photo_overlay_png" | "proposal_pdf" };
  project_imported: { format: "helscoop" };
  chat_message_sent: { suggestion_used: boolean };
  chat_code_applied: Record<string, never>;
  chat_code_validation_failed: Record<string, never>;
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
