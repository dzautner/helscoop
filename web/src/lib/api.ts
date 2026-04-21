import type { EnergySubsidyRequest, KeskoProduct, RyhtiPermitMetadata } from "@/types";

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
  403: "Ei kayttooikeutta / Access denied",
  404: "Ei loytynyt / Not found",
  409: "Ristiriita / Conflict",
  422: "Virheelliset tiedot / Validation failed",
  429: "Liian monta pyyntoa / Too many requests",
  500: "Palvelinvirhe / Server error",
};

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
  me: () => apiFetch("/auth/me"),
  updateProfile: (data: { name?: string; email?: string }) =>
    apiFetch("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
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
  createProject: (data: { name: string; description?: string; scene_js?: string; building_info?: Record<string, unknown> }) =>
    apiFetch("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    apiFetch(`/projects/${id}`, { method: "DELETE" }),
  getTrashProjects: () => apiFetch("/projects/trash"),
  restoreProject: (id: string) =>
    apiFetch(`/projects/${id}/restore`, { method: "POST" }),
  permanentDeleteProject: (id: string) =>
    apiFetch(`/projects/${id}/permanent`, { method: "DELETE" }),
  duplicateProject: (id: string) =>
    apiFetch(`/projects/${id}/duplicate`, { method: "POST" }),
  saveThumbnail: (id: string, thumbnail: string) =>
    apiFetch(`/projects/${id}/thumbnail`, {
      method: "PUT",
      body: JSON.stringify({ thumbnail }),
    }),

  getMaterials: () => apiFetch("/materials"),
  getMaterial: (id: string) => apiFetch(`/materials/${id}`),
  getMaterialPrices: (id: string) => apiFetch(`/materials/${id}/prices`),

  getSuppliers: () => apiFetch("/suppliers"),
  getSupplier: (id: string) => apiFetch(`/suppliers/${id}`),

  comparePrices: (materialId: string) =>
    apiFetch(`/pricing/compare/${materialId}`),
  getStock: (materialId: string) =>
    apiFetch(`/pricing/stock/${materialId}`),
  getPriceHistory: (materialId: string) =>
    apiFetch(`/pricing/history/${materialId}`),
  getStalePrices: () => apiFetch("/pricing/stale"),
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

  getCategories: () => apiFetch("/categories"),
  getTemplates: () => apiFetch("/templates"),
  exportBOM: (projectId: string) => apiFetch(`/bom/export/${projectId}`),
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `helscoop_${projectName.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `helscoop_permit_${projectName.replace(/\s+/g, '_')}.ifc`;
    a.click();
    URL.revokeObjectURL(url);
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `helscoop_${projectName.replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },
  saveBOM: (projectId: string, items: { material_id: string; quantity: number; unit: string }[]) =>
    apiFetch(`/projects/${projectId}/bom`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),

  shareProject: (projectId: string) =>
    apiFetch(`/projects/${projectId}/share`, { method: "POST" }),
  unshareProject: (projectId: string) =>
    apiFetch(`/projects/${projectId}/share`, { method: "DELETE" }),
  getSharedProject: (token: string) =>
    apiFetch(`/shared/${token}`),

  chat: (
    messages: { role: string; content: string }[],
    currentScene: string,
    context?: {
      bomSummary?: { material: string; qty: number; unit: string; total: number }[];
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
    },
  ) =>
    apiFetch("/chat", {
      method: "POST",
      body: JSON.stringify({
        messages,
        currentScene,
        bomSummary: context?.bomSummary,
        buildingInfo: context?.buildingInfo,
        projectInfo: context?.projectInfo,
      }),
    }),

  getBuilding: (address: string) =>
    apiFetch(`/building?address=${encodeURIComponent(address)}`),

  // Entitlements
  getEntitlements: () => apiFetch("/entitlements"),
  getEntitlementUsage: () => apiFetch("/entitlements/usage"),
  getPlans: () => apiFetch("/entitlements/plans"),
  setAdminOverride: (userId: string, feature: string, allow: boolean) =>
    apiFetch("/entitlements/admin/override", {
      method: "POST",
      body: JSON.stringify({ userId, feature, allow }),
    }),
};
