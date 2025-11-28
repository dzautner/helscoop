#include "ui_panels.h"
#include "file_utils.h"

#define RAYGUI_IMPLEMENTATION
#include "raygui.h"

#include <cmath>
#include <cstdio>
#include <unordered_map>

namespace dingcad {

void DrawMaterialsPanel(const std::vector<MaterialItem>& materials,
                        const Font& uiFont,
                        int screenWidth, int screenHeight) {
  if (materials.empty()) return;

  const float panelWidth = 320.0f;
  const float panelX = 10.0f;
  const float panelY = 50.0f;
  const float panelHeight = static_cast<float>(screenHeight) - 100.0f;
  const float rowHeight = 22.0f;
  const float headerHeight = 30.0f;
  const float sectionHeight = 26.0f;

  // Panel background
  DrawRectangle(static_cast<int>(panelX), static_cast<int>(panelY),
                static_cast<int>(panelWidth), static_cast<int>(panelHeight),
                Fade(RAYWHITE, 0.95f));
  DrawRectangleLines(static_cast<int>(panelX), static_cast<int>(panelY),
                     static_cast<int>(panelWidth), static_cast<int>(panelHeight), DARKGRAY);

  // Title
  DrawTextEx(uiFont, "MATERIALS & PRICING", {panelX + 10, panelY + 8}, 19.0f, 0.0f, DARKGRAY);
  DrawLine(static_cast<int>(panelX + 5), static_cast<int>(panelY + headerHeight),
           static_cast<int>(panelX + panelWidth - 5), static_cast<int>(panelY + headerHeight), LIGHTGRAY);

  float yPos = panelY + headerHeight + 5.0f;
  std::string currentCategory;
  float totalCost = 0.0f;

  // Calculate totals by category
  std::unordered_map<std::string, float> categoryTotals;
  for (const auto& mat : materials) {
    categoryTotals[mat.category] += mat.unitPrice * mat.quantity;
    totalCost += mat.unitPrice * mat.quantity;
  }

  for (const auto& mat : materials) {
    if (yPos > panelY + panelHeight - 50.0f) break;

    // Category header
    if (mat.category != currentCategory) {
      currentCategory = mat.category;
      yPos += 5.0f;
      DrawRectangle(static_cast<int>(panelX + 5), static_cast<int>(yPos),
                    static_cast<int>(panelWidth - 10), static_cast<int>(sectionHeight - 2),
                    Fade(LIGHTGRAY, 0.3f));

      char catHeader[128];
      snprintf(catHeader, sizeof(catHeader), "%s (%.0f EUR)",
               toUpper(currentCategory).c_str(), categoryTotals[currentCategory]);
      DrawTextEx(uiFont, catHeader, {panelX + 10, yPos + 5}, 14.0f, 0.0f, DARKGRAY);
      yPos += sectionHeight;
    }

    // Material row
    char rowText[256];
    float lineTotal = mat.unitPrice * mat.quantity;
    snprintf(rowText, sizeof(rowText), "  %s", mat.name.c_str());

    std::string displayName = toUpper(rowText);
    if (displayName.length() > 28) {
      displayName = displayName.substr(0, 25) + "...";
    }

    DrawTextEx(uiFont, displayName.c_str(), {panelX + 8, yPos + 2}, 12.0f, 0.0f, GRAY);

    // Quantity and price on right
    char priceText[64];
    snprintf(priceText, sizeof(priceText), "%d X %.2f = %.0f EUR",
             mat.quantity, mat.unitPrice, lineTotal);
    float priceWidth = MeasureTextEx(uiFont, priceText, 12.0f, 0.0f).x;
    DrawTextEx(uiFont, priceText, {panelX + panelWidth - priceWidth - 15, yPos + 2}, 12.0f, 0.0f, GRAY);

    yPos += rowHeight;
  }

  // Total at bottom
  DrawLine(static_cast<int>(panelX + 5), static_cast<int>(panelY + panelHeight - 35),
           static_cast<int>(panelX + panelWidth - 5), static_cast<int>(panelY + panelHeight - 35), DARKGRAY);
  char totalText[64];
  snprintf(totalText, sizeof(totalText), "TOTAL: %.2f EUR", totalCost);
  DrawTextEx(uiFont, totalText, {panelX + 10, panelY + panelHeight - 25}, 17.0f, 0.0f, DARKGRAY);

  // Hotkey hint
  DrawTextEx(uiFont, "[M] TOGGLE", {panelX + panelWidth - 85, panelY + panelHeight - 18}, 12.0f, 0.0f, LIGHTGRAY);
}

bool DrawParametersPanel(std::vector<SceneParameter>& parameters,
                         UIState& state,
                         const Font& uiFont,
                         int screenWidth, int screenHeight,
                         bool loadingInBackground,
                         const std::filesystem::path& scriptPath) {
  if (parameters.empty()) return false;

  const float panelWidth = 280.0f;
  const float panelX = static_cast<float>(screenWidth) - panelWidth - 10.0f;
  const float panelY = 50.0f;
  const float panelHeight = static_cast<float>(screenHeight) - 100.0f;
  const float rowHeight = 28.0f;
  const float headerHeight = 30.0f;
  const float sectionHeight = 24.0f;
  const float sliderHeight = 16.0f;

  // Panel background
  DrawRectangle(static_cast<int>(panelX), static_cast<int>(panelY),
                static_cast<int>(panelWidth), static_cast<int>(panelHeight),
                Fade(RAYWHITE, 0.95f));
  DrawRectangleLines(static_cast<int>(panelX), static_cast<int>(panelY),
                     static_cast<int>(panelWidth), static_cast<int>(panelHeight), DARKGRAY);

  // Title
  DrawTextEx(uiFont, "PARAMETERS", {panelX + 10, panelY + 8}, 19.0f, 0.0f, DARKGRAY);
  DrawLine(static_cast<int>(panelX + 5), static_cast<int>(panelY + headerHeight),
           static_cast<int>(panelX + panelWidth - 5), static_cast<int>(panelY + headerHeight), LIGHTGRAY);

  float yPos = panelY + headerHeight + 5.0f;
  std::string currentSection;

  // Live updates checkbox
  Rectangle checkboxRect = {panelX + panelWidth - 100, panelY + 8, 14, 14};
  GuiCheckBox(checkboxRect, "Live", &state.liveUpdatesEnabled);

  for (size_t i = 0; i < parameters.size(); ++i) {
    if (yPos > panelY + panelHeight - 30.0f) break;

    auto& param = parameters[i];

    // Section header
    if (param.section != currentSection) {
      currentSection = param.section;
      yPos += 5.0f;
      DrawRectangle(static_cast<int>(panelX + 5), static_cast<int>(yPos),
                    static_cast<int>(panelWidth - 10), static_cast<int>(sectionHeight - 2),
                    Fade(LIGHTGRAY, 0.3f));
      DrawTextEx(uiFont, toUpper(currentSection).c_str(), {panelX + 10, yPos + 5}, 13.0f, 0.0f, DARKGRAY);
      yPos += sectionHeight;
    }

    // Parameter label
    DrawTextEx(uiFont, toUpper(param.displayName).c_str(), {panelX + 10, yPos}, 12.0f, 0.0f, GRAY);

    // Value display
    char valueText[32];
    if (param.name == "nest_boxes") {
      snprintf(valueText, sizeof(valueText), "%d", static_cast<int>(param.value));
    } else if (param.name == "roof_pitch_deg") {
      snprintf(valueText, sizeof(valueText), "%.0f DEG", param.value);
    } else {
      snprintf(valueText, sizeof(valueText), "%.0f MM", param.value);
    }
    float valueWidth = MeasureTextEx(uiFont, valueText, 12.0f, 0.0f).x;
    DrawTextEx(uiFont, valueText, {panelX + panelWidth - valueWidth - 15, yPos}, 12.0f, 0.0f, DARKGRAY);

    yPos += 12.0f;

    // Slider
    Rectangle sliderRect = {panelX + 10, yPos, panelWidth - 25, sliderHeight};
    float oldValue = param.value;
    GuiSlider(sliderRect, "", "", &param.value, param.minValue, param.maxValue);

    // Round to integer
    param.value = std::round(param.value);

    // Track dragging state
    if (param.value != oldValue && state.draggingParamIndex == -1) {
      state.draggingParamIndex = static_cast<int>(i);
      state.draggingStartValue = oldValue;
    }

    yPos += rowHeight;
  }

  // Only write to file when mouse is released
  bool paramWritten = false;
  if (state.draggingParamIndex >= 0 && IsMouseButtonReleased(MOUSE_BUTTON_LEFT)) {
    auto& param = parameters[state.draggingParamIndex];
    if (param.value != state.draggingStartValue && !loadingInBackground) {
      if (WriteParameterToFile(scriptPath, param)) {
        paramWritten = true;
      }
    }
    state.draggingParamIndex = -1;
  }

  // Hotkey hint
  DrawTextEx(uiFont, "[T] TOGGLE", {panelX + panelWidth - 85, panelY + panelHeight - 18}, 12.0f, 0.0f, LIGHTGRAY);

  return paramWritten;
}

bool IsMouseOverPanels(const std::vector<MaterialItem>& materials,
                       const std::vector<SceneParameter>& parameters,
                       bool showMaterialsPanel,
                       bool showParametersPanel,
                       int screenWidth, int screenHeight) {
  Vector2 mousePos = GetMousePosition();

  // Materials panel bounds
  if (showMaterialsPanel && !materials.empty()) {
    Rectangle matPanel = {10.0f, 10.0f, 320.0f, static_cast<float>(screenHeight) - 20.0f};
    if (CheckCollisionPointRec(mousePos, matPanel)) {
      return true;
    }
  }

  // Parameters panel bounds
  if (showParametersPanel && !parameters.empty()) {
    float paramPanelWidth = 280.0f;
    float paramPanelX = static_cast<float>(screenWidth) - paramPanelWidth - 10.0f;
    Rectangle paramPanel = {paramPanelX, 10.0f, paramPanelWidth, static_cast<float>(screenHeight) - 20.0f};
    if (CheckCollisionPointRec(mousePos, paramPanel)) {
      return true;
    }
  }

  return false;
}

}  // namespace dingcad
