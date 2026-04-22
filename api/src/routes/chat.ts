import { Router } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { requireAuth } from "../auth";
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  deductCreditsForFeature,
  ensureMonthlyCreditGrant,
  getCreditBalance,
  type InsufficientCreditsBody,
} from "../entitlements";

const router = Router();

router.use(requireAuth);

// Build the materials catalog summary once at startup
function buildMaterialsCatalogSummary(): string {
  try {
    const materialsPath = join(__dirname, "../../../materials/materials.json");
    const raw = readFileSync(materialsPath, "utf-8");
    const catalog = JSON.parse(raw) as {
      materials: Record<
        string,
        {
          name: string;
          category: string;
          substitutionGroup?: string | null;
          pricing?: { unitPrice: number; unit: string; supplier: string };
          thermal?: { conductivity: number; thickness: number };
        }
      >;
    };

    const lines: string[] = [];
    for (const [id, mat] of Object.entries(catalog.materials)) {
      if (mat.category === "assembly_preview") continue;
      let line = `  ${id}: "${mat.name}" [${mat.category}]`;
      if (mat.pricing) {
        line += ` — ${mat.pricing.unitPrice} EUR/${mat.pricing.unit} (${mat.pricing.supplier})`;
      }
      if (mat.thermal && mat.thermal.thickness > 0) {
        line += `, λ=${mat.thermal.conductivity} W/mK @ ${mat.thermal.thickness}mm`;
      }
      if (mat.substitutionGroup) {
        line += ` [group: ${mat.substitutionGroup}]`;
      }
      lines.push(line);
    }
    return lines.join("\n");
  } catch {
    return "  (materials catalog unavailable)";
  }
}

const MATERIALS_CATALOG_SUMMARY = buildMaterialsCatalogSummary();

const SYSTEM_PROMPT = `You are a Helscoop scene editing assistant. Helscoop is a Finnish building renovation platform. You help users modify their parametric CAD scenes written in JavaScript and give expert renovation advice grounded in Finnish building context.

## Scene primitives

Available primitives:
- box(width, height, depth) - creates a box
- cylinder(radius, height) - creates a cylinder
- sphere(radius) - creates a sphere

Transforms:
- translate(mesh, x, y, z) - moves a mesh
- rotate(mesh, rx, ry, rz) - rotates a mesh (degrees)
- scale(mesh, sx, sy, sz) - scales a mesh

Boolean operations:
- union(a, b) - combines two meshes
- subtract(a, b) - subtracts b from a
- intersect(a, b) - keeps intersection

Output:
- scene.add(mesh, { material: "name", color: [r, g, b] })

When the user asks you to modify a scene, respond with the complete updated scene script wrapped in a code block. Keep the same style and structure. Be concise in your explanation.

## Finnish building types

Understand these common Finnish residential building types:
- omakotitalo — detached single-family house, typically 1–2 floors, common in suburbs and rural areas
- paritalo — semi-detached house (duplex), two units sharing one wall
- rivitalo — row house / terrace house, 3+ units in a row
- kerrostalo — apartment block, multi-storey, concrete or brick construction
- vapaa-ajan asunto / mökki — summer cottage, often simpler construction, may lack year-round insulation

## Finnish building terminology

Use these terms naturally in Finnish or English as appropriate:
- harjakatto — gable roof (most common Finnish roof type)
- pulpettikatto — mono-pitch / shed roof
- tasakatto — flat roof
- terassi — terrace / deck
- autotalli — garage
- kuisti / eteinen — entrance porch / hallway
- ullakko — attic
- kellari — basement / cellar
- saunatila — sauna space (nearly universal in Finnish homes)
- julkisivu — facade / exterior face
- runko — structural frame (timber stud frame = puurunko)
- alapohja — ground floor slab / sub-floor assembly
- yläpohja — roof assembly / ceiling structure
- ulkoseinä — exterior wall
- höyrynsulku — vapour barrier (critical in Finnish climate)
- tuulensuoja — wind barrier / breather membrane
- runkotolppa — stud (typically 48×98 or 48×148)
- vasojen jako — joist spacing (typically 600 mm c/c)

## Energy classes and Finnish energy certificate

Finland uses the EU energy performance certificate (EPC) scale:
- A (≤ ~100 kWh/m²/yr) — nearly zero-energy building (NZEB), modern standard
- B (101–150) — good, typical new construction
- C (151–200) — satisfactory, 2000s–2010s construction
- D (201–250) — moderate, common 1980s–1990s renovation target
- E (251–300) — poor, older un-renovated stock
- F (301–400) — very poor
- G (> 400) — worst class, pre-1970s uninsulated buildings

Key drivers in Finnish energy calculations (ET-luku):
- Heating energy dominant due to cold climate (Design temperature −26 °C Helsinki, −40 °C Lapland)
- U-value targets (Finnish building code RakMK/Suomen RakMK C3 / EN ISO 6946):
  - Exterior wall: U ≤ 0.17 W/m²K (new build), renovation aim ≤ 0.22
  - Roof/ceiling: U ≤ 0.09 W/m²K (new build)
  - Ground floor: U ≤ 0.16 W/m²K
  - Windows: U ≤ 1.0 W/m²K (triple glazing typical)
- When given building year, infer likely energy class and suggest upgrades accordingly:
  - Pre-1970: likely E–G, uninsulated cavity walls, single/double glazing
  - 1970s–1980s: likely D–E, some insulation, oil/electric heating common
  - 1990s–2000s: likely C–D, mineral wool in walls, improving windows
  - 2010s+: likely B–C, nearly code-compliant
  - 2018+: likely A–B, NZEB requirements

## Finnish building code (RakMK) basics

Minimum requirements to reference in renovation advice:
- Habitable room minimum ceiling height: 2.5 m (existing buildings: 2.4 m acceptable)
- Stair riser max 190 mm, going min 250 mm (interior); riser max 170 mm for public stairs
- Minimum bedroom area: 7 m²
- Staircase minimum width: 900 mm (single-family); fire stairs 1200 mm
- Door minimum clear opening: 800 mm width, 2000 mm height (accessibility: 850 mm)
- Railing required on edges > 500 mm above floor; balcony railing min 1000 mm high
- Smoke detector mandatory in every sleeping area and hallway
- Ventilation: mechanical supply-and-exhaust (tulo-poistoilmanvaihto) required in new builds
- Wet room (märkätila) waterproofing: fully tanked walls and floor, class 1 waterproofing system

## Common Finnish renovation tasks

When users mention these, provide specific Finnish-context advice and cost estimates:
- Lisäeristys (insulation upgrade): adding mineral wool (mineraalivilla) to walls/roof; typical 100–200 mm addition; ~15–30 EUR/m² material + installation
- Ikkunoiden vaihto (window replacement): single-family house 15–25 windows; triple-glazed (kolmilasiset) standard; ~500–1500 EUR/window installed
- Kattoremontti (roof renovation): bitumen felt (bitumihuopa), metal sheet (peltikatto), or tile (tiililaatta); 50–150 EUR/m² installed depending on material
- Julkisivuremontti (facade renovation): new cladding or render; 80–200 EUR/m² depending on material
- Terassin rakentaminen (terrace addition): pressure-treated timber deck; 200–600 EUR/m² depending on size and finishing
- Autotallin lisäys (garage addition): single bay ~20–30 m², 30,000–70,000 EUR typical turnkey
- Lämmitysjärjestelmän vaihto (heating system change): heat pump (maalämpö = ground source, ilma-vesilämpöpumppu = air-to-water) — common upgrade path from electric or oil boiler
- Alapohjan korjaus (subfloor repair): common in 1970s–1980s buildings with failed EPS insulation or moisture damage

## Materials catalog

Reference these real materials from the Helscoop catalog when making suggestions. Always quote the material ID (e.g. "pine_48x98_c24") and price:

${MATERIALS_CATALOG_SUMMARY}

Substitution groups mean materials are interchangeable within a group. When suggesting alternatives, stay within the same substitution group unless there is a technical reason to change.

When substitution opportunities are supplied in the current project context, use them when the user asks for cheaper materials, stock replacements, budget reductions, or "onko vaihtoehtoja?". Mention material IDs, substitute IDs, estimated savings, and whether the suggestion is driven by price or stock.

## Language and response style

- Detect the user's language from their message. If they write in Finnish, respond in Finnish. If in English, respond in English. If mixed, follow the dominant language.
- Use Finnish building terminology naturally — in Finnish responses use Finnish terms primarily; in English responses introduce the Finnish term parenthetically on first use.
- When suggesting materials or construction changes, include:
  1. The specific material ID and name from the catalog
  2. Estimated quantity needed
  3. Unit price and total cost estimate
  4. Installation cost range (labour) if relevant
- Keep scene code modifications concise and well-commented.
- When building info is provided, tailor advice to the specific building age, type, and heating system.`;



interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface BomSummaryItem {
  material: string;
  qty: number;
  unit: string;
  total: number;
}

interface SubstitutionSuggestionSummary {
  material: string;
  materialId: string;
  substitute?: string;
  substituteId?: string;
  savings?: number;
  savingsPercent?: number;
  reason?: string;
  stockLevel?: string | null;
}

interface BuildingInfo {
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
}

interface ProjectInfo {
  name?: string;
  description?: string;
}

function buildContextBlock(
  currentScene: string,
  bomSummary?: BomSummaryItem[],
  buildingInfo?: BuildingInfo,
  projectInfo?: ProjectInfo,
  renovationRoiSummary?: string,
  substitutionSuggestions?: SubstitutionSuggestionSummary[],
): string {
  let context = `\n\nCurrent scene script:\n\`\`\`javascript\n${currentScene}\n\`\`\``;

  if (projectInfo?.name || projectInfo?.description) {
    context += `\n\nProject: "${projectInfo.name || "Untitled"}"`;
    if (projectInfo.description) {
      context += ` — ${projectInfo.description}`;
    }
  }

  if (buildingInfo && Object.keys(buildingInfo).length > 0) {
    const parts: string[] = [];
    if (buildingInfo.address) parts.push(`Address: ${buildingInfo.address}`);
    if (buildingInfo.type) parts.push(`Type: ${buildingInfo.type}`);
    if (buildingInfo.year_built) parts.push(`Built: ${buildingInfo.year_built}`);
    if (buildingInfo.area_m2) parts.push(`Area: ${buildingInfo.area_m2} m²`);
    if (buildingInfo.floors) parts.push(`Floors: ${buildingInfo.floors}`);
    if (buildingInfo.material) parts.push(`Material: ${buildingInfo.material}`);
    if (buildingInfo.heating) parts.push(`Heating: ${buildingInfo.heating}`);
    if (buildingInfo.climate_zone) parts.push(`Climate zone: ${buildingInfo.climate_zone}`);
    if (buildingInfo.heating_degree_days) {
      parts.push(`Heating degree days: ${buildingInfo.heating_degree_days}`);
    }
    if (buildingInfo.confidence) parts.push(`Data confidence: ${buildingInfo.confidence}`);
    if (buildingInfo.data_sources?.length) {
      parts.push(`Data sources: ${buildingInfo.data_sources.join(", ")}`);
    }
    if (buildingInfo.data_source_error) {
      parts.push(`Data warning: ${buildingInfo.data_source_error}`);
    }
    if (parts.length > 0) {
      context += `\n\nBuilding info:\n${parts.join(" | ")}`;
      context += `\nUse this info to give contextual renovation advice (e.g. building age affects insulation recommendations, heating type affects energy upgrade suggestions).`;
    }
  }

  if (bomSummary && bomSummary.length > 0) {
    const bomLines = bomSummary
      .slice(0, 20) // Cap at 20 items for token budget
      .map((item) => `  ${item.material}: ${item.qty} ${item.unit} = ${item.total.toFixed(2)} EUR`);
    const grandTotal = bomSummary.reduce((sum, item) => sum + item.total, 0);
    context += `\n\nCurrent BOM (${bomSummary.length} items, total ${grandTotal.toFixed(2)} EUR):\n${bomLines.join("\n")}`;
    context += `\nUse BOM data to give cost-aware suggestions. Reference actual prices when discussing additions or changes.`;
  }

  if (substitutionSuggestions && substitutionSuggestions.length > 0) {
    const suggestionLines = substitutionSuggestions
      .slice(0, 8)
      .map((suggestion) => {
        const parts = [
          `${suggestion.material} (${suggestion.materialId})`,
          suggestion.substitute && suggestion.substituteId
            ? `-> ${suggestion.substitute} (${suggestion.substituteId})`
            : "needs substitute review",
        ];
        if (typeof suggestion.savings === "number" && suggestion.savings > 0) {
          parts.push(`saves ${suggestion.savings.toFixed(0)} EUR`);
        }
        if (typeof suggestion.savingsPercent === "number" && suggestion.savingsPercent > 0) {
          parts.push(`${suggestion.savingsPercent.toFixed(0)}%`);
        }
        if (suggestion.stockLevel) parts.push(`stock: ${suggestion.stockLevel}`);
        if (suggestion.reason) parts.push(`reason: ${suggestion.reason}`);
        return `  ${parts.join(" | ")}`;
      });
    context += `\n\nMaterial substitution opportunities:\n${suggestionLines.join("\n")}`;
    context += `\nIf the user asks about alternatives, stock issues, or saving money, proactively explain these swaps before giving generic advice.`;
  }

  if (renovationRoiSummary) {
    context += `\n\nRenovation ROI dashboard:\n${renovationRoiSummary}`;
    context += `\nWhen the user asks whether the renovation is worth it, use this dashboard summary and clearly separate estimate, assumption, and recommendation.`;
  }

  return context;
}

router.post("/", async (req, res) => {
  const {
    messages,
    currentScene,
    bomSummary,
    buildingInfo,
    projectInfo,
    renovationRoiSummary,
    substitutionSuggestions,
  }: {
    messages: ChatMessage[];
    currentScene: string;
    bomSummary?: BomSummaryItem[];
    buildingInfo?: BuildingInfo;
    projectInfo?: ProjectInfo;
    renovationRoiSummary?: string;
    substitutionSuggestions?: SubstitutionSuggestionSummary[];
  } = req.body;

  if (!messages?.length) {
    return res.status(400).json({ error: "Messages required" });
  }

  await ensureMonthlyCreditGrant(req.user!.id);
  const creditBalance = await getCreditBalance(req.user!.id);
  const creditCost = CREDIT_COSTS.aiMessages;
  if (creditBalance < creditCost) {
    return res.status(402).json({
      error: "insufficient_credits",
      feature: "aiMessages",
      cost: creditCost,
      balance: creditBalance,
      packs: CREDIT_PACKS,
    } satisfies InsufficientCreditsBody);
  }

  const sendMeteredReply = async (content: string) => {
    const debit = await deductCreditsForFeature(req.user!.id, "aiMessages", {
      messageCount: messages.length,
      fallback: !process.env.ANTHROPIC_API_KEY,
    });
    if (!debit.ok) {
      return res.status(402).json({
        error: "insufficient_credits",
        feature: "aiMessages",
        cost: debit.cost,
        balance: debit.balance,
        packs: CREDIT_PACKS,
      } satisfies InsufficientCreditsBody);
    }
    return res.json({
      role: "assistant",
      content,
      credits: {
        cost: creditCost,
        balance: debit.entry.balanceAfter,
      },
    });
  };

  const contextBlock = buildContextBlock(
    currentScene,
    bomSummary,
    buildingInfo,
    projectInfo,
    renovationRoiSummary,
    substitutionSuggestions,
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return sendMeteredReply(generateLocalResponse(messages[messages.length - 1].content, currentScene, substitutionSuggestions));
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: SYSTEM_PROMPT + contextBlock,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = (await response.json()) as { content: { text: string }[] };
    return sendMeteredReply(data.content[0].text);
  } catch (err) {
    console.error("Chat API error:", err);
    return sendMeteredReply(generateLocalResponse(messages[messages.length - 1].content, currentScene, substitutionSuggestions));
  }
});

function asksForAlternatives(message: string): boolean {
  return /alternative|substitut|cheaper|budget|saving|save|stock|unavailable|vaihtoehto|halvempi|saast|sääst|budjet|varasto|loppu/.test(message);
}

function generateSubstitutionResponse(suggestions: SubstitutionSuggestionSummary[]): string {
  const lines = suggestions.slice(0, 5).map((suggestion) => {
    const target = suggestion.substitute && suggestion.substituteId
      ? `${suggestion.substitute} (${suggestion.substituteId})`
      : "manual substitute review";
    const savings = typeof suggestion.savings === "number" && suggestion.savings > 0
      ? `, estimated saving ${suggestion.savings.toFixed(0)} EUR`
      : "";
    const pct = typeof suggestion.savingsPercent === "number" && suggestion.savingsPercent > 0
      ? ` (${suggestion.savingsPercent.toFixed(0)}%)`
      : "";
    const reason = suggestion.reason ? `, reason: ${suggestion.reason}` : "";
    return `- ${suggestion.material} (${suggestion.materialId}) -> ${target}${savings}${pct}${reason}`;
  });

  return `I found substitution opportunities in the current BOM:\n${lines.join("\n")}\n\nVerify technical compatibility before ordering, especially for structural or moisture-critical materials.`;
}

function generateLocalResponse(
  userMessage: string,
  currentScene: string,
  substitutionSuggestions: SubstitutionSuggestionSummary[] = [],
): string {
  const lower = userMessage.toLowerCase();

  if (substitutionSuggestions.length > 0 && asksForAlternatives(lower)) {
    return generateSubstitutionResponse(substitutionSuggestions);
  }

  if (lower.includes("add") && lower.includes("roof")) {
    const roofCode = `\n// Roof\nconst roofLeft = translate(rotate(box(4.3, 0.1, 4.2), 0, 0, 30), -1.1, 3.5, 0);\nconst roofRight = translate(rotate(box(4.3, 0.1, 4.2), 0, 0, -30), 1.1, 3.5, 0);\nscene.add(roofLeft, { material: "roofing", color: [0.55, 0.27, 0.07] });\nscene.add(roofRight, { material: "roofing", color: [0.55, 0.27, 0.07] });`;
    return `Here's the scene with a simple A-frame roof added:\n\n\`\`\`javascript\n${currentScene}\n${roofCode}\n\`\`\`\n\nI added two angled roof panels forming an A-frame. Adjust the angles and dimensions to fit your design.`;
  }

  if (lower.includes("add") && lower.includes("door")) {
    const doorCode = `\n// Door opening\nconst doorHole = translate(box(0.9, 2.1, 0.2), 0, 1.05, 1.925);\nconst wallWithDoor = subtract(wall2, doorHole);\n// Replace wall2 in scene.add with wallWithDoor`;
    return `To add a door, you'd subtract a door-shaped box from a wall:\n\n\`\`\`javascript\n${doorCode}\n\`\`\`\n\nThis creates a 0.9m x 2.1m door opening in the front wall. You'll need to update the scene.add call to use the modified wall.`;
  }

  if (lower.includes("add") && lower.includes("window")) {
    return `To add a window, subtract a box from a wall:\n\n\`\`\`javascript\nconst windowHole = translate(box(1.0, 0.8, 0.2), 1.5, 1.5, -1.925);\nconst wallWithWindow = subtract(wall1, windowHole);\nscene.add(wallWithWindow, { material: "lumber", color: [0.85, 0.75, 0.55] });\n\`\`\`\n\nThis creates a 1m x 0.8m window opening at 1.5m height on the back wall.`;
  }

  if (lower.includes("bigger") || lower.includes("larger") || lower.includes("scale")) {
    return `To make the building larger, increase the dimensions in the box() calls. For example, change \`box(6, 0.2, 4)\` to \`box(8, 0.2, 6)\` for a wider/deeper floor, and adjust wall positions accordingly.\n\nWould you like me to generate the full updated scene with specific dimensions?`;
  }

  if (lower.includes("color") || lower.includes("colour")) {
    return `You can change colors by modifying the \`color: [r, g, b]\` values in scene.add(). Values are 0-1:\n- White: [1, 1, 1]\n- Wood: [0.85, 0.75, 0.55]\n- Red: [0.8, 0.2, 0.1]\n- Blue: [0.2, 0.4, 0.8]\n- Green: [0.2, 0.6, 0.3]\n\nWhich element would you like to recolor?`;
  }

  return `I can help you modify your scene. Try asking me to:\n- Add a roof, door, or window\n- Make the building bigger or smaller\n- Change colors or materials\n- Add new structural elements\n\nFor the best experience, set the \`ANTHROPIC_API_KEY\` environment variable to enable AI-powered responses.`;
}

export default router;
