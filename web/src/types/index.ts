export interface BuildingInfo {
  address?: string;
  type?: string;
  year_built?: number;
  material?: string;
  floors?: number;
  area_m2?: number;
  heating?: string;
  roof_type?: string;
  roof_material?: string;
  units?: number;
  confidence?: string;
  data_sources?: string[];
  climate_zone?: string;
  heating_degree_days?: number;
  data_source_error?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  estimated_cost: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  scene_js?: string | null;
  display_scale?: number;
  thumbnail_url?: string | null;
  building_info?: BuildingInfo | null;
  permit_metadata?: RyhtiPermitMetadata | null;
  share_token?: string | null;
  view_count?: number;
  household_deduction_joint?: boolean;
  tags?: string[];
  status?: ProjectStatus;
  bom?: BomItem[];
}

export type ProjectStatus = "planning" | "in_progress" | "completed" | "archived";

export interface ProjectVersionSnapshot {
  name: string;
  description: string;
  scene_js: string;
  bom: { material_id: string; quantity: number; unit: string }[];
}

export interface ProjectBranch {
  id: string;
  project_id: string;
  name: string;
  forked_from_version_id: string | null;
  is_default: boolean;
  created_at: string;
}

export interface ProjectVersion {
  id: string;
  project_id: string;
  branch_id: string | null;
  parent_version_id: string | null;
  restored_from_version_id: string | null;
  name: string | null;
  description: string | null;
  event_type: "auto" | "named" | "restore" | "branch";
  delta: {
    changedFields?: string[];
    bom?: {
      added?: number;
      removed?: number;
      quantityChanged?: number;
      unitChanged?: number;
    };
  };
  thumbnail_url: string | null;
  created_at: string;
}

export interface ProjectVersionsResponse {
  branches: ProjectBranch[];
  versions: ProjectVersion[];
}

export interface ProjectVersionCompareResponse {
  base: { id: string; name: string | null; created_at: string; estimated_cost: number };
  target: { id: string; name: string | null; created_at: string; estimated_cost: number };
  delta: ProjectVersion["delta"];
  cost_delta: number;
}

export interface BomAggregateProject {
  id: string;
  name: string;
  estimated_cost: number;
  bom_rows: number;
  area_m2: number | null;
  cost_per_m2: number | null;
}

export interface BomAggregateBreakdown {
  project_id: string;
  project_name: string;
  quantity: number;
  total: number;
}

export interface BomAggregateItem {
  material_id: string;
  material_name: string;
  category_name: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  supplier_name: string | null;
  total: number;
  project_breakdown: BomAggregateBreakdown[];
  source_project_count: number;
  bulk_discount: {
    eligible: boolean;
    threshold: number;
    estimated_savings_pct: number;
    estimated_savings_eur: number;
    note: string;
  } | null;
}

export interface BomAggregateResponse {
  project_ids: string[];
  project_count: number;
  item_count: number;
  total_cost: number;
  bulk_opportunity_count: number;
  projects: BomAggregateProject[];
  items: BomAggregateItem[];
}

export interface PhotoEstimateUpload {
  name: string;
  mime_type: string;
  size?: number;
  data_url?: string;
}

export interface PhotoEstimateBomSuggestion {
  material_id: string;
  material_name: string;
  category_name: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  supplier: string | null;
  link: string | null;
  confidence: number;
  note: string;
}

export interface PhotoEstimateScope {
  scope: "roof" | "facade" | "windows" | "insulation" | "heating" | "terrace";
  confidence: number;
  rationale: string;
  quantity: number;
  unit: string;
  low_cost: number;
  mid_cost: number;
  high_cost: number;
  non_catalog_cost: number;
  bom_suggestions: PhotoEstimateBomSuggestion[];
}

export interface PhotoEstimateResponse {
  project_id: string;
  project_name: string;
  analysis_mode: "catalog_heuristic" | "catalog_heuristic_ai_ready";
  photos_analyzed: number;
  building_context: {
    area_m2: number | null;
    year_built: number | null;
    floors: number | null;
    heating: string | null;
    roof_type: string | null;
  };
  estimate: { low: number; mid: number; high: number };
  scopes: PhotoEstimateScope[];
  subsidy_flags: { id: string; label: string; reason: string }[];
  disclaimer: string;
  credits?: { cost: number; balance: number };
}

export interface BuildingResult {
  address: string;
  coordinates: { lat: number; lon: number };
  building_info: {
    type: string;
    year_built: number;
    material: string;
    floors: number;
    area_m2: number;
    heating: string;
    roof_type?: string;
    roof_material?: string;
    units?: number;
  };
  confidence: "verified" | "estimated" | "template" | "manual";
  data_sources: string[];
  climate_zone?: string;
  heating_degree_days?: number;
  data_source_error?: string;
  scene_js: string;
  bom_suggestion: { material_id: string; quantity: number; unit: string }[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimated_cost: number;
  scene_js: string;
  bom: { material_id: string; quantity: number; unit: string }[];
}

export interface SupplierSku {
  supplier: string;
  sku: string;
  ean?: string;
  url?: string;
}

export type VatClass = 'standard' | 'reduced' | 'zero';
export type StockLevel = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export interface Material {
  id: string;
  name: string;
  name_fi: string | null;
  name_en: string | null;
  category_name: string;
  category_name_fi: string | null;
  image_url: string | null;
  pricing: {
    unit_price: number;
    unit: string;
    supplier_name: string;
    link?: string | null;
    is_primary: boolean;
    in_stock?: boolean | null;
    stock_level?: StockLevel | null;
    store_location?: string | null;
    last_checked_at?: string | null;
  }[] | null;
  /** How many design_units fit in one purchasable_unit (e.g. 1 pack = 1.8 m2) */
  conversion_factor?: number;
  /** Number of items in one purchasable pack */
  pack_size?: number;
  /** Unit retailers sell (e.g. "pack", "roll", "pallet") */
  purchasable_unit?: string;
  /** Unit used in design/BOM calculations (e.g. "m2", "jm", "kpl") */
  design_unit?: string;
  /** Finnish VAT rate class: standard (25.5%), reduced (14%), zero (0%) */
  vat_class?: VatClass;
  /** Retailer-specific SKU/EAN mappings */
  supplier_skus?: SupplierSku[];
  /** Grouping key for interchangeable materials */
  substitution_group?: string;
  /** ISO date string of last catalog update */
  last_updated?: string | null;
  /** Optional DB/catalog visual colour as RGB values from 0-1 */
  visual_albedo?: number[] | null;
  /** Optional thermal conductivity in W/mK */
  thermal_conductivity?: number | string | null;
  /** Optional material thickness in millimetres */
  thermal_thickness?: number | string | null;
  /** Optional Euroclass/reaction-to-fire value */
  fire_rating?: string | null;
  /** Optional structural grade, e.g. C24 */
  structural_grade_class?: string | null;
  /** Search/filter tags from the material catalog */
  tags?: string[] | null;
}

export interface BomItem {
  id?: string;
  material_id: string;
  material_name?: string;
  category_name?: string;
  image_url?: string | null;
  quantity: number;
  unit: string;
  unit_price?: number;
  total?: number;
  supplier?: string;
  link?: string | null;
  in_stock?: boolean | null;
  stock_level?: StockLevel | null;
  store_location?: string | null;
  stock_last_checked_at?: string | null;
  note?: string;
}

export interface QuoteRequestPayload {
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  postcode: string;
  work_scope: string;
  locale?: "fi" | "en" | "sv";
}

export interface QuoteRequestResponse {
  id: string;
  status: "submitted" | "forwarded" | "closed";
  created_at: string;
  email_sent: boolean;
  bom_line_count: number;
  estimated_cost: number;
  matched_contractor_count: number;
}

export interface PriceRow {
  id: string;
  material_id: string;
  supplier_id: string;
  unit: string;
  unit_price: string;
  currency: string;
  sku: string | null;
  ean: string | null;
  link: string | null;
  is_primary: boolean;
  in_stock?: boolean | null;
  stock_level?: StockLevel | null;
  store_location?: string | null;
  last_checked_at?: string | null;
  last_scraped_at: string | null;
  last_verified_at: string | null;
  supplier_name: string;
  supplier_url: string;
  supplier_logo: string | null;
}

export interface MaterialPriceData {
  material_id: string;
  material_name: string;
  prices: PriceRow[];
  cheapest_price: number | null;
  primary_price: number | null;
  savings_per_unit: number;
}

export interface MaterialSubstitutionSuggestion {
  material_id: string;
  material_name: string;
  category_name: string | null;
  substitution_type: "equivalent" | "alternative" | "upgrade" | "budget";
  confidence: "verified" | "suggested";
  notes: string | null;
  unit_price: number | null;
  unit: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  link: string | null;
  stock_level: StockLevel;
  savings_per_unit: number;
  savings_percent: number;
  trigger_reasons: string[];
}

export interface MaterialSubstitutionResponse {
  material_id: string;
  material_name: string;
  current: {
    unit_price: number | null;
    previous_unit_price: number | null;
    stock_level: StockLevel;
  };
  suggestions: MaterialSubstitutionSuggestion[];
}

export interface AdminStalePrice {
  material_id?: string;
  material_name: string;
  supplier_id: string;
  supplier_name: string;
  unit_price: number;
  last_scraped_at: string | null;
  days_stale: number | null;
}

export interface AdminStats {
  api_health: {
    status: string;
    uptime_seconds: number;
    checked_at: string;
  };
  users_total: number;
  user_count: number;
  users_new_30d: number;
  users_active_24h: number;
  users_active_7d: number;
  users_active_30d: number;
  projects_total: number;
  project_count: number;
  bom_total_value: number;
  price_freshness: {
    total: number;
    fresh: number;
    aging: number;
    stale: number;
    never: number;
    stale_percent: number;
    alert: boolean;
  };
  stale_prices: AdminStalePrice[];
  recent_projects: {
    id: string;
    name: string;
    source: "address" | "template" | "blank";
    created_at: string;
    updated_at: string;
  }[];
  recent_signups: {
    id: string;
    role: string;
    created_at: string;
  }[];
  role_distribution: Array<{ role: string; count: number }>;
}

export interface BomSubstitutionResponse {
  ok: boolean;
  from_material_id: string;
  to_material_id: string;
  item: BomItem | null;
  substitution: {
    substitution_type: MaterialSubstitutionSuggestion["substitution_type"];
    confidence: MaterialSubstitutionSuggestion["confidence"];
    notes: string | null;
  };
}

export interface KeskoProduct {
  id: string;
  materialId: string;
  name: string;
  ean: string | null;
  sku: string | null;
  unitPrice: number | null;
  priceText: string | null;
  currency: string;
  unit: string;
  imageUrl: string | null;
  productUrl: string | null;
  stockLevel: StockLevel;
  stockQuantity: number | null;
  storeName: string | null;
  storeLocation: string | null;
  categoryName: string | null;
  branchCode: string;
  lastCheckedAt: string;
}

export interface KeskoSearchResponse {
  configured: boolean;
  source: "live" | "cache" | "not_configured" | "error";
  branchCode: string;
  products: KeskoProduct[];
  cachedAt?: string;
  error?: string;
}

export interface KeskoImportResponse {
  material: Material;
  bom_item: BomItem;
}

export type EnergyHeatingType =
  | "oil"
  | "natural_gas"
  | "direct_electric"
  | "district_heat"
  | "ground_source_heat_pump"
  | "air_water_heat_pump"
  | "wood"
  | "other_non_fossil"
  | "fossil"
  | "unknown";

export type EnergyBuildingType = "omakotitalo" | "paritalo" | "rivitalo" | "kerrostalo" | "other" | "unknown";
export type EnergyApplicantAgeGroup = "under_65" | "65_plus" | "unknown";
export type EnergyHeatingSystemCondition = "ok" | "broken_or_end_of_life" | "hard_to_maintain" | "unknown";
export type EnergySubsidyStatus = "eligible" | "maybe" | "not_eligible";

export interface EnergySubsidyRequest {
  totalCost: number;
  currentHeating: EnergyHeatingType;
  targetHeating: EnergyHeatingType;
  buildingType: EnergyBuildingType;
  buildingYear?: number | null;
  yearRoundResidential: boolean;
  applicantAgeGroup: EnergyApplicantAgeGroup;
  applicantDisabled: boolean;
  heatingSystemCondition: EnergyHeatingSystemCondition;
}

export interface EnergySubsidyProgram {
  program: "ely_oil_gas_heating" | "ara_repair_elderly_disabled";
  name: string;
  status: EnergySubsidyStatus;
  amount: number;
  netCost: number;
  reasons: string[];
  warnings: string[];
  applicationDeadline?: string;
  applicationDeadlineAt?: string;
  completionDeadline?: string;
  deadline?: string;
  paymentDeadline?: string;
  applicationUrl: string;
  sourceUrl: string;
}

export interface EnergySubsidyResponse {
  totalCost: number;
  bestAmount: number;
  netCost: number;
  applicationDeadline: string;
  applicationDeadlineAt: string;
  daysUntilApplicationDeadline: number;
  completionDeadline: string;
  daysUntilCompletionDeadline: number;
  deadline: string;
  daysUntilDeadline: number;
  generatedAt: string;
  programs: EnergySubsidyProgram[];
  disclaimer: string;
}

export interface WasteCategoryEstimate {
  type: string;
  weightKg: number;
  volumeM3: number;
  recyclable: boolean;
  disposalCostEur: number;
}

export interface WasteSortingGuideEntry {
  wasteType: string;
  sortingInstruction_fi: string;
  sortingInstruction_en: string;
  acceptedAt: string;
}

export interface WasteEstimateResponse {
  totalWeightKg: number;
  totalVolumeM3: number;
  categories: WasteCategoryEstimate[];
  containerRecommendation: {
    size: string;
    count: number;
    totalCost: number;
  };
  sortingGuide: WasteSortingGuideEntry[];
  totalDisposalCost: number;
}

export interface RyhtiPermitMetadata {
  permanentPermitIdentifier?: string;
  permanentBuildingIdentifier?: string;
  municipalityNumber?: string;
  propertyIdentifier?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  descriptionOfAction?: string;
  constructionActionType?: string;
  buildingPermitApplicationType?: string;
  permitApplicationType?: string;
  grossAreaM2?: number;
  floorAreaM2?: number;
  volumeM3?: number;
  floors?: number;
  energyClass?: string;
  suomiFiAuthenticated?: boolean;
  authorityPartner?: string;
  authorityCaseId?: string;
  siteOwnerConsent?: boolean;
  applicantRole?: string;
}

export interface RyhtiValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  field?: string;
  message: string;
  action: string;
}

export interface RyhtiValidationResult {
  ready: boolean;
  generatedAt: string;
  mode: "dry_run" | "live";
  remoteConfigured: boolean;
  issues: RyhtiValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface RyhtiSubmission {
  id: string;
  project_id: string;
  mode: "dry_run" | "live";
  status: "draft" | "ready_for_authority" | "submitted" | "accepted" | "rejected" | "failed";
  permit_identifier?: string | null;
  ryhti_tracking_id?: string | null;
  validation?: unknown;
  response?: unknown;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RyhtiPackageResponse {
  package: unknown;
  validation: RyhtiValidationResult;
  permitMetadata: RyhtiPermitMetadata;
  latestSubmission?: RyhtiSubmission | null;
}

export interface Category {
  id: string;
  display_name: string;
  display_name_fi: string | null;
  sort_order: number;
  hidden: boolean;
}

export interface PriceHistoryRow {
  id: string;
  pricing_id: string;
  unit_price: string;
  scraped_at: string;
  source: string;
  supplier_name: string;
  supplier_id: string;
}

export type MaterialTrendDirection = "rising" | "falling" | "stable";
export type MaterialTrendRecommendation = "buy_now" | "wait" | "watch";
export type MaterialTrendConfidence = "high" | "medium" | "low";
export type MaterialTrendSource = "retailer_history" | "seasonal_model";

export interface MaterialTrendPoint {
  month: string;
  unitPrice: number;
  source: MaterialTrendSource;
}

export interface MaterialTrendItem {
  materialId: string;
  materialName: string;
  categoryName: string | null;
  quantity: number;
  unit: string;
  currentUnitPrice: number;
  currentLineCost: number;
  average3m: number | null;
  average12m: number | null;
  vs3mPct: number | null;
  vs12mPct: number | null;
  direction: MaterialTrendDirection;
  recommendation: MaterialTrendRecommendation;
  bestBuyMonth: string | null;
  estimatedWaitSavingsPct: number;
  estimatedWaitSavings: number;
  confidence: MaterialTrendConfidence;
  source: MaterialTrendSource;
  points: MaterialTrendPoint[];
}

export interface ProjectMaterialTrendResponse {
  projectId: string;
  generatedAt: string;
  dataSources: MaterialTrendSource[];
  totalCurrentCost: number;
  weightedVs12mPct: number | null;
  estimatedWaitSavings: number;
  bestBuyMonth: string | null;
  buyNowCount: number;
  waitCount: number;
  watchCount: number;
  items: MaterialTrendItem[];
}

export type PriceAlertEmailFrequency = "off" | "daily" | "weekly";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface PriceWatch {
  id: string;
  project_id: string;
  material_id: string;
  material_name?: string;
  project_name?: string;
  target_price: string | number | null;
  watch_any_decrease: boolean;
  notify_email: boolean;
  notify_push: boolean;
  last_notified_price: string | number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPriceChangeSummary {
  project_id: string;
  current_total: number;
  previous_total: number | null;
  delta: number;
  delta_percent: number;
  days_since_last_visit: number | null;
  show: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
