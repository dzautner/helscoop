import type { BuildingInfo } from "@/types";

export type PermitLocale = "fi" | "en";

export type PermitCategoryId =
  | "interior_surface"
  | "load_bearing"
  | "extension"
  | "use_change"
  | "facade"
  | "roof"
  | "windows_doors"
  | "wet_room"
  | "energy_system"
  | "yard_structure"
  | "demolition";

export type PermitAnswerId =
  | "loadBearing"
  | "addsFloorArea"
  | "changesUse"
  | "changesExterior"
  | "newOpenings"
  | "facadeMaterialOrInsulation"
  | "roofShapeOrMaterial"
  | "wetRoomTechnical"
  | "geothermalWell"
  | "largeStructure"
  | "protectedOrPlanRestricted"
  | "detachedHouse";

export type PermitOutcome =
  | "building_permit"
  | "action_or_review"
  | "no_permit_likely"
  | "authority_check";

export type PermitSeverity = "danger" | "warning" | "success" | "neutral";

export type PermitAnswers = Partial<Record<PermitAnswerId, boolean>>;

export interface LocalizedText {
  fi: string;
  en: string;
}

export interface PermitCategory {
  id: PermitCategoryId;
  label: LocalizedText;
  description: LocalizedText;
  defaultAnswers?: PermitAnswers;
}

export interface PermitQuestion {
  id: PermitAnswerId;
  label: LocalizedText;
  help: LocalizedText;
  categories?: PermitCategoryId[];
}

export interface MunicipalityPermitProfile {
  id: string;
  name: string;
  municipalityNumber?: string;
  buildingPermitProcessingDays?: number;
  actionPermitProcessingDays?: number;
  buildingPermitCostRange: LocalizedText;
  actionPermitCostRange: LocalizedText;
  notes: LocalizedText[];
  permitUrl: string;
}

export interface PermitSourceReference {
  label: string;
  url: string;
}

export interface PermitAssessment {
  outcome: PermitOutcome;
  severity: PermitSeverity;
  confidence: "high" | "medium" | "low";
  permitType: LocalizedText;
  summary: LocalizedText;
  processingEstimate: LocalizedText;
  costEstimate: LocalizedText;
  reasons: LocalizedText[];
  nextSteps: LocalizedText[];
  documents: LocalizedText[];
  municipality: MunicipalityPermitProfile;
  sources: PermitSourceReference[];
}

export const PERMIT_CATEGORIES: PermitCategory[] = [
  {
    id: "interior_surface",
    label: { fi: "Sisäpinnat", en: "Interior surfaces" },
    description: { fi: "Maalaus, tapetti, lattiat, kalusteet ilman talotekniikkaa.", en: "Painting, wallpaper, floors, cabinetry without building services." },
    defaultAnswers: { detachedHouse: true },
  },
  {
    id: "load_bearing",
    label: { fi: "Kantavat seinät", en: "Load-bearing walls" },
    description: { fi: "Seinän aukotus, purku tai palkitus.", en: "Opening, removing, or reinforcing structural walls." },
    defaultAnswers: { loadBearing: true },
  },
  {
    id: "extension",
    label: { fi: "Laajennus", en: "Extension" },
    description: { fi: "Lisähuone, kuisti, kerrosala tai tilavuus kasvaa.", en: "Additional room, porch, floor area, or volume." },
    defaultAnswers: { addsFloorArea: true, changesExterior: true },
  },
  {
    id: "use_change",
    label: { fi: "Käyttötarkoitus", en: "Change of use" },
    description: { fi: "Autotalli, varasto tai vapaa-ajan tila muuttuu asumiseen.", en: "Garage, storage, or leisure space becomes living space." },
    defaultAnswers: { changesUse: true },
  },
  {
    id: "facade",
    label: { fi: "Julkisivu", en: "Facade" },
    description: { fi: "Väri, materiaali, lisäeristys, ilmanvaihtorako tai kaupunkikuva.", en: "Colour, material, extra insulation, ventilation gap, or streetscape." },
    defaultAnswers: { changesExterior: true, detachedHouse: true },
  },
  {
    id: "roof",
    label: { fi: "Katto", en: "Roof" },
    description: { fi: "Katon väri, materiaali, muoto, aukot tai kattorakenteet.", en: "Roof colour, material, shape, openings, or roof structures." },
    defaultAnswers: { changesExterior: true, detachedHouse: true },
  },
  {
    id: "windows_doors",
    label: { fi: "Ikkunat ja ovet", en: "Windows and doors" },
    description: { fi: "Aukkojen paikka, koko tai julkisivun ilme muuttuu.", en: "Opening locations, sizes, or facade appearance changes." },
    defaultAnswers: { changesExterior: true, newOpenings: true },
  },
  {
    id: "wet_room",
    label: { fi: "Märkätila", en: "Wet room" },
    description: { fi: "Kylpyhuone, sauna, vesieristys, LVI tai ilmanvaihto.", en: "Bathroom, sauna, waterproofing, plumbing, or ventilation." },
  },
  {
    id: "energy_system",
    label: { fi: "Energia ja talotekniikka", en: "Energy and building services" },
    description: { fi: "Maalämpö, lämpöpumppu, aurinkopaneelit tai tekninen järjestelmä.", en: "Geothermal, heat pump, solar panels, or technical systems." },
  },
  {
    id: "yard_structure",
    label: { fi: "Piharakennelma", en: "Yard structure" },
    description: { fi: "Varasto, katos, aita, laituri, jätekatos tai terassi.", en: "Shed, canopy, fence, dock, waste shelter, or terrace." },
  },
  {
    id: "demolition",
    label: { fi: "Purku", en: "Demolition" },
    description: { fi: "Rakennuksen tai merkittävän rakenneosan purkaminen.", en: "Demolishing a building or major building part." },
  },
];

export const PERMIT_QUESTIONS: PermitQuestion[] = [
  {
    id: "detachedHouse",
    label: { fi: "Kyseessä on omakotitalo tai sen piharakennus", en: "This is a detached house or its outbuilding" },
    help: { fi: "Kerrostalot, taloyhtiöt ja suojelukohteet ovat yleensä tiukempia.", en: "Apartment buildings, housing companies, and protected sites are usually stricter." },
  },
  {
    id: "protectedOrPlanRestricted",
    label: { fi: "Kohde on suojeltu tai asemakaava voi rajoittaa muutosta", en: "The building is protected or the detailed plan may restrict the change" },
    help: { fi: "Suojelu ja kaavamääräykset voivat muuttaa myös pienet muutokset luvanvaraisiksi.", en: "Protection and zoning rules can make small changes permit-controlled." },
  },
  {
    id: "loadBearing",
    label: { fi: "Muutos koskee kantavia rakenteita", en: "The change affects load-bearing structures" },
    help: { fi: "Esimerkiksi kantavan seinän purku, uusi aukko tai palkitus.", en: "For example removing a structural wall, making a new opening, or adding beams." },
    categories: ["interior_surface", "load_bearing", "wet_room", "roof", "windows_doors", "extension"],
  },
  {
    id: "addsFloorArea",
    label: { fi: "Kerrosala, tilavuus tai rakennuksen jalanjälki kasvaa", en: "Floor area, volume, or building footprint increases" },
    help: { fi: "Laajennukset ja uudet rakennusosat ovat yleensä lupahankkeita.", en: "Extensions and new building parts are usually permit projects." },
    categories: ["extension", "yard_structure", "roof"],
  },
  {
    id: "changesUse",
    label: { fi: "Tilan käyttötarkoitus muuttuu", en: "The room or building changes use" },
    help: { fi: "Esimerkiksi autotalli tai varasto muuttuu asuintilaksi.", en: "For example a garage or storage room becomes living space." },
    categories: ["use_change", "interior_surface", "yard_structure"],
  },
  {
    id: "changesExterior",
    label: { fi: "Ulkoinen ilme tai kaupunkikuva muuttuu", en: "Exterior appearance or streetscape changes" },
    help: { fi: "Väri, materiaali, ikkunajako, katto tai näkyvä tekninen laite.", en: "Colour, material, window layout, roof, or visible technical equipment." },
    categories: ["facade", "roof", "windows_doors", "energy_system", "yard_structure", "extension"],
  },
  {
    id: "newOpenings",
    label: { fi: "Lisäät tai siirrät ikkuna- tai oviaukkoja", en: "You add or move window or door openings" },
    help: { fi: "Uudet aukot vaikuttavat rakenteisiin, paloturvallisuuteen ja julkisivuun.", en: "New openings affect structure, fire safety, and facade appearance." },
    categories: ["windows_doors", "facade", "extension", "load_bearing"],
  },
  {
    id: "facadeMaterialOrInsulation",
    label: { fi: "Julkisivun materiaali, lisäeristys tai tuuletusrako muuttuu", en: "Facade material, added insulation, or ventilation gap changes" },
    help: { fi: "Helsingin ohjeissa nämä ovat esimerkkejä luvanvaraisista julkisivutöistä.", en: "Helsinki guidance lists these as examples of facade work that needs review." },
    categories: ["facade", "energy_system"],
  },
  {
    id: "roofShapeOrMaterial",
    label: { fi: "Katon muoto, rakenne tai materiaali muuttuu", en: "Roof shape, structure, or material changes" },
    help: { fi: "Pelkkä värin uusiminen voi olla kevyempi tapaus, mutta muoto ja rakenne ovat eri asia.", en: "A like-for-like colour refresh can be lighter, but shape and structure are different." },
    categories: ["roof", "extension"],
  },
  {
    id: "wetRoomTechnical",
    label: { fi: "Märkätilassa muuttuu LVI, ilmanvaihto, viemäri tai vedeneristyslaajuus", en: "Wet room plumbing, ventilation, drainage, or waterproofing scope changes" },
    help: { fi: "Tekniset ja terveyteen vaikuttavat muutokset kannattaa tarkistaa kunnasta.", en: "Technical or health-impacting changes should be checked with the municipality." },
    categories: ["wet_room"],
  },
  {
    id: "geothermalWell",
    label: { fi: "Hanke sisältää energiakaivon tai maalämmön porauksen", en: "The project includes a geothermal well or ground-source drilling" },
    help: { fi: "Energiakaivot mainitaan usein luvanvaraisina tai toimenpideluvan piiriin kuuluvina.", en: "Geothermal wells are commonly treated as permit/action-review projects." },
    categories: ["energy_system"],
  },
  {
    id: "largeStructure",
    label: { fi: "Piharakennelma on suuri tai tulkittavissa rakennukseksi", en: "The yard structure is large or can be interpreted as a building" },
    help: { fi: "2025+ rakentamislaki vapauttaa osan pienistä rakennuksista, mutta määräykset ja kaavat koskevat silti hanketta.", en: "The 2025+ Construction Act exempts some small buildings, but regulations and zoning still apply." },
    categories: ["yard_structure"],
  },
];

export const MUNICIPALITY_PERMIT_PROFILES: MunicipalityPermitProfile[] = [
  {
    id: "helsinki",
    name: "Helsinki",
    municipalityNumber: "091",
    buildingPermitProcessingDays: 99,
    actionPermitProcessingDays: 51,
    buildingPermitCostRange: { fi: "Tarkista Helsingin hinnasto; varaudu satoihin tai tuhansiin euroihin.", en: "Check Helsinki's fee list; plan for hundreds to thousands of euros." },
    actionPermitCostRange: { fi: "Tarkista Helsingin hinnasto; pienemmät luvat ovat yleensä rakennuslupaa kevyempiä.", en: "Check Helsinki's fee list; smaller permits are usually lighter than building permits." },
    notes: [
      { fi: "Helsinki käsittelee rakentamisen luvat Lupapisteessä.", en: "Helsinki handles construction permits in Lupapiste." },
      { fi: "Helsingin ohje: kantavat rakenteet ja käyttötarkoituksen muutos vaativat rakennusluvan.", en: "Helsinki guidance: load-bearing changes and change of use require a building permit." },
      { fi: "Omakotitalon katon materiaalin tai julkisivun/katon värin muutos voi olla luvaton, ellei kaava tai suojelu rajoita sitä.", en: "For detached houses, roof material or facade/roof colour changes may be permit-free unless zoning or protection restricts them." },
    ],
    permitUrl: "https://www.hel.fi/en/urban-environment-and-traffic/plots-and-building-permits/building-permits",
  },
  {
    id: "espoo",
    name: "Espoo",
    municipalityNumber: "049",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Espoon rakennusvalvonta.", en: "According to municipal fee list; check Espoo building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Espoon rakennusvalvonta.", en: "According to municipal fee list; check Espoo building control." },
    notes: [{ fi: "Espoon paikalliset kaava- ja rakennusjärjestyssäännöt voivat ratkaista rajatapauksen.", en: "Espoo zoning and building-order rules can decide edge cases." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
  {
    id: "tampere",
    name: "Tampere",
    municipalityNumber: "837",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Tampereen rakennusvalvonta.", en: "According to municipal fee list; check Tampere building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Tampereen rakennusvalvonta.", en: "According to municipal fee list; check Tampere building control." },
    notes: [{ fi: "Tampereen kaava ja rakennusjärjestys voivat rajoittaa ulkomuutoksia.", en: "Tampere zoning and building order may restrict exterior changes." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
  {
    id: "vantaa",
    name: "Vantaa",
    municipalityNumber: "092",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Vantaan rakennusvalvonta.", en: "According to municipal fee list; check Vantaa building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Vantaan rakennusvalvonta.", en: "According to municipal fee list; check Vantaa building control." },
    notes: [{ fi: "Vantaan kaupunkikuva- ja kaavavaatimukset voivat vaikuttaa julkisivuun.", en: "Vantaa streetscape and zoning requirements may affect facade work." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
  {
    id: "oulu",
    name: "Oulu",
    municipalityNumber: "564",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Oulun rakennusvalvonta.", en: "According to municipal fee list; check Oulu building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Oulun rakennusvalvonta.", en: "According to municipal fee list; check Oulu building control." },
    notes: [{ fi: "Oulun rakennusjärjestys ratkaisee monen piharakennelman rajan.", en: "Oulu's building order decides many yard-structure thresholds." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
  {
    id: "turku",
    name: "Turku",
    municipalityNumber: "853",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Turun rakennusvalvonta.", en: "According to municipal fee list; check Turku building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Turun rakennusvalvonta.", en: "According to municipal fee list; check Turku building control." },
    notes: [{ fi: "Turun vanhat ja suojellut ympäristöt voivat tehdä ulkomuutoksista luvanvaraisia.", en: "Turku's historic and protected environments can make exterior changes permit-controlled." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
  {
    id: "jyvaskyla",
    name: "Jyväskylä",
    municipalityNumber: "179",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Jyväskylän rakennusvalvonta.", en: "According to municipal fee list; check Jyväskylä building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Jyväskylän rakennusvalvonta.", en: "According to municipal fee list; check Jyväskylä building control." },
    notes: [{ fi: "Tarkista rakennusjärjestys etenkin ranta-alueilla ja piharakennelmissa.", en: "Check the building order especially for shore areas and yard structures." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
  {
    id: "kuopio",
    name: "Kuopio",
    municipalityNumber: "297",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Kuopion rakennusvalvonta.", en: "According to municipal fee list; check Kuopio building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Kuopion rakennusvalvonta.", en: "According to municipal fee list; check Kuopio building control." },
    notes: [{ fi: "Kuopion paikalliset määräykset voivat koskea ulkonäköä ja rakennuspaikkaa.", en: "Kuopio local rules may affect exterior appearance and building site constraints." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
  {
    id: "lahti",
    name: "Lahti",
    municipalityNumber: "398",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Lahden rakennusvalvonta.", en: "According to municipal fee list; check Lahti building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Lahden rakennusvalvonta.", en: "According to municipal fee list; check Lahti building control." },
    notes: [{ fi: "Lahden kaava- ja kaupunkikuvavaatimukset voivat vaikuttaa julkisivuun.", en: "Lahti zoning and streetscape rules can affect facade changes." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
  {
    id: "pori",
    name: "Pori",
    municipalityNumber: "609",
    buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Porin rakennusvalvonta.", en: "According to municipal fee list; check Pori building control." },
    actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista Porin rakennusvalvonta.", en: "According to municipal fee list; check Pori building control." },
    notes: [{ fi: "Piharakennelmat ja julkisivumuutokset kannattaa tarkistaa Porin rakennusvalvonnasta.", en: "Check yard structures and facade changes with Pori building control." }],
    permitUrl: "https://www.lupapiste.fi/",
  },
];

const FALLBACK_MUNICIPALITY: MunicipalityPermitProfile = {
  id: "national",
  name: "Suomi",
  buildingPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista paikallinen rakennusvalvonta.", en: "According to municipal fee list; check local building control." },
  actionPermitCostRange: { fi: "Kunnan hinnaston mukainen; tarkista paikallinen rakennusvalvonta.", en: "According to municipal fee list; check local building control." },
  notes: [
    { fi: "Kuntien rakennusjärjestykset ja asemakaavat poikkeavat toisistaan.", en: "Municipal building orders and detailed plans vary." },
    { fi: "Luvan tarpeen voi varmistaa Lupapisteessä tai kunnan rakennusvalvonnasta.", en: "Confirm permit need in Lupapiste or with municipal building control." },
  ],
  permitUrl: "https://www.lupapiste.fi/",
};

export const PERMIT_SOURCE_REFERENCES: PermitSourceReference[] = [
  { label: "Suomi.fi construction and renovation", url: "https://www.suomi.fi/citizen/housing-and-construction/construction-and-properties/guide/construction-and-waste-management/construction-and-renovation" },
  { label: "City of Helsinki building permits", url: "https://www.hel.fi/en/urban-environment-and-traffic/plots-and-building-permits/building-permits" },
  { label: "City of Helsinki renovation and alteration work", url: "https://www.hel.fi/en/urban-environment-and-traffic/plots-and-building-permits/applying-for-a-building-permit/construction-project-instructions/renovations-and-alteration-work" },
  { label: "Lupapiste", url: "https://www.lupapiste.fi/" },
];

function normalizeForMatch(input: string): string {
  return input
    .toLocaleLowerCase("fi-FI")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/å/g, "a");
}

type PermitBuildingInfo = Partial<BuildingInfo> & {
  municipalityNumber?: unknown;
  city?: unknown;
};

export function inferPermitMunicipality(buildingInfo?: PermitBuildingInfo | null): MunicipalityPermitProfile {
  if (!buildingInfo) return FALLBACK_MUNICIPALITY;
  const municipalityNumber = typeof buildingInfo.municipalityNumber === "string" ? buildingInfo.municipalityNumber : undefined;
  if (municipalityNumber) {
    const byNumber = MUNICIPALITY_PERMIT_PROFILES.find((profile) => profile.municipalityNumber === municipalityNumber);
    if (byNumber) return byNumber;
  }

  const haystack = normalizeForMatch([
    buildingInfo.address,
    typeof buildingInfo.city === "string" ? buildingInfo.city : undefined,
  ].filter(Boolean).join(" "));

  const byName = MUNICIPALITY_PERMIT_PROFILES.find((profile) => haystack.includes(normalizeForMatch(profile.name)));
  return byName ?? FALLBACK_MUNICIPALITY;
}

function processingEstimate(outcome: PermitOutcome, municipality: MunicipalityPermitProfile): LocalizedText {
  if (outcome === "no_permit_likely") {
    return { fi: "Ei lupakäsittelyä, jos paikalliset rajoitukset eivät muuta arviota.", en: "No permit processing if local restrictions do not change the assessment." };
  }
  if (outcome === "building_permit" && municipality.buildingPermitProcessingDays) {
    return {
      fi: `Helsingin ohjearvo: noin ${municipality.buildingPermitProcessingDays} päivää rakennusluvalle.`,
      en: `Helsinki reference: about ${municipality.buildingPermitProcessingDays} days for a building permit.`,
    };
  }
  if (outcome === "action_or_review" && municipality.actionPermitProcessingDays) {
    return {
      fi: `Helsingin ohjearvo: noin ${municipality.actionPermitProcessingDays} päivää toimenpideluvalle/kevyemmälle käsittelylle.`,
      en: `Helsinki reference: about ${municipality.actionPermitProcessingDays} days for action-permit/lighter review.`,
    };
  }
  return {
    fi: "Käsittelyaika riippuu kunnasta, hakemuksen laadusta ja ruuhkasta.",
    en: "Processing time depends on municipality, application quality, and queue.",
  };
}

function baseAssessment(
  outcome: PermitOutcome,
  municipality: MunicipalityPermitProfile,
  reasons: LocalizedText[],
): PermitAssessment {
  const commonAuthorityStep = {
    fi: "Varmista tulos Lupapisteessä tai kunnan rakennusvalvonnasta ennen työn aloitusta.",
    en: "Confirm this in Lupapiste or with municipal building control before starting work.",
  };

  if (outcome === "building_permit") {
    return {
      outcome,
      severity: "danger",
      confidence: "high",
      permitType: { fi: "Todennäköisesti rakentamislupa / rakennuslupa", en: "Likely construction/building permit" },
      summary: { fi: "Hanke osuu sääntöihin, joissa lupa on yleensä pakollinen.", en: "This project matches cases where a permit is usually mandatory." },
      processingEstimate: processingEstimate(outcome, municipality),
      costEstimate: municipality.buildingPermitCostRange,
      reasons,
      nextSteps: [
        { fi: "Kokoa pääpiirustukset, vastuullinen suunnittelija ja hankkeen kuvaus.", en: "Prepare main drawings, responsible designer details, and project description." },
        { fi: "Avaa hakemus Lupapisteessä ja pyydä ennakkoneuvontaa, jos rajaus on epäselvä.", en: "Open an application in Lupapiste and ask pre-advice if the scope is unclear." },
        { fi: "Hyödynnä Helscoopin IFC/Ryhti-pakettia, kun #190-dokumenttipolku on käytössä.", en: "Use the Helscoop IFC/Ryhti package once the #190 document workflow is available." },
      ],
      documents: [
        { fi: "Pääpiirustukset ja asemapiirros", en: "Main drawings and site plan" },
        { fi: "Rakennesuunnitelmat, jos kantavat rakenteet muuttuvat", en: "Structural drawings if load-bearing structures change" },
        { fi: "Naapurien kuuleminen tai suostumukset tarpeen mukaan", en: "Neighbour hearing or consents where required" },
      ],
      municipality,
      sources: PERMIT_SOURCE_REFERENCES,
    };
  }

  if (outcome === "action_or_review") {
    return {
      outcome,
      severity: "warning",
      confidence: "medium",
      permitType: { fi: "Todennäköisesti toimenpidelupa, lausunto tai kunnallinen tarkistus", en: "Likely action permit, statement, or municipal review" },
      summary: { fi: "Hanke vaikuttaa ulkoasuun, tekniseen järjestelmään tai kaupunkikuvaan.", en: "The project affects exterior appearance, a technical system, or streetscape." },
      processingEstimate: processingEstimate(outcome, municipality),
      costEstimate: municipality.actionPermitCostRange,
      reasons,
      nextSteps: [
        commonAuthorityStep,
        { fi: "Valmistele nyky- ja muutostilannetta näyttävät valokuvat/piirustukset.", en: "Prepare photos/drawings showing current and proposed state." },
        { fi: "Tarkista asemakaava, rakennusjärjestys ja mahdollinen suojelumerkintä.", en: "Check zoning, building order, and any protection marking." },
      ],
      documents: [
        { fi: "Julkisivu-, väri- tai detaljisuunnitelma tilanteen mukaan", en: "Facade, colour, or detail plan depending on scope" },
        { fi: "Laitteiston tai rakenteen tekninen seloste", en: "Technical description of equipment or structure" },
      ],
      municipality,
      sources: PERMIT_SOURCE_REFERENCES,
    };
  }

  if (outcome === "no_permit_likely") {
    return {
      outcome,
      severity: "success",
      confidence: "medium",
      permitType: { fi: "Lupaa ei todennäköisesti tarvita", en: "Permit likely not required" },
      summary: { fi: "Kuvaamasi työ näyttää tavanomaiselta pinta- tai ylläpitoremontilta.", en: "The described work looks like ordinary surface or maintenance renovation." },
      processingEstimate: processingEstimate(outcome, municipality),
      costEstimate: { fi: "Ei lupamaksua, jos kunta vahvistaa ettei lupaa tarvita.", en: "No permit fee if the municipality confirms no permit is required." },
      reasons,
      nextSteps: [
        { fi: "Tallenna tämä arvio projektimuistiinpanoihin ja varmista taloyhtiön/kunnan rajoitukset tarvittaessa.", en: "Save this assessment in project notes and check housing company/municipal restrictions if needed." },
        { fi: "Älä muuta kantavia rakenteita, talotekniikkaa tai ulkoasua ilman uutta tarkistusta.", en: "Do not change load-bearing structures, building services, or exterior appearance without a new check." },
      ],
      documents: [
        { fi: "Työselostus ja valokuvat omaa dokumentointia varten", en: "Work description and photos for your own records" },
      ],
      municipality,
      sources: PERMIT_SOURCE_REFERENCES,
    };
  }

  return {
    outcome,
    severity: "neutral",
    confidence: "low",
    permitType: { fi: "Rajataus: kysy rakennusvalvonnasta", en: "Edge case: ask building control" },
    summary: { fi: "Tulos riippuu kunnan tulkinnasta, asemakaavasta tai kohteen suojelusta.", en: "The answer depends on municipal interpretation, zoning, or protection status." },
    processingEstimate: processingEstimate(outcome, municipality),
    costEstimate: municipality.actionPermitCostRange,
    reasons,
    nextSteps: [
      commonAuthorityStep,
      { fi: "Kuvaa työ yhdellä kappaleella ja liitä valokuva nykytilasta ennakkokyselyyn.", en: "Describe the work in one paragraph and attach a current-state photo to pre-advice." },
    ],
    documents: [
      { fi: "Nykytilan valokuvat ja lyhyt muutosselostus", en: "Current-state photos and short change description" },
    ],
    municipality,
    sources: PERMIT_SOURCE_REFERENCES,
  };
}

export function assessPermitNeed(input: {
  categoryId: PermitCategoryId;
  answers?: PermitAnswers;
  buildingInfo?: PermitBuildingInfo | null;
}): PermitAssessment {
  const answers = input.answers ?? {};
  const municipality = inferPermitMunicipality(input.buildingInfo);
  const reasons: LocalizedText[] = [];
  const category = input.categoryId;

  const addReason = (fi: string, en: string) => reasons.push({ fi, en });

  if (answers.loadBearing || answers.addsFloorArea || answers.changesUse || category === "load_bearing" || category === "extension" || category === "use_change") {
    if (answers.loadBearing || category === "load_bearing") addReason("Kantavat rakenteet muuttuvat.", "Load-bearing structures change.");
    if (answers.addsFloorArea || category === "extension") addReason("Kerrosala, tilavuus tai rakennuksen laajuus kasvaa.", "Floor area, volume, or building scope increases.");
    if (answers.changesUse || category === "use_change") addReason("Käyttötarkoituksen muutos on lupaperuste.", "Change of use is a permit trigger.");
    if (answers.protectedOrPlanRestricted) addReason("Suojelu tai asemakaava lisää viranomaisvaatimuksia.", "Protection or zoning adds authority requirements.");
    return baseAssessment("building_permit", municipality, reasons);
  }

  if (answers.protectedOrPlanRestricted) {
    addReason("Suojelu tai asemakaava voi tehdä pienestäkin muutoksesta luvanvaraisen.", "Protection or zoning can make even a small change permit-controlled.");
    return baseAssessment("authority_check", municipality, reasons);
  }

  if (category === "demolition") {
    addReason("Purkaminen edellyttää kunnallista lupaa tai ilmoitusta tilanteesta riippuen.", "Demolition requires municipal permit or notice depending on scope.");
    return baseAssessment("authority_check", municipality, reasons);
  }

  if (answers.geothermalWell) {
    addReason("Energiakaivo tai maalämpöporakaivo kuuluu usein luvanvaraisiin hankkeisiin.", "A geothermal well or ground-source drilling is commonly permit-controlled.");
    return baseAssessment("action_or_review", municipality, reasons);
  }

  if (category === "wet_room") {
    if (answers.wetRoomTechnical) {
      addReason("Märkätilan LVI, ilmanvaihto tai vedeneristyksen laajuus muuttuu.", "Wet-room plumbing, ventilation, or waterproofing scope changes.");
      return baseAssessment("authority_check", municipality, reasons);
    }
    addReason("Kyse on märkätilan kunnossapidosta ilman kantavia tai teknisiä muutoksia.", "This is wet-room maintenance without structural or technical changes.");
    if (municipality.id === "helsinki") {
      addReason("Helsingin ohjeistus on keventänyt tavanomaisten märkätilakorjausten lupakäytäntöä.", "Helsinki guidance has made ordinary wet-room repairs lighter on permitting.");
      return baseAssessment("no_permit_likely", municipality, reasons);
    }
    return baseAssessment("authority_check", municipality, reasons);
  }

  if (category === "facade" || category === "roof" || category === "windows_doors") {
    if (answers.newOpenings) addReason("Ikkuna- tai oviaukko muuttuu.", "A window or door opening changes.");
    if (answers.facadeMaterialOrInsulation) addReason("Julkisivumateriaali, lisäeristys tai tuuletusrako muuttuu.", "Facade material, added insulation, or ventilation gap changes.");
    if (answers.roofShapeOrMaterial) addReason("Katon muoto, rakenne tai materiaali muuttuu.", "Roof shape, structure, or material changes.");
    if (answers.newOpenings || answers.facadeMaterialOrInsulation || answers.roofShapeOrMaterial) {
      return baseAssessment("action_or_review", municipality, reasons);
    }

    if (answers.changesExterior) {
      if (answers.detachedHouse && municipality.id === "helsinki") {
        addReason("Helsingin omakotitalo-ohjeissa osa väri- ja kattomateriaalimuutoksista voi olla luvattomia ilman kaava- tai suojelurajoitusta.", "Helsinki detached-house guidance says some colour and roof-material changes may be permit-free without zoning/protection restrictions.");
        return baseAssessment("no_permit_likely", municipality, reasons);
      }
      addReason("Ulkoinen ilme tai kaupunkikuva muuttuu.", "Exterior appearance or streetscape changes.");
      return baseAssessment("action_or_review", municipality, reasons);
    }
  }

  if (category === "energy_system") {
    if (answers.changesExterior) {
      addReason("Näkyvä tekninen laite voi vaikuttaa julkisivuun tai kaupunkikuvaan.", "Visible technical equipment may affect facade or streetscape.");
      return baseAssessment("authority_check", municipality, reasons);
    }
    addReason("Tekninen järjestelmä ei kuvauksen mukaan muuta ulkoasua, energiakaivoa tai kantavia rakenteita.", "The technical system does not appear to change exterior appearance, geothermal wells, or load-bearing structures.");
    return baseAssessment("authority_check", municipality, reasons);
  }

  if (category === "yard_structure") {
    if (answers.largeStructure || answers.changesExterior) {
      addReason("Piharakennelman koko, sijainti tai näkyvyys voi laukaista kunnallisen tarkistuksen.", "The yard structure size, location, or visibility can trigger municipal review.");
      return baseAssessment("action_or_review", municipality, reasons);
    }
    addReason("Pieni piharakennelma voi olla luvaton, mutta kaava ja rakennusjärjestys ratkaisevat.", "A small yard structure can be permit-free, but zoning and building order decide.");
    return baseAssessment("authority_check", municipality, reasons);
  }

  addReason("Työ ei muuta kantavia rakenteita, käyttötarkoitusta, talotekniikkaa tai ulkoasua.", "The work does not change load-bearing structures, use, building services, or exterior appearance.");
  return baseAssessment("no_permit_likely", municipality, reasons);
}

export function localizedPermitText(text: LocalizedText, locale: PermitLocale): string {
  return text[locale] ?? text.en;
}
