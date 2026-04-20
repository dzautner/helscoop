/**
 * Maintenance schedule data for Finnish building materials.
 *
 * Maps material category IDs to inspection intervals, expected lifetimes,
 * and bilingual maintenance notes. Used by the huoltokirja (maintenance
 * manual) generator to produce machine-readable maintenance programs
 * as required by Rakentamislaki.
 */

export interface MaintenanceSchedule {
  /** Recommended inspection interval in months */
  inspectionIntervalMonths: number;
  /** Expected useful life in years */
  expectedLifeYears: number;
  /** Finnish maintenance instructions */
  maintenanceNotes_fi: string;
  /** English maintenance instructions */
  maintenanceNotes_en: string;
}

/**
 * Static mapping from material category IDs (matching `categories.id` in the
 * database) to their maintenance schedules.
 *
 * When a BOM item's category is not found here, the generator falls back to
 * a generic schedule.
 */
export const maintenanceSchedules: Record<string, MaintenanceSchedule> = {
  lumber: {
    inspectionIntervalMonths: 12,
    expectedLifeYears: 30,
    maintenanceNotes_fi:
      "Tarkista lahoisuus ja pintakäsittely. Uusi puunsuoja-aine tarvittaessa.",
    maintenanceNotes_en:
      "Check for rot and surface treatment. Reapply wood preservative as needed.",
  },
  panels: {
    inspectionIntervalMonths: 24,
    expectedLifeYears: 40,
    maintenanceNotes_fi:
      "Tarkista levyjen kiinnitys ja kosteusvauriot. Vaihda vaurioituneet levyt.",
    maintenanceNotes_en:
      "Check panel fastening and moisture damage. Replace damaged panels.",
  },
  concrete: {
    inspectionIntervalMonths: 60,
    expectedLifeYears: 80,
    maintenanceNotes_fi:
      "Tarkista halkeamat ja rapautuminen. Paikkaa vauriot betonimassalla.",
    maintenanceNotes_en:
      "Inspect for cracks and spalling. Patch damage with concrete filler.",
  },
  steel: {
    inspectionIntervalMonths: 24,
    expectedLifeYears: 50,
    maintenanceNotes_fi:
      "Tarkista ruostevauriot ja maalipinnan kunto. Käsittele ruosteenesto-aineella.",
    maintenanceNotes_en:
      "Check for rust damage and paint condition. Apply rust inhibitor treatment.",
  },
  insulation: {
    inspectionIntervalMonths: 60,
    expectedLifeYears: 50,
    maintenanceNotes_fi:
      "Tarkista eristeen kunto ja kosteustiiveys. Vaihda painuneet tai kastuneet eristeet.",
    maintenanceNotes_en:
      "Check insulation condition and moisture barrier integrity. Replace compressed or wet insulation.",
  },
  roofing: {
    inspectionIntervalMonths: 12,
    expectedLifeYears: 40,
    maintenanceNotes_fi:
      "Tarkista katon tiiviys, pellitykset ja läpiviennit. Puhdista räystäskourut.",
    maintenanceNotes_en:
      "Check roof sealing, flashings, and penetrations. Clean gutters.",
  },
  windows: {
    inspectionIntervalMonths: 12,
    expectedLifeYears: 30,
    maintenanceNotes_fi:
      "Tarkista tiivisteet, helat ja lasitukset. Vaihda kuluneet tiivisteet.",
    maintenanceNotes_en:
      "Check seals, fittings, and glazing. Replace worn seals.",
  },
  doors: {
    inspectionIntervalMonths: 12,
    expectedLifeYears: 35,
    maintenanceNotes_fi:
      "Tarkista saranoiden ja lukkojen toiminta. Voitele saranat ja säädä ovensuljin.",
    maintenanceNotes_en:
      "Check hinge and lock operation. Lubricate hinges and adjust door closer.",
  },
  plumbing: {
    inspectionIntervalMonths: 12,
    expectedLifeYears: 40,
    maintenanceNotes_fi:
      "Tarkista putkiliitokset, venttiilit ja vesikalusteet vuotojen varalta.",
    maintenanceNotes_en:
      "Inspect pipe joints, valves, and fixtures for leaks.",
  },
  electrical: {
    inspectionIntervalMonths: 60,
    expectedLifeYears: 40,
    maintenanceNotes_fi:
      "Teetä sähkötarkastus valtuutetulla asentajalla. Tarkista vikavirtasuojien toiminta.",
    maintenanceNotes_en:
      "Have electrical inspection by certified electrician. Test residual current device operation.",
  },
  hvac: {
    inspectionIntervalMonths: 12,
    expectedLifeYears: 20,
    maintenanceNotes_fi:
      "Vaihda ilmanvaihtosuodattimet. Tarkista kanaviston puhtaus ja lämmityslaitteen toiminta.",
    maintenanceNotes_en:
      "Replace ventilation filters. Check duct cleanliness and heating unit operation.",
  },
  foundation: {
    inspectionIntervalMonths: 60,
    expectedLifeYears: 100,
    maintenanceNotes_fi:
      "Tarkista perustusten painumat, halkeamat ja kosteuden nousu. Huolehdi salaojituksen toimivuudesta.",
    maintenanceNotes_en:
      "Check foundation settling, cracks, and moisture rise. Ensure drainage system is functioning.",
  },
  fasteners: {
    inspectionIntervalMonths: 24,
    expectedLifeYears: 30,
    maintenanceNotes_fi:
      "Tarkista kiinnikkeiden kireys ja korroosio. Kiristä löystyneet ja vaihda ruostuneet.",
    maintenanceNotes_en:
      "Check fastener tightness and corrosion. Tighten loose and replace rusted fasteners.",
  },
  paint: {
    inspectionIntervalMonths: 12,
    expectedLifeYears: 10,
    maintenanceNotes_fi:
      "Tarkista maalipinnan kunto. Paikkamaalaa hilseilleet kohdat ja uusintamaalaa tarvittaessa.",
    maintenanceNotes_en:
      "Check paint condition. Touch up peeling areas and repaint as needed.",
  },
  waterproofing: {
    inspectionIntervalMonths: 12,
    expectedLifeYears: 25,
    maintenanceNotes_fi:
      "Tarkista vedeneristyksen kunto märkätiloissa. Uusi saumaukset tarvittaessa.",
    maintenanceNotes_en:
      "Check waterproofing in wet areas. Renew sealing joints as needed.",
  },
};

/**
 * Fallback schedule for material categories not listed above.
 */
export const defaultSchedule: MaintenanceSchedule = {
  inspectionIntervalMonths: 24,
  expectedLifeYears: 30,
  maintenanceNotes_fi: "Tarkista kunto ja toimivuus silmämääräisesti.",
  maintenanceNotes_en: "Visually inspect condition and functionality.",
};

/**
 * Look up the maintenance schedule for a given category, falling back to
 * the default schedule when the category is unknown.
 */
export function getScheduleForCategory(categoryId: string): MaintenanceSchedule {
  return maintenanceSchedules[categoryId] ?? defaultSchedule;
}
