import type {
  AdminStats,
  BuildingInfo,
  BuildingResult,
  BomAggregateResponse,
  EnergySubsidyRequest,
  GalleryCostRange,
  GalleryProject,
  BomSubstitutionResponse,
  KeskoProduct,
  MarketplaceCheckoutResponse,
  MarketplaceOpenOrderResponse,
  MarketplaceOrder,
  MarketplaceSupplierCheckoutInput,
  MaterialSubstitutionResponse,
  NeighborhoodInsightsResponse,
  MoodBoardState,
  AppNotification,
  ProjectVersionCompareResponse,
  ProjectVersionsResponse,
  ProjectVersionSnapshot,
  Project,
  ProjectType,
  ProjectImage,
  ProjectImagesResponse,
  ProLeadResponse,
  ProLeadStatus,
  PriceAlertEmailFrequency,
  PriceWatch,
  ProjectPriceChangeSummary,
  PhotoEstimateResponse,
  PhotoEstimateUpload,
  QuantityTakeoffDrawing,
  QuantityTakeoffOptions,
  QuantityTakeoffResponse,
  RoomScanOptions,
  RoomScanResponse,
  RoomScanUpload,
  ProjectMaterialTrendResponse,
  QuoteRequestPayload,
  RenovationCostEstimateRequest,
  RenovationCostEstimateResponse,
  RenovationCostIndexResponse,
  RyhtiPermitMetadata,
  TerrainGrid,
  Template,
  SharePreviewState,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let token: string | null = null;

// Epoch-seconds timestamp of when the current access token expires.
// Set when we receive `token_expires_at` from the API (login, register, refresh).
let tokenExpiresAt: number | null = null;

// Background refresh timer handle — see scheduleProactiveRefresh() below.
let _refreshTimerId: ReturnType<typeof setTimeout> | null = null;

export function setToken(t: string | null, expiresAt?: number) {
  token = t;
  tokenExpiresAt = expiresAt ?? null;
  if (t) {
    localStorage.setItem("helscoop_token", t);
    if (expiresAt) localStorage.setItem("helscoop_token_expires_at", String(expiresAt));
  } else {
    localStorage.removeItem("helscoop_token");
    localStorage.removeItem("helscoop_token_expires_at");
  }
  // (Re-)schedule the background refresh timer whenever the token changes.
  _scheduleProactiveRefresh();
}

export function getToken(): string | null {
  if (token) return token;
  if (typeof window !== "undefined") {
    token = localStorage.getItem("helscoop_token");
    const exp = localStorage.getItem("helscoop_token_expires_at");
    if (exp) tokenExpiresAt = parseInt(exp, 10);
  }
  return token;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Keep the object URL alive long enough for browser download managers and
  // Playwright's download observer to resolve the blob-backed navigation.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

export class ApiError extends Error {
  status: number;
  statusText: string;

  constructor(message: string, status: number, statusText: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

const ERROR_MESSAGES: Record<number, string> = {
  400: "Virheellinen pyynto / Bad request",
  401: "Istunto vanhentunut / Session expired",
  402: "Maksu vaaditaan / Payment required",
  403: "Ei kayttooikeutta / Access denied",
  404: "Ei loytynyt / Not found",
  409: "Ristiriita / Conflict",
  422: "Virheelliset tiedot / Validation failed",
  429: "Liian monta pyyntoa / Too many requests",
  500: "Palvelinvirhe / Server error",
};

export interface CreditPack {
  id: string;
  credits: number;
  priceEur: number;
  unitPriceEur: number;
  savingsPercent?: number;
}

export interface CreditState {
  balance: number;
  lowCredit: boolean;
  monthlyGrant: number;
  lowCreditThreshold: number;
  costs: Record<string, number>;
  packs: CreditPack[];
}

export interface GalleryProjectFilters {
  q?: string;
  project_type?: ProjectType | "";
  region?: string;
  postal_code?: string;
  renovation_type?: string;
  material?: string;
  cost_range?: GalleryCostRange | "";
  limit?: number;
}

export interface NeighborhoodInsightsFilters {
  postal_code: string;
  project_type?: ProjectType | "";
  exclude_project_id?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Token refresh helpers
// ---------------------------------------------------------------------------

// Proactive refresh threshold: refresh if the token expires within 5 minutes.
const REFRESH_THRESHOLD_SECONDS = 5 * 60;

// Serialize concurrent refresh attempts — only one in-flight at a time.
let refreshPromise: Promise<boolean> | null = null;

/**
 * Call POST /auth/refresh with the current token.
 * Returns true if the token was successfully refreshed, false otherwise.
 */
async function refreshAccessToken(): Promise<boolean> {
  const t = getToken();
  if (!t) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
      },
    });
    if (!res.ok) return false;
    const body = await res.json();
    if (body.token) {
      setToken(body.token, body.token_expires_at);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Deduplicated refresh: multiple callers share a single in-flight refresh. */
function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Returns true if the current token is about to expire. */
function tokenNeedsRefresh(): boolean {
  if (!tokenExpiresAt) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return tokenExpiresAt - nowSeconds < REFRESH_THRESHOLD_SECONDS;
}

// ---------------------------------------------------------------------------
// Background refresh timer — proactively refreshes the token at ~80% of its
// lifetime so the session stays alive even during long idle editing sessions.
// This fires even when no API requests are being made (e.g. user is editing
// scene code for 15+ minutes without saving).  The timer is automatically
// (re-)scheduled every time setToken is called (login, register, refresh).
// ---------------------------------------------------------------------------

/** Schedule a background refresh based on the current token's expiry. */
function _scheduleProactiveRefresh(): void {
  // Clear any existing timer first
  if (_refreshTimerId !== null) {
    clearTimeout(_refreshTimerId);
    _refreshTimerId = null;
  }

  // Nothing to schedule if there's no token or no expiry info
  if (!token || !tokenExpiresAt) return;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = tokenExpiresAt - nowSeconds; // seconds until expiry
  if (ttl <= 0) return; // already expired, nothing to schedule

  // Fire at 80% of lifetime (e.g. 12 min into a 15 min token).
  // The callback will call refreshOnce() which calls setToken() on success,
  // which in turn re-schedules this timer — creating a self-sustaining cycle.
  const refreshInMs = Math.max(ttl * 0.8, 1) * 1000;

  _refreshTimerId = setTimeout(async () => {
    _refreshTimerId = null;
    if (getToken()) {
      await refreshOnce();
      // If refresh succeeded, setToken was called and a new timer is already scheduled.
      // If refresh failed, no new timer — the next apiFetch will attempt a 401 refresh.
    }
  }, refreshInMs);
}

/** Stop the background refresh timer (e.g. on logout). */
export function stopRefreshTimer(): void {
  if (_refreshTimerId !== null) {
    clearTimeout(_refreshTimerId);
    _refreshTimerId = null;
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper with automatic token refresh
// ---------------------------------------------------------------------------

async function apiFetch(path: string, opts?: RequestInit) {
  // Proactive refresh: if token expires soon, refresh before the request.
  const isRefreshEndpoint = path === "/auth/refresh";
  if (!isRefreshEndpoint && getToken() && tokenNeedsRefresh()) {
    await refreshOnce();
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers as Record<string, string>),
  };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });

  if (!res.ok) {
    const isAuthEndpoint =
      path.startsWith("/auth/login") ||
      path.startsWith("/auth/register") ||
      isRefreshEndpoint;

    // On 401 for a non-auth endpoint, attempt a single token refresh
    if (res.status === 401 && !isAuthEndpoint) {
      const refreshed = await refreshOnce();
      if (refreshed) {
        // Retry the original request with the new token
        const retryHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          ...(opts?.headers as Record<string, string>),
        };
        const newToken = getToken();
        if (newToken) retryHeaders.Authorization = `Bearer ${newToken}`;
        const retryRes = await fetch(`${API_URL}${path}`, { ...opts, headers: retryHeaders });
        if (retryRes.ok) return retryRes.json();
        // Retry also failed — fall through to logout
      }

      setToken(null);
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
      throw new ApiError(ERROR_MESSAGES[401], 401, res.statusText);
    }

    const body = await res.json().catch(() => ({ error: res.statusText }));
    const serverMsg = body.error || body.message;
    const fallback = ERROR_MESSAGES[res.status] || `Virhe ${res.status} / Error ${res.status}`;
    throw new ApiError(serverMsg || fallback, res.status, res.statusText);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, name: string) =>
    apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  googleLogin: (credential: string) =>
    apiFetch("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  appleLogin: (identityToken: string, user?: unknown) =>
    apiFetch("/auth/apple", {
      method: "POST",
      body: JSON.stringify({ identityToken, user }),
    }),
  me: () => apiFetch("/auth/me"),
  updateProfile: (data: { name?: string; email?: string }) =>
    apiFetch("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  updateNotificationPreferences: (data: {
    email_notifications: boolean;
    price_alert_email_frequency?: PriceAlertEmailFrequency;
    push_notifications?: boolean;
  }) =>
    apiFetch("/auth/notifications", { method: "PUT", body: JSON.stringify(data) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch("/auth/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) }),
  deleteAccount: () =>
    apiFetch("/auth/account", { method: "DELETE" }),
  exportData: () =>
    apiFetch("/auth/export-data"),
  forgotPassword: (email: string) =>
    apiFetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    apiFetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  verifyEmail: (token: string) =>
    apiFetch(`/auth/verify-email?token=${encodeURIComponent(token)}`),
  resendVerification: () =>
    apiFetch("/auth/resend-verification", { method: "POST" }),

  getProjects: () => apiFetch("/projects"),
  getProject: (id: string) => apiFetch(`/projects/${id}`),
  getGalleryProjects: (filters: GalleryProjectFilters = {}): Promise<{ projects: GalleryProject[] }> => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.project_type) params.set("project_type", filters.project_type);
    if (filters.region) params.set("region", filters.region);
    if (filters.postal_code) params.set("postal_code", filters.postal_code);
    if (filters.renovation_type) params.set("renovation_type", filters.renovation_type);
    if (filters.material) params.set("material", filters.material);
    if (filters.cost_range) params.set("cost_range", filters.cost_range);
    if (filters.limit) params.set("limit", String(filters.limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/gallery/projects${suffix}`);
  },
  getGalleryProject: (id: string): Promise<GalleryProject & Project> =>
    apiFetch(`/gallery/projects/${encodeURIComponent(id)}`),
  cloneGalleryProject: (id: string): Promise<Project & { cloned_from_project_id?: string }> =>
    apiFetch(`/gallery/projects/${encodeURIComponent(id)}/clone`, { method: "POST" }),
  getNeighborhoodInsights: (filters: NeighborhoodInsightsFilters): Promise<NeighborhoodInsightsResponse> => {
    const params = new URLSearchParams();
    params.set("postal_code", filters.postal_code);
    if (filters.project_type) params.set("project_type", filters.project_type);
    if (filters.exclude_project_id) params.set("exclude_project_id", filters.exclude_project_id);
    if (filters.limit) params.set("limit", String(filters.limit));
    return apiFetch(`/gallery/neighborhood-insights?${params.toString()}`);
  },
  createProject: (data: {
    name: string;
    description?: string;
    scene_js?: string;
    original_scene_js?: string;
    building_info?: Record<string, unknown>;
    project_type?: ProjectType;
    unit_count?: number | null;
    business_id?: string | null;
  }) =>
    apiFetch("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Record<string, unknown>, collaborationClientId?: string | null) =>
    apiFetch(`/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(collaborationClientId ? { ...data, collaboration_client_id: collaborationClientId } : data),
    }),
  publishProject: (id: string, isPublic: boolean): Promise<{
    id: string;
    is_public: boolean;
    published_at: string | null;
    gallery_status: "pending" | "approved" | "rejected";
    share_token: string | null;
    share_token_expires_at: string | null;
  }> =>
    apiFetch(`/projects/${id}/publish`, { method: "PUT", body: JSON.stringify({ is_public: isPublic }) }),
  deleteProject: (id: string) =>
    apiFetch(`/projects/${id}`, { method: "DELETE" }),
  bulkProjectAction: (ids: string[], action: string, extra?: { status?: string; tags?: string[] }) =>
    apiFetch("/projects/bulk", { method: "POST", body: JSON.stringify({ ids, action, ...extra }) }),
  getTrashProjects: () => apiFetch("/projects/trash"),
  restoreProject: (id: string) =>
    apiFetch(`/projects/${id}/restore`, { method: "POST" }),
  permanentDeleteProject: (id: string) =>
    apiFetch(`/projects/${id}/permanent`, { method: "DELETE" }),
  duplicateProject: (id: string) =>
    apiFetch(`/projects/${id}/duplicate`, { method: "POST" }),
  getProjectVersions: (id: string): Promise<ProjectVersionsResponse> =>
    apiFetch(`/projects/${id}/versions`),
  createProjectVersion: (
    id: string,
    data: {
      snapshot: ProjectVersionSnapshot;
      branch_id?: string | null;
      name?: string | null;
      description?: string | null;
      event_type?: "auto" | "named" | "restore" | "branch";
      thumbnail_url?: string | null;
    },
  ) =>
    apiFetch(`/projects/${id}/versions`, { method: "POST", body: JSON.stringify(data) }),
  restoreProjectVersion: (id: string, versionId: string) =>
    apiFetch(`/projects/${id}/versions/${versionId}/restore`, { method: "POST" }),
  compareProjectVersions: (id: string, baseId: string, targetId: string): Promise<ProjectVersionCompareResponse> =>
    apiFetch(`/projects/${id}/versions/compare?base=${encodeURIComponent(baseId)}&target=${encodeURIComponent(targetId)}`),
  createProjectBranch: (
    id: string,
    data: { name: string; snapshot: ProjectVersionSnapshot; thumbnail_url?: string | null },
  ) =>
    apiFetch(`/projects/${id}/branches`, { method: "POST", body: JSON.stringify(data) }),
  saveThumbnail: (id: string, thumbnail: string) =>
    apiFetch(`/projects/${id}/thumbnail`, {
      method: "PUT",
      body: JSON.stringify({ thumbnail }),
    }),
  saveMoodBoard: (
    id: string,
    moodBoard: MoodBoardState | null | undefined,
    collaborationClientId?: string | null,
  ): Promise<{ ok: boolean; mood_board: MoodBoardState }> =>
    apiFetch(`/projects/${id}/mood-board`, {
      method: "PUT",
      body: JSON.stringify(collaborationClientId
        ? { mood_board: moodBoard ?? { items: [] }, collaboration_client_id: collaborationClientId }
        : { mood_board: moodBoard ?? { items: [] } }),
    }),

  getMaterials: () => apiFetch("/materials"),
  getMaterial: (id: string) => apiFetch(`/materials/${id}`),
  getMaterialPrices: (id: string) => apiFetch(`/materials/${id}/prices`),
  getMaterialSubstitutions: (id: string): Promise<MaterialSubstitutionResponse> =>
    apiFetch(`/materials/${encodeURIComponent(id)}/substitutions`),

  getSuppliers: () => apiFetch("/suppliers"),
  getSupplier: (id: string) => apiFetch(`/suppliers/${id}`),
  recordAffiliateClick: (data: {
    material_id: string;
    supplier_id: string;
    click_url: string;
    partner_id?: string | null;
  }) =>
    apiFetch("/affiliates/click", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getMarketplaceOrders: (projectId: string): Promise<MarketplaceOrder[]> =>
    apiFetch(`/marketplace/project/${encodeURIComponent(projectId)}/orders`),
  createMarketplaceCheckout: (
    projectId: string,
    data: { supplier_carts: MarketplaceSupplierCheckoutInput[] },
  ): Promise<MarketplaceCheckoutResponse> =>
    apiFetch(`/marketplace/project/${encodeURIComponent(projectId)}/checkout`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  openMarketplaceOrder: (orderId: string): Promise<MarketplaceOpenOrderResponse> =>
    apiFetch(`/marketplace/orders/${encodeURIComponent(orderId)}/open`, {
      method: "POST",
    }),
  updateMarketplaceOrder: (
    orderId: string,
    data: { status: MarketplaceOrder["status"]; external_order_ref?: string | null },
  ): Promise<MarketplaceOrder> =>
    apiFetch(`/marketplace/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  comparePrices: (materialId: string) =>
    apiFetch(`/pricing/compare/${materialId}`),
  getStock: (materialId: string) =>
    apiFetch(`/pricing/stock/${materialId}`),
  getPriceHistory: (materialId: string) =>
    apiFetch(`/pricing/history/${materialId}`),
  getProjectMaterialTrends: (projectId: string): Promise<ProjectMaterialTrendResponse> =>
    apiFetch(`/pricing/trends/project/${encodeURIComponent(projectId)}`),
  getRenovationCostIndex: (): Promise<RenovationCostIndexResponse> =>
    apiFetch("/pricing/renovation-cost-index"),
  estimateRenovationCost: (data: RenovationCostEstimateRequest): Promise<RenovationCostEstimateResponse> =>
    apiFetch("/pricing/renovation-cost-estimate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getNotifications: (limit = 20): Promise<AppNotification[]> =>
    apiFetch(`/notifications?limit=${encodeURIComponent(String(limit))}`),
  getUnreadNotificationCount: (): Promise<{ unread: number }> =>
    apiFetch("/notifications/unread-count"),
  markNotificationRead: (id: string, read = true): Promise<AppNotification> =>
    apiFetch(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
      body: JSON.stringify({ read }),
    }),
  markAllNotificationsRead: (): Promise<{ updated: number }> =>
    apiFetch("/notifications/mark-all-read", { method: "POST" }),
  getPriceWatches: (projectId?: string): Promise<PriceWatch[]> => {
    const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    return apiFetch(`/notifications/price-watches${suffix}`);
  },
  upsertPriceWatch: (data: {
    project_id: string;
    material_id: string;
    target_price?: number | null;
    watch_any_decrease?: boolean;
    notify_email?: boolean;
    notify_push?: boolean;
  }): Promise<PriceWatch> =>
    apiFetch("/notifications/price-watches", { method: "PUT", body: JSON.stringify(data) }),
  deletePriceWatch: (id: string): Promise<{ ok: boolean }> =>
    apiFetch(`/notifications/price-watches/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getPushPublicKey: (): Promise<{ configured: boolean; publicKey: string | null }> =>
    apiFetch("/notifications/push/public-key"),
  subscribePushNotifications: (subscription: PushSubscriptionJSON) =>
    apiFetch("/notifications/push/subscribe", { method: "POST", body: JSON.stringify({ subscription }) }),
  updateNotificationCenterPreferences: (data: {
    price_alert_email_frequency?: PriceAlertEmailFrequency;
    push_notifications?: boolean;
  }) =>
    apiFetch("/notifications/preferences", { method: "PUT", body: JSON.stringify(data) }),
  getProjectPriceChange: (projectId: string): Promise<ProjectPriceChangeSummary> =>
    apiFetch(`/notifications/projects/${encodeURIComponent(projectId)}/price-change`),
  getStalePrices: () => apiFetch("/pricing/stale"),
  getAdminStats: (): Promise<AdminStats> => apiFetch("/admin/stats"),
  requestSupplierRescrape: (supplierId: string) =>
    apiFetch(`/admin/suppliers/${encodeURIComponent(supplierId)}/rescrape`, { method: "POST" }),
  searchKeskoProducts: (q: string, branchCode?: string) => {
    const params = new URLSearchParams({ q });
    if (branchCode) params.set("branchCode", branchCode);
    return apiFetch(`/kesko/products/search?${params.toString()}`);
  },
  importKeskoProduct: (product: KeskoProduct) =>
    apiFetch("/kesko/products/import", {
      method: "POST",
      body: JSON.stringify({ productId: product.id, product }),
    }),
  estimateEnergySubsidy: (data: EnergySubsidyRequest) =>
    apiFetch("/subsidies/energy/estimate", { method: "POST", body: JSON.stringify(data) }),
  getWasteEstimate: (projectId: string) =>
    apiFetch(`/waste/estimate?projectId=${encodeURIComponent(projectId)}`),
  getRyhtiPackage: (projectId: string) =>
    apiFetch(`/ryhti/projects/${encodeURIComponent(projectId)}/package`),
  updateRyhtiMetadata: (projectId: string, metadata: Partial<RyhtiPermitMetadata>) =>
    apiFetch(`/ryhti/projects/${encodeURIComponent(projectId)}/metadata`, {
      method: "PUT",
      body: JSON.stringify({ metadata }),
    }),
  validateRyhti: (projectId: string) =>
    apiFetch(`/ryhti/projects/${encodeURIComponent(projectId)}/validate`, { method: "POST" }),
  submitRyhti: (projectId: string) =>
    apiFetch(`/ryhti/projects/${encodeURIComponent(projectId)}/submit`, { method: "POST" }),
  getRyhtiStatus: (projectId: string) =>
    apiFetch(`/ryhti/projects/${encodeURIComponent(projectId)}/status`),
  generateBuilding: (payload: {
    address?: string;
    coordinates?: { lat: number; lon: number };
    building_info: Partial<BuildingInfo>;
  }): Promise<BuildingResult> =>
    apiFetch("/building/generate", { method: "POST", body: JSON.stringify(payload) }),

  getCategories: () => apiFetch("/categories"),
  getTemplates: (filters: {
    category?: string;
    sort?: "popular" | "newest" | "price";
    q?: string;
    lang?: string;
    limit?: number;
  } = {}): Promise<Template[]> => {
    const params = new URLSearchParams();
    if (filters.category && filters.category !== "all") params.set("category", filters.category);
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.q) params.set("q", filters.q);
    if (filters.lang) params.set("lang", filters.lang);
    if (filters.limit) params.set("limit", String(filters.limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/templates${suffix}`);
  },
  recordTemplateUse: (templateId: string): Promise<{ ok: boolean; id: string; use_count: number }> =>
    apiFetch(`/templates/${encodeURIComponent(templateId)}/use`, { method: "PUT" }),
  exportBOM: (projectId: string) => apiFetch(`/bom/export/${projectId}`),
  aggregateBOM: (projectIds: string[]): Promise<BomAggregateResponse> =>
    apiFetch("/bom/aggregate", {
      method: "POST",
      body: JSON.stringify({ project_ids: projectIds }),
    }),
  estimatePhotoRenovation: (
    projectId: string,
    data: { photos: PhotoEstimateUpload[]; building_info?: BuildingInfo | null },
  ): Promise<PhotoEstimateResponse> =>
    apiFetch(`/photo-estimate/projects/${encodeURIComponent(projectId)}/analyze`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  analyzeQuantityTakeoff: (
    projectId: string,
    data: {
      drawings: QuantityTakeoffDrawing[];
      options?: QuantityTakeoffOptions;
      building_info?: BuildingInfo | null;
    },
  ): Promise<QuantityTakeoffResponse> =>
    apiFetch(`/quantity-takeoff/projects/${encodeURIComponent(projectId)}/analyze`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  importRoomScan: (
    projectId: string,
    data: {
      scans: RoomScanUpload[];
      options?: RoomScanOptions;
      building_info?: BuildingInfo | null;
    },
  ): Promise<RoomScanResponse> =>
    apiFetch(`/room-scan/projects/${encodeURIComponent(projectId)}/import`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  exportBOMCsv: async (projectId: string, projectName: string) => {
    const t = getToken();
    const res = await fetch(`${API_URL}/bom/export/${projectId}?format=csv`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      throw new ApiError(
        ERROR_MESSAGES[res.status] || `Virhe ${res.status} / Error ${res.status}`,
        res.status,
        res.statusText
      );
    }
    const blob = await res.blob();
    downloadBlob(blob, `helscoop_${projectName.replace(/\s+/g, '_')}.csv`);
  },
  exportIFC: async (projectId: string, projectName: string) => {
    const t = getToken();
    const res = await fetch(`${API_URL}/ifc-export/generate?projectId=${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      throw new ApiError(
        ERROR_MESSAGES[res.status] || `Virhe ${res.status} / Error ${res.status}`,
        res.status,
        res.statusText
      );
    }
    const blob = await res.blob();
    downloadBlob(blob, `helscoop_permit_${projectName.replace(/\s+/g, '_')}.ifc`);
  },
  getIFC: async (projectId: string): Promise<string> => {
    const t = getToken();
    const res = await fetch(`${API_URL}/ifc-export/generate?projectId=${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      throw new ApiError(
        ERROR_MESSAGES[res.status] || `Virhe ${res.status} / Error ${res.status}`,
        res.status,
        res.statusText
      );
    }
    return res.text();
  },
  exportPermitPack: async (projectId: string, projectName: string) => {
    const t = getToken();
    const res = await fetch(`${API_URL}/permit-pack/projects/${encodeURIComponent(projectId)}/export`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      throw new ApiError(
        ERROR_MESSAGES[res.status] || `Virhe ${res.status} / Error ${res.status}`,
        res.status,
        res.statusText
      );
    }
    const blob = await res.blob();
    downloadBlob(blob, `helscoop_permit_pack_${projectName.replace(/\s+/g, '_')}.zip`);
  },
  exportPdf: async (projectId: string, projectName: string, lang: string) => {
    const t = getToken();
    const res = await fetch(`${API_URL}/projects/${projectId}/pdf?lang=${lang}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      throw new ApiError(
        ERROR_MESSAGES[res.status] || `Virhe ${res.status} / Error ${res.status}`,
        res.status,
        res.statusText
      );
    }
    const blob = await res.blob();
    downloadBlob(blob, `helscoop_${projectName.replace(/\s+/g, '_')}.pdf`);
  },
  saveBOM: (
    projectId: string,
    items: { material_id: string; quantity: number; unit: string }[],
    collaborationClientId?: string | null,
  ) =>
    apiFetch(`/projects/${projectId}/bom`, {
      method: "PUT",
      body: JSON.stringify(collaborationClientId ? { items, collaboration_client_id: collaborationClientId } : { items }),
    }),
  substituteBomMaterial: (
    projectId: string,
    data: { from_material_id: string; to_material_id: string },
  ): Promise<BomSubstitutionResponse> =>
    apiFetch(`/projects/${encodeURIComponent(projectId)}/bom/substitute`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  submitQuoteRequest: (projectId: string, data: QuoteRequestPayload) =>
    apiFetch(`/projects/${projectId}/quote-request`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getProjectImages: (projectId: string): Promise<ProjectImagesResponse> =>
    apiFetch(`/projects/${encodeURIComponent(projectId)}/images`),
  uploadProjectImage: (
    projectId: string,
    file: File,
    options?: { onProgress?: (progress: number) => void; signal?: AbortSignal },
  ): Promise<{ image: ProjectImage }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("image", file);

      xhr.open("POST", `${API_URL}/projects/${encodeURIComponent(projectId)}/images`);
      const t = getToken();
      if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && options?.onProgress) {
          options.onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          parsed = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as { image: ProjectImage });
          return;
        }
        const body = parsed as { error?: string; message?: string } | null;
        reject(new ApiError(body?.error || body?.message || ERROR_MESSAGES[xhr.status] || "Upload failed", xhr.status, xhr.statusText));
      };
      xhr.onerror = () => reject(new ApiError("Upload failed", xhr.status || 0, xhr.statusText || "Network error"));
      xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

      options?.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(formData);
    }),
  getProjectImageAsset: async (url: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}${url}`, { headers: authHeaders() });
    if (!res.ok) {
      throw new ApiError(ERROR_MESSAGES[res.status] || `Error ${res.status}`, res.status, res.statusText);
    }
    return res.blob();
  },
  deleteProjectImage: (projectId: string, imageId: string): Promise<{ ok: boolean }> =>
    apiFetch(`/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`, { method: "DELETE" }),
  getProLeads: (params?: { status?: ProLeadStatus; limit?: number }): Promise<ProLeadResponse> => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.limit) search.set("limit", String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiFetch(`/pro/leads${suffix}`);
  },
  updateProLeadStatus: (leadId: string, status: ProLeadStatus) =>
    apiFetch(`/pro/leads/${encodeURIComponent(leadId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  shareProject: (projectId: string) =>
    apiFetch(`/projects/${projectId}/share`, { method: "POST" }),
  saveSharePreview: (projectId: string, sharePreview: SharePreviewState): Promise<{
    share_preview: SharePreviewState;
    share_token: string;
    share_token_expires_at: string | null;
  }> =>
    apiFetch(`/projects/${projectId}/share-preview`, {
      method: "PUT",
      body: JSON.stringify({ share_preview: sharePreview }),
    }),
  unshareProject: (projectId: string) =>
    apiFetch(`/projects/${projectId}/share`, { method: "DELETE" }),
  getSharedProject: (token: string) =>
    apiFetch(`/shared/${token}`),
  createSharedComment: (token: string, data: { name: string; message: string }) =>
    apiFetch(`/shared/${encodeURIComponent(token)}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  chat: (
    messages: { role: string; content: string }[],
    currentScene: string,
    context?: {
      bomSummary?: { material: string; qty: number; unit: string; total: number }[];
      substitutionSuggestions?: {
        material: string;
        materialId: string;
        substitute?: string;
        substituteId?: string;
        savings?: number;
        savingsPercent?: number;
        reason?: string;
        stockLevel?: string | null;
      }[];
      buildingInfo?: {
        address?: string;
        type?: string;
        year_built?: number;
        area_m2?: number;
        floors?: number;
        material?: string;
        heating?: string;
        confidence?: string;
        data_sources?: string[];
        climate_zone?: string;
        heating_degree_days?: number;
        data_source_error?: string;
      };
      projectInfo?: { name?: string; description?: string };
      renovationRoiSummary?: string;
      projectId?: string;
    },
  ) =>
    apiFetch("/chat", {
      method: "POST",
      body: JSON.stringify({
        messages,
        currentScene,
        bomSummary: context?.bomSummary,
        substitutionSuggestions: context?.substitutionSuggestions,
        buildingInfo: context?.buildingInfo,
        projectInfo: context?.projectInfo,
        renovationRoiSummary: context?.renovationRoiSummary,
        projectId: context?.projectId,
      }),
    }),

  getBuilding: (address: string) =>
    apiFetch(`/building?address=${encodeURIComponent(address)}`),
  getTerrain: (bbox: [number, number, number, number], crs: "3067" | "4326" = "3067"): Promise<TerrainGrid> =>
    apiFetch(`/terrain?bbox=${bbox.join(",")}&crs=${crs}`),

  // Entitlements
  getEntitlements: () => apiFetch("/entitlements"),
  getEntitlementUsage: () => apiFetch("/entitlements/usage"),
  getPlans: () => apiFetch("/entitlements/plans"),
  createCreditCheckout: (packId: string, simulate = false) =>
    apiFetch("/entitlements/credits/checkout", {
      method: "POST",
      body: JSON.stringify({ packId, simulate }),
    }),
  setAdminOverride: (userId: string, feature: string, allow: boolean) =>
    apiFetch("/entitlements/admin/override", {
      method: "POST",
      body: JSON.stringify({ userId, feature, allow }),
    }),
};
