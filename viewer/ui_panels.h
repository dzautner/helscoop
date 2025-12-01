#pragma once

#include "types.h"
#include "thermal.h"
#include "structural.h"
#include "raylib.h"

#include <filesystem>
#include <string>
#include <vector>

namespace dingcad {

// Panel position for draggable panels
struct PanelPos {
  float x = 0.0f;
  float y = 0.0f;
  bool initialized = false;
};

// UI state container
struct UIState {
  bool showParametersPanel = true;
  bool showMaterialsPanel = true;
  bool showThermalPanel = false;
  bool showStructuralPanel = false;
  bool thermalViewEnabled = false;
  bool liveUpdatesEnabled = true;
  int draggingParamIndex = -1;
  float draggingStartValue = 0.0f;

  // Toolbar (always visible)
  bool showToolbar = true;

  // Material hover/selection state
  std::string hoveredMaterialId;   // Material being hovered in panel
  std::string selectedMaterialId;  // Material clicked/selected (persistent)

  // Scroll offsets for panels
  float materialScrollOffset = 0.0f;
  float parameterScrollOffset = 0.0f;

  // Material search/filter
  char materialFilterText[64] = "";
  bool materialFilterActive = false;

  // Thermal settings (user-adjustable)
  ThermalSettings thermalSettings;

  // Draggable panel positions
  PanelPos materialsPos;
  PanelPos parametersPos;
  PanelPos thermalPos;
  PanelPos structuralPos;

  // Panel dragging state
  int draggingPanel = -1;  // -1=none, 0=materials, 1=params, 2=thermal, 3=structural
  Vector2 dragOffset = {0, 0};

  // Export button clicks (set by toolbar, cleared by main after handling)
  bool stlExportClicked = false;
  bool ifcExportClicked = false;
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

// Draw thermal analysis panel (bottom left when enabled)
// Returns true if thermal settings were modified (need recalculation)
bool DrawThermalPanel(const ThermalAnalysisResult& thermalResult,
                      UIState& uiState,
                      const Font& uiFont,
                      int screenWidth, int screenHeight);

// Draw a color scale legend for thermal view
void DrawThermalLegend(float minFlux, float maxFlux,
                       const Font& uiFont,
                       int screenWidth, int screenHeight);

// Draw structural analysis panel
void DrawStructuralPanel(const StructuralAnalysisResult& structResult,
                         UIState& uiState,
                         const Font& uiFont,
                         int screenWidth, int screenHeight);

// Draw toolbar at top of screen with panel toggles
// Returns true if any toggle was clicked (for status updates)
bool DrawToolbar(UIState& uiState,
                 const Font& uiFont,
                 int screenWidth,
                 const std::string& statusMessage);

// Toolbar height constant for panel positioning
inline constexpr float kToolbarHeight = 42.0f;

}  // namespace dingcad
