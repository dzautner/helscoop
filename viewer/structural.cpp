#include "structural.h"

#include <algorithm>
#include <cmath>

namespace dingcad {

StructuralAnalysisResult AnalyzeStructure(
    const std::vector<ModelWithColor>& models,
    const MaterialLibrary& library,
    float sceneScale) {

  StructuralAnalysisResult result;

  for (size_t i = 0; i < models.size(); ++i) {
    const auto& model = models[i];
    if (model.materialId.empty()) continue;

    const PBRMaterial* mat = library.get(model.materialId);
    if (!mat || mat->category != "lumber") continue;

    // Skip if no structural data
    if (mat->structural.maxSpan_floor_mm <= 0 &&
        mat->structural.maxSpan_wall_mm <= 0 &&
        mat->structural.maxSpan_rafter_mm <= 0) {
      continue;
    }

    // Get bounding box to estimate span
    BoundingBox bbox = GetModelBoundingBox(model.model);

    // Calculate dimensions in mm (reverse the scene scale)
    float dimX = (bbox.max.x - bbox.min.x) / sceneScale * 1000.0f;
    float dimY = (bbox.max.y - bbox.min.y) / sceneScale * 1000.0f;
    float dimZ = (bbox.max.z - bbox.min.z) / sceneScale * 1000.0f;

    // The span is the longest dimension
    float span = std::max({dimX, dimY, dimZ});

    // Determine member type by orientation
    // Vertical = wall stud, Horizontal = floor joist or rafter
    bool isVertical = dimY >= dimX && dimY >= dimZ;

    float maxSpan = 0;
    if (isVertical) {
      maxSpan = mat->structural.maxSpan_wall_mm;
    } else {
      // Use floor span as default for horizontal members
      maxSpan = mat->structural.maxSpan_floor_mm;
      if (maxSpan <= 0) {
        maxSpan = mat->structural.maxSpan_rafter_mm;
      }
    }

    // Skip if no applicable span limit
    if (maxSpan <= 0) continue;

    // Check if span exceeds limit
    if (span > maxSpan) {
      StructuralCheck check;
      check.memberName = mat->name;
      check.materialId = model.materialId;
      check.actualSpan_mm = span;
      check.maxAllowedSpan_mm = maxSpan;
      check.isOversized = true;
      check.suggestedMaterial = FindSuitableMaterial(library, span, isVertical);

      result.checks.push_back(check);
      result.warningCount++;
      result.allPassed = false;
    }
  }

  return result;
}

std::string FindSuitableMaterial(
    const MaterialLibrary& library,
    float requiredSpan_mm,
    bool isVertical) {

  float bestSpan = 0;
  std::string bestMaterial;

  for (const auto& [id, mat] : library.materials) {
    if (mat.category != "lumber") continue;

    float maxSpan = isVertical
        ? mat.structural.maxSpan_wall_mm
        : mat.structural.maxSpan_floor_mm;

    // Find the smallest material that still meets the requirement
    if (maxSpan >= requiredSpan_mm) {
      if (bestSpan == 0 || maxSpan < bestSpan) {
        bestSpan = maxSpan;
        bestMaterial = mat.name;
      }
    }
  }

  if (bestMaterial.empty()) {
    return "Consider engineered lumber (LVL, I-joist)";
  }
  return bestMaterial;
}

}  // namespace dingcad
