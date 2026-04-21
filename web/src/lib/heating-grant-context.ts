import type { BomItem, BuildingInfo, EnergyHeatingType, Material } from "@/types";

export interface HeatingGrantOpportunity {
  shouldShow: boolean;
  triggeredByScene: boolean;
  detectedTargetHeating: EnergyHeatingType | null;
  fossilSourceHeating: boolean;
  matchedTerms: string[];
}

const FOSSIL_HEATING_PATTERNS = [
  /(?:^|[\s_\-])oil(?:$|[\s_\-])/i,
  /(?:^|[\s_\-])gas(?:$|[\s_\-])/i,
  /natural[\s_\-]?gas/i,
  /maakaasu/i,
  /(?:o|ö)ljy/i,
];

const TARGET_PATTERNS: Array<{
  target: EnergyHeatingType;
  patterns: RegExp[];
}> = [
  {
    target: "air_water_heat_pump",
    patterns: [
      /air[\s_\-]?water[\s_\-]?(?:heat[\s_\-]?)?pump/i,
      /awhp/i,
      /ilma[\s_\-]?vesi/i,
      /vesi[\s_\-]?ilma/i,
    ],
  },
  {
    target: "ground_source_heat_pump",
    patterns: [
      /ground[\s_\-]?source[\s_\-]?(?:heat[\s_\-]?)?pump/i,
      /geothermal/i,
      /gshp/i,
      /maal(?:a|ä)mp(?:o|ö)/i,
      /maapiiri/i,
    ],
  },
  {
    target: "district_heat",
    patterns: [
      /district[\s_\-]?heat/i,
      /kaukol(?:a|ä)mp(?:o|ö)/i,
    ],
  },
  {
    target: "other_non_fossil",
    patterns: [
      /heat[\s_\-]?pump/i,
      /l(?:a|ä)mp(?:o|ö)pumppu/i,
      /electric[\s_\-]?boiler/i,
      /s(?:a|ä)hk(?:o|ö)kattila/i,
      /solar[\s_\-]?thermal/i,
      /aurinkol(?:a|ä)mp(?:o|ö)/i,
      /pellet/i,
    ],
  },
];

function collectText({ sceneJs, bom, materials, buildingInfo }: {
  sceneJs?: string;
  bom?: BomItem[];
  materials?: Material[];
  buildingInfo?: BuildingInfo | null;
}): string {
  const materialById = new Map((materials ?? []).map((material) => [material.id, material]));
  const bomText = (bom ?? []).flatMap((item) => {
    const material = materialById.get(item.material_id);
    return [
      item.material_id,
      item.material_name,
      item.category_name,
      material?.name,
      material?.name_fi,
      material?.name_en,
      material?.category_name,
      material?.category_name_fi,
      ...(material?.tags ?? []),
    ];
  });

  return [
    sceneJs,
    ...bomText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function inferHeatingGrantTarget(text?: string): { target: EnergyHeatingType | null; matchedTerms: string[] } {
  const haystack = (text ?? "").toLowerCase();
  const matchedTerms: string[] = [];

  for (const candidate of TARGET_PATTERNS) {
    for (const pattern of candidate.patterns) {
      const match = haystack.match(pattern);
      if (match?.[0]) {
        matchedTerms.push(match[0]);
        return { target: candidate.target, matchedTerms };
      }
    }
  }

  return { target: null, matchedTerms };
}

export function hasFossilSourceHeating(heating?: string | null): boolean {
  const raw = (heating ?? "").toLowerCase();
  return FOSSIL_HEATING_PATTERNS.some((pattern) => pattern.test(raw));
}

export function detectHeatingGrantOpportunity(input: {
  sceneJs?: string;
  bom?: BomItem[];
  materials?: Material[];
  buildingInfo?: BuildingInfo | null;
}): HeatingGrantOpportunity {
  const text = collectText(input);
  const detected = inferHeatingGrantTarget(text);
  const fossilSourceHeating = hasFossilSourceHeating(input.buildingInfo?.heating);

  return {
    shouldShow: fossilSourceHeating || detected.target !== null,
    triggeredByScene: detected.target !== null,
    detectedTargetHeating: detected.target,
    fossilSourceHeating,
    matchedTerms: detected.matchedTerms,
  };
}
