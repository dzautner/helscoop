export interface BuildingInfo {
  address?: string;
  postal_code?: string;
  postalCode?: string;
  postinumero?: string;
  city?: string;
  municipality?: string;
  region?: string;
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
  ground_elevation_m?: number;
  terrain_source?: string;
  terrain_accuracy_m?: number;
}

export type ProjectType = "omakotitalo" | "taloyhtio";

export interface ShareholderShare {
  apartment: string;
  owner_name?: string | null;
  share_pct: number;
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
  original_scene_js?: string | null;
  display_scale?: number;
  thumbnail_url?: string | null;
  is_public?: boolean;
  published_at?: string | null;
  gallery_status?: "pending" | "approved" | "rejected";
  gallery_like_count?: number;
  gallery_clone_count?: number;
  heart_count?: number;
  clone_count?: number;
  owner_name?: string | null;
  region?: string | null;
  postal_code_area?: string | null;
  cost_band?: GalleryCostRange;
  material_highlights?: string[];
  building_info?: BuildingInfo | null;
  mood_board?: MoodBoardState | null;
  permit_metadata?: RyhtiPermitMetadata | null;
  photo_overlay?: PhotoOverlayState | null;
  share_token?: string | null;
  share_token_expires_at?: string | null;
  view_count?: number;
  contractor_comment_count?: number;
  household_deduction_joint?: boolean;
  project_type?: ProjectType;
  unit_count?: number | null;
  business_id?: string | null;
  property_manager_name?: string | null;
  property_manager_email?: string | null;
  property_manager_phone?: string | null;
  shareholder_shares?: ShareholderShare[];
  tags?: string[];
  status?: ProjectStatus;
  bom?: BomItem[];
  comments?: SharedProjectComment[];
  param_presets?: ParamPreset[];
}

export type GalleryCostRange = "under-5k" | "5k-15k" | "15k-50k" | "50k-plus";

export interface GalleryProject {
  id: string;
  name: string;
  description?: string | null;
  thumbnail_url?: string | null;
  share_token?: string | null;
  is_public: boolean;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  project_type?: ProjectType;
  owner_name?: string | null;
  region?: string | null;
  postal_code_area?: string | null;
  estimated_cost: number;
  cost_band?: GalleryCostRange;
  material_highlights: string[];
  view_count: number;
  heart_count: number;
  clone_count: number;
}

export interface NeighborhoodInsightMaterial {
  name: string;
  project_count: number;
  share_pct: number;
}

export interface NeighborhoodInsightType {
  type: string;
  count: number;
}

export interface NeighborhoodInsightsResponse {
  postal_code_area: string;
  project_type?: ProjectType | null;
  project_count: number;
  projects_this_year: number;
  average_cost: number;
  renovation_types: NeighborhoodInsightType[];
  popular_materials: NeighborhoodInsightMaterial[];
  similar_projects: GalleryProject[];
}

export interface PhotoOverlayState {
  data_url: string;
  file_name?: string | null;
  opacity: number;
  compare_mode: boolean;
  compare_position: number;
  offset_x: number;
  offset_y: number;
  scale: number;
  rotation: number;
  updated_at?: string;
}

export type MoodBoardItemType = "material" | "photo" | "color" | "note";

export interface MoodBoardBaseItem {
  id: string;
  type: MoodBoardItemType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  title?: string;
}

export interface MoodBoardMaterialItem extends MoodBoardBaseItem {
  type: "material";
  material_id: string;
}

export interface MoodBoardPhotoItem extends MoodBoardBaseItem {
  type: "photo";
  src: string;
  file_name?: string;
}

export interface MoodBoardColorItem extends MoodBoardBaseItem {
  type: "color";
  color: string;
}

export interface MoodBoardNoteItem extends MoodBoardBaseItem {
  type: "note";
  text: string;
}

export type MoodBoardItem =
  | MoodBoardMaterialItem
  | MoodBoardPhotoItem
  | MoodBoardColorItem
  | MoodBoardNoteItem;

export interface MoodBoardState {
  items: MoodBoardItem[];
  updated_at?: string;
}

export interface SharedProjectComment {
  id: string;
  commenter_name: string;
  message: string;
  created_at: string;
}

export interface ParamPreset {
  name: string;
  values: Record<string, number>;
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

export interface QuantityTakeoffDrawing {
  name: string;
  mime_type: string;
  size?: number;
  data_url?: string;
}

export interface QuantityTakeoffOptions {
  drawing_type?: "floor_plan" | "elevation" | "mixed";
  floor_label?: string;
  notes?: string;
  scale_text?: string;
  width_m?: number | null;
  depth_m?: number | null;
  area_m2?: number | null;
}

export interface QuantityTakeoffBomSuggestion {
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

export interface QuantityTakeoffRoom {
  id: string;
  name: string;
  type: "entry" | "living" | "kitchen" | "bedroom" | "bath" | "sauna" | "utility";
  x: number;
  z: number;
  width_m: number;
  depth_m: number;
  area_m2: number;
  confidence: number;
}

export interface QuantityTakeoffResponse {
  project_id: string;
  project_name: string;
  analysis_mode: "catalog_heuristic" | "catalog_heuristic_ai_ready";
  drawings_analyzed: number;
  source_files: { name: string; mime_type: string; size: number | null }[];
  drawing_context: {
    drawing_type: "floor_plan" | "elevation" | "mixed";
    floor_label: string;
    scale_text: string | null;
    scale_source: "user_dimensions" | "user_area" | "building_area" | "scale_hint" | "fallback";
    width_m: number;
    depth_m: number;
    floor_area_m2: number;
    room_count: number;
    door_count: number;
    window_count: number;
  };
  detected_quantities: {
    width_m: number;
    depth_m: number;
    floor_area_m2: number;
    exterior_wall_lm: number;
    partition_wall_lm: number;
    exterior_wall_area_m2: number;
    interior_wall_board_m2: number;
    ceiling_area_m2: number;
    wet_room_area_m2: number;
    door_count: number;
    window_count: number;
  };
  rooms: QuantityTakeoffRoom[];
  estimate: {
    materials_total: number;
    non_catalog_allowance: number;
    low: number;
    mid: number;
    high: number;
  };
  bom_suggestions: QuantityTakeoffBomSuggestion[];
  assumptions: string[];
  disclaimer: string;
  credits?: { cost: number; balance: number };
}

export interface RoomScanUpload {
  name: string;
  mime_type: string;
  size?: number;
  data_url?: string;
}

export interface RoomScanOptions {
  floor_label?: string;
  notes?: string;
  width_m?: number | null;
  depth_m?: number | null;
  area_m2?: number | null;
}

export interface RoomScanRoom {
  id: string;
  name: string;
  type: "entry" | "living" | "kitchen" | "bedroom" | "bath" | "sauna" | "utility" | "unknown";
  x: number;
  z: number;
  width_m: number;
  depth_m: number;
  area_m2: number;
  confidence: number;
}

export interface RoomScanWall {
  id: string;
  start: [number, number];
  end: [number, number];
  length_m: number;
  height_m: number;
  thickness_m: number;
  confidence: number;
}

export interface RoomScanOpening {
  id: string;
  type: "door" | "window";
  wall_id: string | null;
  x: number;
  z: number;
  width_m: number;
  height_m: number;
  confidence: number;
}

export interface RoomScanBomSuggestion {
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

export interface RoomScanResponse {
  project_id: string;
  project_name: string;
  analysis_mode: "roomplan_import" | "roomplan_import_ai_ready";
  source_format: "usdz" | "usd" | "usda" | "usdc" | "json" | "unknown";
  source_detail: string;
  source_files: { name: string; mime_type: string; size: number | null }[];
  floor_label: string;
  width_m: number;
  depth_m: number;
  floor_area_m2: number;
  rooms: RoomScanRoom[];
  walls: RoomScanWall[];
  openings: RoomScanOpening[];
  surfaces: {
    floor_area_m2: number;
    ceiling_area_m2: number;
    wall_area_m2: number;
    wet_room_area_m2: number;
    opening_count: number;
  };
  quality: {
    coverage_percent: number;
    detected_feature_count: number;
    parser: "roomplan_text" | "json" | "fallback";
    warnings: string[];
  };
  scene_js: string;
  estimate: {
    materials_total: number;
    non_catalog_allowance: number;
    low: number;
    mid: number;
    high: number;
  };
  bom_suggestions: RoomScanBomSuggestion[];
  assumptions: string[];
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
    ground_elevation_m?: number;
    terrain_source?: string;
    terrain_accuracy_m?: number;
  };
  confidence: "verified" | "estimated" | "template" | "manual";
  data_sources: string[];
  climate_zone?: string;
  heating_degree_days?: number;
  data_source_error?: string;
  terrain?: TerrainFootprintSample;
  scene_js: string;
  bom_suggestion: { material_id: string; quantity: number; unit: string }[];
}

export interface TerrainPoint {
  lat: number;
  lon: number;
  x: number;
  y: number;
  elevation_m: number;
}

export interface TerrainGrid {
  crs: "EPSG:3067" | "EPSG:4326";
  bbox: [number, number, number, number];
  source: string;
  resolution_m: number;
  accuracy_m: number;
  rows: number;
  cols: number;
  base_elevation_m: number;
  average_elevation_m: number;
  min_elevation_m: number;
  max_elevation_m: number;
  points: TerrainPoint[];
}

export interface TerrainFootprintSample {
  center: { lat: number; lon: number; x: number; y: number };
  source: string;
  resolutionM: number;
  accuracyM: number;
  baseElevationM: number;
  averageElevationM: number;
  minElevationM: number;
  maxElevationM: number;
  localReliefM: number;
  points: TerrainPoint[];
}

export interface Template {
  id: string;
  name: string;
  name_fi?: string | null;
  name_en?: string | null;
  description: string;
  description_fi?: string | null;
  description_en?: string | null;
  category?: "sauna" | "garage" | "shed" | "terrace" | "other" | string;
  icon?: string | null;
  thumbnail_url?: string | null;
  estimated_cost: number | null;
  difficulty?: "beginner" | "intermediate" | "advanced" | string;
  area_m2?: number | null;
  is_featured?: boolean;
  is_community?: boolean;
  author_id?: string | null;
  author_name?: string | null;
  use_count?: number;
  created_at?: string;
  updated_at?: string;
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
    supplier_id?: string;
    unit_price: number;
    regular_unit_price?: number | null;
    campaign_label?: string | null;
    campaign_ends_at?: string | null;
    campaign_detected_at?: string | null;
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
  regular_unit_price?: number | null;
  regular_total?: number | null;
  campaign_savings?: number | null;
  campaign_label?: string | null;
  campaign_ends_at?: string | null;
  campaign_detected_at?: string | null;
  supplier_id?: string | null;
  supplier_name?: string;
  total?: number;
  supplier?: string;
  link?: string | null;
  in_stock?: boolean | null;
  stock_level?: StockLevel | null;
  store_location?: string | null;
  stock_last_checked_at?: string | null;
  note?: string;
  manual_override?: boolean;
  geometry_driven?: boolean;
}

export interface MarketplaceOrderLine {
  id: string;
  material_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  link: string | null;
  stock_level: StockLevel;
}

export interface MarketplaceOrder {
  id: string;
  project_id: string;
  user_id: string;
  supplier_id: string | null;
  supplier_name: string;
  partner_id: string | null;
  partner_name: string | null;
  status: "draft" | "opened" | "ordered" | "confirmed" | "cancelled";
  currency: string;
  subtotal: number;
  estimated_commission_rate: number;
  estimated_commission_amount: number;
  checkout_url: string | null;
  external_order_ref: string | null;
  created_at: string;
  updated_at: string;
  opened_at?: string | null;
  ordered_at?: string | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
  lines: MarketplaceOrderLine[];
}

export interface MarketplaceSupplierCheckoutLineInput {
  material_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  link?: string | null;
  stock_level?: StockLevel | null;
}

export interface MarketplaceSupplierCheckoutInput {
  supplier_id?: string | null;
  supplier_name: string;
  subtotal: number;
  currency?: string;
  checkout_url?: string | null;
  items: MarketplaceSupplierCheckoutLineInput[];
}

export interface MarketplaceCheckoutResponse {
  orders: MarketplaceOrder[];
}

export interface MarketplaceOpenOrderResponse {
  checkout_url: string | null;
  click_count: number;
  order: MarketplaceOrder | null;
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

export interface ProjectImage {
  id: string;
  project_id: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  uploaded_at: string;
  urls: {
    original: string;
    thumb_200: string;
    thumb_800: string;
  };
}

export interface ProjectImagesResponse {
  images: ProjectImage[];
}

export type ProLeadStatus = "submitted" | "forwarded" | "closed";

export interface ProLead {
  id: string;
  project_id: string;
  project_name: string;
  project_description: string | null;
  project_type: ProjectType | string | null;
  unit_count: number | null;
  building_info: BuildingInfo | null;
  homeowner_name: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  postcode: string;
  work_scope: string;
  bom_line_count: number;
  estimated_cost: number;
  partner_channel: string;
  matched_contractor_count: number;
  status: ProLeadStatus;
  created_at: string;
}

export interface ProLeadSummary {
  lead_count: number;
  open_count: number;
  forwarded_count: number;
  closed_count: number;
  total_estimated_cost: number;
  average_estimated_cost: number;
}

export interface ProTier {
  id: "free" | "pro" | "growth";
  name: string;
  monthly_price_eur: number;
  lead_limit: number;
}

export interface ProLeadResponse {
  leads: ProLead[];
  summary: ProLeadSummary;
  tiers: ProTier[];
}

export interface PriceRow {
  id: string;
  material_id: string;
  supplier_id: string;
  unit: string;
  unit_price: string;
  regular_unit_price?: string | null;
  campaign_label?: string | null;
  campaign_ends_at?: string | null;
  campaign_detected_at?: string | null;
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
  regularUnitPrice: number | null;
  priceText: string | null;
  regularPriceText: string | null;
  campaignLabel: string | null;
  campaignEndsAt: string | null;
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

export type RenovationCostUnit = "m2" | "m" | "unit" | "project";
export type RenovationCostSourceStatus = "live" | "fallback";

export interface RenovationCostSource {
  name: "Tilastokeskus";
  statistic: "Rakennuskustannusindeksi";
  attribution: string;
  tableId: string;
  apiUrl: string;
  url: string;
  status: RenovationCostSourceStatus;
  latestPeriod: string;
  updatedAt: string | null;
  error?: string;
}

export interface RenovationCostCategory {
  id: string;
  labelFi: string;
  labelEn: string;
  unit: RenovationCostUnit;
  baseCostExVat: number;
  materialShare: number;
  labourShare: number;
  serviceShare: number;
  notes: string;
  statfinMultiplier: number;
  currentCostExVat: number;
  currentCostInclVat: number;
}

export interface RenovationCostIndexResponse {
  generatedAt: string;
  source: RenovationCostSource;
  cache: {
    hit: boolean;
    ttlHours: number;
    expiresAt: string;
  };
  vatRate: number;
  baseYear: string;
  index: {
    period: string;
    updatedAt: string | null;
    baseYear: string;
    values: {
      total: number;
      labour: number;
      materials: number;
      services: number;
    };
    multipliers: {
      total: number;
      labour: number;
      materials: number;
      services: number;
    };
  };
  categories: RenovationCostCategory[];
}

export interface RenovationCostEstimateRequest {
  categoryId: string;
  quantity: number;
}

export interface RenovationCostEstimateResponse {
  generatedAt: string;
  category: RenovationCostCategory;
  quantity: number;
  unit: RenovationCostUnit;
  subtotalExVat: number;
  vatRate: number;
  vatAmount: number;
  totalInclVat: number;
  formula: string;
  source: RenovationCostSource;
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
