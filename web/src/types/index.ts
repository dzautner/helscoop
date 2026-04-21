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
  share_token?: string | null;
  bom?: BomItem[];
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
  confidence: "verified" | "estimated" | "template";
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
  deadline?: string;
  paymentDeadline?: string;
  applicationUrl: string;
  sourceUrl: string;
}

export interface EnergySubsidyResponse {
  totalCost: number;
  bestAmount: number;
  netCost: number;
  deadline: string;
  daysUntilDeadline: number;
  generatedAt: string;
  programs: EnergySubsidyProgram[];
  disclaimer: string;
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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
