#include "thermal.h"
#include "material_loader.h"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <unordered_set>

namespace dingcad {

ThermalAnalysisResult CalculateThermalLoss(
    const std::vector<ModelWithColor>& models,
    const std::vector<MaterialItem>& materials,
    const MaterialLibrary& library,
    const ThermalSettings& settings) {

  ThermalAnalysisResult result;
  result.deltaT = settings.insideTemp - settings.outsideTemp;
  result.totalHeatLoss_W = 0.0f;
  result.totalUA = 0.0f;
  result.minHeatFlux = std::numeric_limits<float>::max();
  result.maxHeatFlux = 0.0f;

  // Build a map of materialId -> total surface area from all MaterialItems
  // Each MaterialItem has its own surfaceArea, so we sum them by materialId
  std::unordered_map<std::string, float> areaByMaterial;
  for (const auto& mat : materials) {
    if (!mat.materialId.empty()) {
      areaByMaterial[mat.materialId] += mat.surfaceArea;
    }
  }

  // Process each UNIQUE materialId once (not each model!)
  // This avoids the bug of counting the same material's area multiple times
  std::unordered_set<std::string> processedMaterials;

  for (size_t i = 0; i < models.size(); ++i) {
    const auto& model = models[i];

    // Skip models without material reference
    if (model.materialId.empty()) continue;

    // Skip if we already processed this materialId
    if (processedMaterials.count(model.materialId) > 0) continue;
    processedMaterials.insert(model.materialId);

    // Get material from library
    const PBRMaterial* mat = library.get(model.materialId);
    if (!mat) continue;

    // Only count ENVELOPE materials for thermal calculations
    // Skip structural elements (lumber), finishes (paint), hardware, fasteners, etc.
    // These are either inside the wall cavity or don't form the thermal barrier
    const std::string& category = mat->category;
    bool isEnvelopeMaterial = (category == "sheathing" ||
                               category == "roofing" ||
                               category == "insulation" ||
                               category == "masonry");
    if (!isEnvelopeMaterial) continue;

    // Get the TOTAL area for this material (summed from all objects using it)
    float area_m2 = 0.0f;
    auto it = areaByMaterial.find(model.materialId);
    if (it != areaByMaterial.end()) {
      area_m2 = it->second;
    }

    // Skip if no area
    if (area_m2 <= 0.0f) continue;

    // Calculate thermal resistance
    // R_total = R_si + R_material + R_cavity + R_se
    float R_material = mat->thermal.getRValue();

    // For sheathing materials (walls), add cavity R-value
    // Wall() primitive creates framed walls with cavities - assume basic insulation
    // Air gap (uninsulated): ~0.18 m²·K/W
    // 100mm mineral wool: ~2.86 m²·K/W (0.1m / 0.035 W/mK)
    // We'll assume a conservatively insulated cavity (~2.0 m²·K/W)
    float R_cavity = 0.0f;
    if (category == "sheathing") {
      R_cavity = 2.0f;  // Assume wall cavity has ~100mm basic insulation
    }

    float R_total = settings.surfaceRInside + R_material + R_cavity + settings.surfaceROutside;

    // U-value (thermal transmittance)
    float U = 1.0f / R_total;

    // Heat flow: Q = U * A * deltaT
    float Q = U * area_m2 * result.deltaT;

    // Heat flux density: q = U * deltaT (W/m2)
    float q = U * result.deltaT;

    // Create surface thermal data
    SurfaceThermalData surface;
    surface.objectIndex = i;  // First object index with this material
    surface.materialId = model.materialId;
    surface.area_m2 = area_m2;
    surface.rValue = R_total;
    surface.uValue = U;
    surface.heatFlow_W = Q;
    surface.heatFluxDensity = q;

    result.surfaces.push_back(surface);
    result.totalHeatLoss_W += Q;
    result.totalUA += U * area_m2;  // Accumulate UA coefficient

    // Track min/max for color scaling
    result.minHeatFlux = std::min(result.minHeatFlux, q);
    result.maxHeatFlux = std::max(result.maxHeatFlux, q);
  }

  // Handle case where no surfaces were found
  if (result.minHeatFlux == std::numeric_limits<float>::max()) {
    result.minHeatFlux = 0.0f;
    result.maxHeatFlux = 100.0f;  // Default scale
  }

  // Ensure some range for color mapping
  if (result.maxHeatFlux - result.minHeatFlux < 10.0f) {
    result.maxHeatFlux = result.minHeatFlux + 100.0f;
  }

  result.heatingPower_kW = result.totalHeatLoss_W / 1000.0f;

  // Calculate equilibrium temperature and heat balance
  result.totalHeatInput_W = settings.GetTotalHeatInput_W();

  // Heat balance: positive = warming up, negative = cooling down
  result.heatBalance_W = result.totalHeatInput_W - result.totalHeatLoss_W;

  // Equilibrium temperature: T_inside = T_outside + Q_source / UA
  // At equilibrium, heat input equals heat loss: Q_in = UA * (T_in - T_out)
  // So: T_in = T_out + Q_in / UA
  if (result.totalUA > 0.0f) {
    result.equilibriumTemp = settings.outsideTemp + result.totalHeatInput_W / result.totalUA;
  } else {
    result.equilibriumTemp = settings.outsideTemp;  // No insulation = outside temp
  }

  return result;
}

Color HeatFluxToColor(float heatFlux, float minFlux, float maxFlux) {
  // Normalize to 0-1 range
  float range = maxFlux - minFlux;
  if (range <= 0.0f) range = 1.0f;

  float t = (heatFlux - minFlux) / range;
  t = std::clamp(t, 0.0f, 1.0f);

  // Color gradient: Blue (cold/good) -> Cyan -> Green -> Yellow -> Red (hot/bad)
  // This is a typical "jet" colormap

  unsigned char r, g, b;

  if (t < 0.25f) {
    // Blue to Cyan
    float s = t * 4.0f;
    r = 0;
    g = static_cast<unsigned char>(s * 255);
    b = 255;
  } else if (t < 0.5f) {
    // Cyan to Green
    float s = (t - 0.25f) * 4.0f;
    r = 0;
    g = 255;
    b = static_cast<unsigned char>((1.0f - s) * 255);
  } else if (t < 0.75f) {
    // Green to Yellow
    float s = (t - 0.5f) * 4.0f;
    r = static_cast<unsigned char>(s * 255);
    g = 255;
    b = 0;
  } else {
    // Yellow to Red
    float s = (t - 0.75f) * 4.0f;
    r = 255;
    g = static_cast<unsigned char>((1.0f - s) * 255);
    b = 0;
  }

  return Color{r, g, b, 255};
}

const char* GetHeatLossDescription(float heatFlux_W_per_m2) {
  if (heatFlux_W_per_m2 < 20.0f) {
    return "Excellent (well insulated)";
  } else if (heatFlux_W_per_m2 < 40.0f) {
    return "Good insulation";
  } else if (heatFlux_W_per_m2 < 80.0f) {
    return "Moderate heat loss";
  } else if (heatFlux_W_per_m2 < 150.0f) {
    return "Poor insulation";
  } else {
    return "Severe heat loss";
  }
}

}  // namespace dingcad
