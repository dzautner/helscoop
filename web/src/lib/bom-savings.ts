import type { BomItem, Material, StockLevel } from "@/types";

export type BomSavingType = "supplier_switch" | "material_substitution" | "bulk_discount" | "seasonal_stock";

export interface BomSavingRecommendation {
  id: string;
  type: BomSavingType;
  materialId: string;
  materialName: string;
  savingsAmount: number;
  savingsPercent: number;
  currentUnitPrice: number;
  targetUnitPrice: number;
  quantity: number;
  unit: string;
  fromSupplier?: string;
  toSupplier?: string;
  toMaterialId?: string;
  toMaterialName?: string;
  link?: string | null;
  stockLevel?: StockLevel | null;
  reason: string;
}

interface SavingsOptions {
  minSavings?: number;
}

interface PrimaryPrice {
  unit_price: number;
  unit: string;
  supplier_name: string;
  link?: string | null;
  stock_level?: StockLevel | null;
  is_primary?: boolean;
}

const DEFAULT_MIN_SAVINGS = 10;

function getPrimaryPrice(material: Material | null | undefined): PrimaryPrice | null {
  const primary = material?.pricing?.find((price) => price.is_primary) ?? material?.pricing?.[0];
  if (!primary) return null;
  return {
    ...primary,
    unit_price: Number(primary.unit_price ?? 0),
  };
}

function getCurrentUnitPrice(item: BomItem, material: Material | null | undefined): number {
  const explicit = Number(item.unit_price ?? 0);
  if (explicit > 0) return explicit;
  return getPrimaryPrice(material)?.unit_price ?? 0;
}

function getMaterialName(item: BomItem, material: Material | null | undefined): string {
  return material?.name_fi || material?.name_en || material?.name || item.material_name || item.material_id;
}

function getSavingsPercent(savingsAmount: number, currentTotal: number): number {
  if (currentTotal <= 0) return 0;
  return (savingsAmount / currentTotal) * 100;
}

function sameFunctionalClass(current: Material, candidate: Material): boolean {
  if (current.substitution_group && candidate.substitution_group) {
    return current.substitution_group === candidate.substitution_group;
  }
  if (current.structural_grade_class && candidate.structural_grade_class) {
    return current.structural_grade_class === candidate.structural_grade_class;
  }
  if (current.thermal_conductivity != null && candidate.thermal_conductivity != null) {
    const currentLambda = Number(current.thermal_conductivity);
    const candidateLambda = Number(candidate.thermal_conductivity);
    if (Number.isFinite(currentLambda) && Number.isFinite(candidateLambda)) {
      return Math.abs(currentLambda - candidateLambda) <= 0.015;
    }
  }
  return current.category_name === candidate.category_name;
}

function getBulkDiscount(item: BomItem, material: Material | null | undefined): { threshold: number; discount: number } | null {
  const text = `${material?.category_name ?? item.category_name ?? ""} ${material?.name ?? item.material_name ?? ""}`.toLowerCase();
  const quantity = Number(item.quantity || 0);
  if (/fastener|kiinnitys|screw|ruuvi|nail/.test(text) && quantity >= 100) return { threshold: 100, discount: 0.1 };
  if (/lumber|sahatavara|wood|timber|pine|spruce/.test(text) && quantity >= 50) return { threshold: 50, discount: 0.08 };
  if (/insulation|eristys|villa|rockwool/.test(text) && quantity >= 35) return { threshold: 35, discount: 0.07 };
  if (/roof|katto|membrane|kalvo/.test(text) && quantity >= 40) return { threshold: 40, discount: 0.06 };
  if (Number(item.total || 0) >= 500) return { threshold: quantity, discount: 0.05 };
  return null;
}

export function buildSavingsRecommendations(
  bom: BomItem[],
  materials: Material[],
  options: SavingsOptions = {},
): BomSavingRecommendation[] {
  const minSavings = options.minSavings ?? DEFAULT_MIN_SAVINGS;
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const bomMaterialIds = new Set(bom.map((item) => item.material_id));
  const recommendations: BomSavingRecommendation[] = [];

  for (const item of bom) {
    const material = materialMap.get(item.material_id) ?? null;
    const materialName = getMaterialName(item, material);
    const quantity = Number(item.quantity || 0);
    if (quantity <= 0) continue;

    const currentUnitPrice = getCurrentUnitPrice(item, material);
    const currentTotal = currentUnitPrice * quantity;
    if (currentUnitPrice <= 0 || currentTotal <= 0) continue;

    const currentSupplier = item.supplier || getPrimaryPrice(material)?.supplier_name;
    const cheapestAlternative = (material?.pricing ?? [])
      .map((price) => ({ ...price, unit_price: Number(price.unit_price ?? 0) }))
      .filter((price) => price.unit_price > 0)
      .filter((price) => price.supplier_name !== currentSupplier || price.unit_price < currentUnitPrice)
      .sort((a, b) => a.unit_price - b.unit_price)[0];

    if (cheapestAlternative && cheapestAlternative.unit_price < currentUnitPrice) {
      const savingsAmount = (currentUnitPrice - cheapestAlternative.unit_price) * quantity;
      if (savingsAmount >= minSavings) {
        recommendations.push({
          id: `supplier-${item.material_id}-${cheapestAlternative.supplier_name}`,
          type: "supplier_switch",
          materialId: item.material_id,
          materialName,
          savingsAmount,
          savingsPercent: getSavingsPercent(savingsAmount, currentTotal),
          currentUnitPrice,
          targetUnitPrice: cheapestAlternative.unit_price,
          quantity,
          unit: cheapestAlternative.unit || item.unit,
          fromSupplier: currentSupplier,
          toSupplier: cheapestAlternative.supplier_name,
          link: cheapestAlternative.link,
          stockLevel: cheapestAlternative.stock_level,
          reason: "cheaper_supplier",
        });
      }
    }

    if (material) {
      const currentUnit = material.design_unit || getPrimaryPrice(material)?.unit || item.unit;
      const candidate = materials
        .filter((candidateMaterial) => candidateMaterial.id !== item.material_id)
        .filter((candidateMaterial) => !bomMaterialIds.has(candidateMaterial.id))
        .filter((candidateMaterial) => sameFunctionalClass(material, candidateMaterial))
        .map((candidateMaterial) => {
          const price = getPrimaryPrice(candidateMaterial);
          return { material: candidateMaterial, price };
        })
        .filter(({ material: candidateMaterial, price }) => {
          if (!price || price.unit_price <= 0) return false;
          const candidateUnit = candidateMaterial.design_unit || price.unit;
          return candidateUnit === currentUnit || price.unit === item.unit;
        })
        .sort((a, b) => (a.price?.unit_price ?? Number.POSITIVE_INFINITY) - (b.price?.unit_price ?? Number.POSITIVE_INFINITY))[0];

      if (candidate?.price && candidate.price.unit_price < currentUnitPrice) {
        const savingsAmount = (currentUnitPrice - candidate.price.unit_price) * quantity;
        if (savingsAmount >= minSavings) {
          recommendations.push({
            id: `substitution-${item.material_id}-${candidate.material.id}`,
            type: "material_substitution",
            materialId: item.material_id,
            materialName,
            savingsAmount,
            savingsPercent: getSavingsPercent(savingsAmount, currentTotal),
            currentUnitPrice,
            targetUnitPrice: candidate.price.unit_price,
            quantity,
            unit: candidate.price.unit || item.unit,
            fromSupplier: currentSupplier,
            toSupplier: candidate.price.supplier_name,
            toMaterialId: candidate.material.id,
            toMaterialName: candidate.material.name_fi || candidate.material.name_en || candidate.material.name,
            link: candidate.price.link,
            stockLevel: candidate.price.stock_level,
            reason: material.substitution_group ? "same_substitution_group" : "same_functional_class",
          });
        }
      }
    }

    const bulk = getBulkDiscount(item, material);
    if (bulk) {
      const targetUnitPrice = currentUnitPrice * (1 - bulk.discount);
      const savingsAmount = (currentUnitPrice - targetUnitPrice) * quantity;
      if (savingsAmount >= minSavings) {
        recommendations.push({
          id: `bulk-${item.material_id}`,
          type: "bulk_discount",
          materialId: item.material_id,
          materialName,
          savingsAmount,
          savingsPercent: getSavingsPercent(savingsAmount, currentTotal),
          currentUnitPrice,
          targetUnitPrice,
          quantity,
          unit: item.unit,
          fromSupplier: currentSupplier,
          toSupplier: currentSupplier,
          link: item.link,
          stockLevel: item.stock_level,
          reason: `bulk_${bulk.threshold}_${Math.round(bulk.discount * 100)}`,
        });
      }
    }

    if (item.stock_level === "low_stock" || item.stock_level === "out_of_stock") {
      recommendations.push({
        id: `stock-${item.material_id}`,
        type: "seasonal_stock",
        materialId: item.material_id,
        materialName,
        savingsAmount: 0,
        savingsPercent: 0,
        currentUnitPrice,
        targetUnitPrice: currentUnitPrice,
        quantity,
        unit: item.unit,
        fromSupplier: currentSupplier,
        toSupplier: currentSupplier,
        link: item.link,
        stockLevel: item.stock_level,
        reason: item.stock_level === "out_of_stock" ? "out_of_stock" : "low_stock",
      });
    }
  }

  return recommendations.sort((a, b) => b.savingsAmount - a.savingsAmount);
}

export function sumSavings(recommendations: BomSavingRecommendation[]): number {
  const bestByMaterial = new Map<string, number>();
  for (const recommendation of recommendations) {
    if (recommendation.savingsAmount <= 0) continue;
    bestByMaterial.set(
      recommendation.materialId,
      Math.max(bestByMaterial.get(recommendation.materialId) ?? 0, recommendation.savingsAmount),
    );
  }
  return Array.from(bestByMaterial.values()).reduce((sum, amount) => sum + amount, 0);
}
