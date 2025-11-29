#pragma once

#include "types.h"
#include "raylib.h"

#include <filesystem>
#include <string>
#include <vector>

namespace dingcad {

// UI state container
struct UIState {
  bool showParametersPanel = true;
  bool showMaterialsPanel = true;
  bool liveUpdatesEnabled = true;
  int draggingParamIndex = -1;
  float draggingStartValue = 0.0f;

  // Material hover/selection state
  std::string hoveredMaterialId;   // Material being hovered in panel
  std::string selectedMaterialId;  // Material clicked/selected (persistent)

  // Scroll offsets for panels
  float materialScrollOffset = 0.0f;
  float parameterScrollOffset = 0.0f;

  // Material search/filter
  char materialFilterText[64] = "";
  bool materialFilterActive = false;
};

// Draw materials panel on left side (updates uiState.hoveredMaterialId)
void DrawMaterialsPanel(const std::vector<MaterialItem>& materials,
                        UIState& uiState,
                        const Font& uiFont,
                        int screenWidth, int screenHeight);

// Draw parameters panel on right side (returns true if a parameter was modified)
bool DrawParametersPanel(std::vector<SceneParameter>& parameters,
                         UIState& state,
                         const Font& uiFont,
                         int screenWidth, int screenHeight,
                         bool loadingInBackground,
                         const std::filesystem::path& scriptPath);

// Check if mouse is over any UI panel
bool IsMouseOverPanels(const std::vector<MaterialItem>& materials,
                       const std::vector<SceneParameter>& parameters,
                       bool showMaterialsPanel,
                       bool showParametersPanel,
                       int screenWidth, int screenHeight);

}  // namespace dingcad
