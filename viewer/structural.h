#pragma once

#include "types.h"

#include <string>
#include <vector>

namespace dingcad {

// Result of a single structural check
struct StructuralCheck {
  std::string memberName;
  std::string materialId;
  float actualSpan_mm;
  float maxAllowedSpan_mm;
  bool isOversized;              // true = span exceeds limit
  std::string suggestedMaterial; // Recommended upgrade
};

// Overall structural analysis result
struct StructuralAnalysisResult {
  std::vector<StructuralCheck> checks;
  int warningCount = 0;
  int errorCount = 0;
  bool allPassed = true;
};

// Analyze structural members for span violations
StructuralAnalysisResult AnalyzeStructure(
    const std::vector<ModelWithColor>& models,
    const MaterialLibrary& library,
    float sceneScale);

// Find a suitable material for the required span
std::string FindSuitableMaterial(
    const MaterialLibrary& library,
    float requiredSpan_mm,
    bool isVertical);

}  // namespace dingcad
