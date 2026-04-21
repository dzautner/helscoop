/**
 * Waste generation factors for Finnish renovation projects.
 *
 * Maps material categories to waste classification per Finnish jatteen lajittelu,
 * recycling rates, disposal costs (Helsinki Sortti station pricing), and
 * container (vaihtolavat) size recommendations.
 *
 * References:
 *   - HSY Sortti-asemat hinnat 2024/2025
 *   - Ymparistoministerio: Rakennusjatteiden lajitteluvelvoite
 *   - RT 69-11183 Rakennusjatteiden lajittelu
 */

// ---------------------------------------------------------------------------
// Finnish waste classification types (jatteen lajittelu)
// ---------------------------------------------------------------------------
export type WasteType =
  | "puujate"         // wood waste
  | "metallijate"     // metal waste
  | "kivijate"        // stone/mineral waste
  | "sekajate"        // mixed waste
  | "vaarallinen_jate" // hazardous waste
  | "muovijate"       // plastic waste
  | "lasijate"        // glass waste
  | "eristejate";     // insulation waste

// ---------------------------------------------------------------------------
// Waste factor for a material category
// ---------------------------------------------------------------------------
export interface WasteFactor {
  /** Primary waste classification */
  wasteType: WasteType;
  /** Secondary waste type (for composite materials) */
  secondaryWasteType?: WasteType;
  /** Waste generation factor: kg waste per unit of material */
  kgPerUnit: number;
  /** Unit the factor applies to (matches BOM units) */
  unit: string;
  /** Approximate volume per kg (m3/kg) for container sizing */
  volumePerKg: number;
  /** Recyclable fraction (0-1) */
  recyclingRate: number;
  /** Disposal cost EUR per tonne at Sortti station */
  disposalCostPerTonne: number;
}

// ---------------------------------------------------------------------------
// Waste factors by material category_id
// ---------------------------------------------------------------------------
export const WASTE_FACTORS: Record<string, WasteFactor> = {
  lumber: {
    wasteType: "puujate",
    kgPerUnit: 3.2,       // ~3.2 kg waste per jm of dimensional lumber
    unit: "jm",
    volumePerKg: 0.003,   // wood is bulky, ~300 kg/m3 loose
    recyclingRate: 0.85,   // wood can be recycled/energy recovery
    disposalCostPerTonne: 0, // puhdas puujate is free at Sortti
  },
  panels: {
    wasteType: "puujate",
    kgPerUnit: 1.8,       // ~1.8 kg waste per m2 of panel
    unit: "m2",
    volumePerKg: 0.004,
    recyclingRate: 0.70,
    disposalCostPerTonne: 0,
  },
  insulation: {
    wasteType: "eristejate",
    kgPerUnit: 0.5,       // insulation is lightweight
    unit: "m2",
    volumePerKg: 0.02,    // very bulky for its weight
    recyclingRate: 0.15,   // mineral wool recyclability limited
    disposalCostPerTonne: 150, // classified as sekajate at Sortti
  },
  roofing: {
    wasteType: "metallijate",
    kgPerUnit: 5.0,       // metal roofing ~5 kg/m2
    unit: "m2",
    volumePerKg: 0.002,
    recyclingRate: 0.95,   // metal is highly recyclable
    disposalCostPerTonne: 0, // clean metal is free
  },
  foundation: {
    wasteType: "kivijate",
    kgPerUnit: 12.0,      // concrete blocks are heavy
    unit: "kpl",
    volumePerKg: 0.0005,  // dense material
    recyclingRate: 0.90,   // concrete can be crushed and reused
    disposalCostPerTonne: 40, // puhdas kivijate pricing
  },
  fasteners: {
    wasteType: "metallijate",
    kgPerUnit: 0.005,     // ~5g per screw
    unit: "kpl",
    volumePerKg: 0.001,
    recyclingRate: 0.98,
    disposalCostPerTonne: 0,
  },
  plumbing: {
    wasteType: "metallijate",
    secondaryWasteType: "muovijate",
    kgPerUnit: 2.0,
    unit: "jm",
    volumePerKg: 0.002,
    recyclingRate: 0.80,
    disposalCostPerTonne: 0,
  },
  electrical: {
    wasteType: "sekajate",
    secondaryWasteType: "vaarallinen_jate",
    kgPerUnit: 0.3,
    unit: "jm",
    volumePerKg: 0.005,
    recyclingRate: 0.50,
    disposalCostPerTonne: 150,
  },
  windows: {
    wasteType: "lasijate",
    secondaryWasteType: "puujate",
    kgPerUnit: 25.0,      // a window unit is heavy
    unit: "kpl",
    volumePerKg: 0.003,
    recyclingRate: 0.60,
    disposalCostPerTonne: 80,
  },
  paint: {
    wasteType: "vaarallinen_jate",
    kgPerUnit: 1.2,       // per liter
    unit: "litra",
    volumePerKg: 0.001,
    recyclingRate: 0.0,    // paint waste is hazardous
    disposalCostPerTonne: 500,
  },
};

/**
 * Default waste factor for categories not explicitly mapped.
 * Conservative estimate classifying as mixed waste.
 */
export const DEFAULT_WASTE_FACTOR: WasteFactor = {
  wasteType: "sekajate",
  kgPerUnit: 2.0,
  unit: "kpl",
  volumePerKg: 0.003,
  recyclingRate: 0.30,
  disposalCostPerTonne: 150,
};

// ---------------------------------------------------------------------------
// Container (vaihtolavat) sizing
// ---------------------------------------------------------------------------
export interface ContainerSize {
  sizeM3: number;
  /** Rental + pickup cost EUR (Helsinki region avg) */
  costEur: number;
  /** Maximum load weight in kg */
  maxLoadKg: number;
  label: string;
  labelFi: string;
}

export const CONTAINER_SIZES: ContainerSize[] = [
  { sizeM3: 4,  costEur: 250,  maxLoadKg: 3000,  label: "4 m\u00B3 skip",     labelFi: "4 m\u00B3 vaihtolavat" },
  { sizeM3: 6,  costEur: 350,  maxLoadKg: 5000,  label: "6 m\u00B3 skip",     labelFi: "6 m\u00B3 vaihtolavat" },
  { sizeM3: 10, costEur: 500,  maxLoadKg: 8000,  label: "10 m\u00B3 skip",    labelFi: "10 m\u00B3 vaihtolavat" },
];

/**
 * Recommend the best container configuration for a given total waste
 * volume and weight.
 */
export function recommendContainer(
  totalVolumeM3: number,
  totalWeightKg: number,
): { size: ContainerSize; count: number; totalCost: number } {
  // Pick the smallest container that fits, prefer fewer containers
  for (const size of CONTAINER_SIZES) {
    const countByVolume = Math.ceil(totalVolumeM3 / size.sizeM3);
    const countByWeight = Math.ceil(totalWeightKg / size.maxLoadKg);
    const count = Math.max(countByVolume, countByWeight, 1);
    if (count <= 2) {
      return { size, count, totalCost: count * size.costEur };
    }
  }
  // Fall back to largest size
  const largest = CONTAINER_SIZES[CONTAINER_SIZES.length - 1];
  const countByVolume = Math.ceil(totalVolumeM3 / largest.sizeM3);
  const countByWeight = Math.ceil(totalWeightKg / largest.maxLoadKg);
  const count = Math.max(countByVolume, countByWeight, 1);
  return { size: largest, count, totalCost: count * largest.costEur };
}

// ---------------------------------------------------------------------------
// Sorting guide — per waste type
// ---------------------------------------------------------------------------
export interface SortingGuideEntry {
  wasteType: WasteType;
  sortingInstruction_fi: string;
  sortingInstruction_en: string;
  acceptedAt: string;
}

export const SORTING_GUIDE: SortingGuideEntry[] = [
  {
    wasteType: "puujate",
    sortingInstruction_fi: "Puhdas, maalaamaton ja kasittelematon puu. Ei lastulevya tai vaneria liimapinnoin.",
    sortingInstruction_en: "Clean, unpainted, and untreated wood. No particle board or glued plywood.",
    acceptedAt: "Sortti-asemat, HSY kierratyskeskukset",
  },
  {
    wasteType: "metallijate",
    sortingInstruction_fi: "Puhdas metalli ilman muita materiaaleja. Pelti, ruuvit, naulat, terasputket.",
    sortingInstruction_en: "Clean metal without other materials. Sheet metal, screws, nails, steel tubes.",
    acceptedAt: "Sortti-asemat, metallikerayspisteet",
  },
  {
    wasteType: "kivijate",
    sortingInstruction_fi: "Betoni, tiilet, laastit, keramiikka. Ei kipsilevya tai asbestia.",
    sortingInstruction_en: "Concrete, bricks, mortar, ceramics. No gypsum board or asbestos.",
    acceptedAt: "Sortti-asemat, maankaatopaikat",
  },
  {
    wasteType: "sekajate",
    sortingInstruction_fi: "Lajittelematon rakennusjate. Pyri lajittelemaan mahdollisimman hyvin ensin.",
    sortingInstruction_en: "Unsorted construction waste. Sort as much as possible before disposal.",
    acceptedAt: "Sortti-asemat",
  },
  {
    wasteType: "vaarallinen_jate",
    sortingInstruction_fi: "Maalit, lakat, liuottimet, asbestipitoiset materiaalit. Erilliskerays pakollinen.",
    sortingInstruction_en: "Paints, varnishes, solvents, asbestos-containing materials. Separate collection mandatory.",
    acceptedAt: "Sortti-asemat vaarallisen jatteen vastaanotto",
  },
  {
    wasteType: "muovijate",
    sortingInstruction_fi: "Puhtaat muoviputket, muovikalvot, pakkausmuovit. Ei PVC-muovia.",
    sortingInstruction_en: "Clean plastic pipes, plastic films, packaging plastics. No PVC.",
    acceptedAt: "Sortti-asemat, muovinkerayspisteet",
  },
  {
    wasteType: "lasijate",
    sortingInstruction_fi: "Ikkunalasit, lasitiilet. Ei peililasia tai laminated-lasia.",
    sortingInstruction_en: "Window glass, glass blocks. No mirror glass or laminated glass.",
    acceptedAt: "Sortti-asemat, lasinkerayspisteet",
  },
  {
    wasteType: "eristejate",
    sortingInstruction_fi: "Mineraalivilla, styrox (EPS/XPS). Pakattava tiiviisti sahkoihin.",
    sortingInstruction_en: "Mineral wool, styrofoam (EPS/XPS). Must be packed tightly in bags.",
    acceptedAt: "Sortti-asemat",
  },
];
