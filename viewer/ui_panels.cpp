#include "ui_panels.h"
#include "file_utils.h"

#define RAYGUI_IMPLEMENTATION
#include "raygui.h"

#include <cmath>
#include <cstdio>
#include <unordered_map>

namespace dingcad {

void DrawMaterialsPanel(const std::vector<MaterialItem>& materials,
                        UIState& uiState,
                        const Font& uiFont,
                        int screenWidth, int screenHeight) {
  if (materials.empty()) return;

  const float panelWidth = 320.0f;
  const float panelX = 10.0f;
  const float panelY = 50.0f;
  const float panelHeight = static_cast<float>(screenHeight) - 100.0f;
  const float rowHeight = 24.0f;
  const float headerHeight = 30.0f;
  const float sectionHeight = 26.0f;
  const float colorSwatchSize = 14.0f;
  const float footerHeight = 50.0f;
  const float scrollbarWidth = 8.0f;

  // Reset hover state at start of frame
  uiState.hoveredMaterialId.clear();

  Vector2 mousePos = GetMousePosition();

  // Calculate totals and content height
  std::unordered_map<std::string, float> categoryTotals;
  float totalCost = 0.0f;
  float contentHeight = 5.0f;  // Initial padding
  std::string prevCategory;
  for (const auto& mat : materials) {
    categoryTotals[mat.category] += mat.unitPrice * mat.quantity;
    totalCost += mat.unitPrice * mat.quantity;
    if (mat.category != prevCategory) {
      prevCategory = mat.category;
      contentHeight += 5.0f + sectionHeight;  // Category header
    }
    contentHeight += rowHeight;
  }

  // Scrollable area dimensions
  const float scrollAreaY = panelY + headerHeight;
  const float scrollAreaHeight = panelHeight - headerHeight - footerHeight;
  const float maxScroll = std::max(0.0f, contentHeight - scrollAreaHeight);

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

  // Handle mouse wheel scrolling when over panel
  Rectangle panelRect = {panelX, panelY, panelWidth, panelHeight};
  if (CheckCollisionPointRec(mousePos, panelRect)) {
    float wheel = GetMouseWheelMove();
    if (wheel != 0.0f) {
      uiState.materialScrollOffset -= wheel * 30.0f;
      uiState.materialScrollOffset = std::max(0.0f, std::min(uiState.materialScrollOffset, maxScroll));
    }
  }

  // Begin scissor mode for content clipping
  BeginScissorMode(static_cast<int>(panelX + 1), static_cast<int>(scrollAreaY + 1),
                   static_cast<int>(panelWidth - 2), static_cast<int>(scrollAreaHeight - 2));

  float yPos = scrollAreaY + 5.0f - uiState.materialScrollOffset;
  std::string currentCategory;

  for (const auto& mat : materials) {
    // Category header
    if (mat.category != currentCategory) {
      currentCategory = mat.category;
      yPos += 5.0f;

      // Only draw if visible
      if (yPos + sectionHeight > scrollAreaY && yPos < scrollAreaY + scrollAreaHeight) {
        DrawRectangle(static_cast<int>(panelX + 5), static_cast<int>(yPos),
                      static_cast<int>(panelWidth - 10 - scrollbarWidth), static_cast<int>(sectionHeight - 2),
                      Fade(LIGHTGRAY, 0.3f));

        char catHeader[128];
        snprintf(catHeader, sizeof(catHeader), "%s (%.0f EUR)",
                 toUpper(currentCategory).c_str(), categoryTotals[currentCategory]);
        DrawTextEx(uiFont, catHeader, {panelX + 10, yPos + 5}, 14.0f, 0.0f, DARKGRAY);
      }
      yPos += sectionHeight;
    }

    // Only process row if visible
    if (yPos + rowHeight > scrollAreaY && yPos < scrollAreaY + scrollAreaHeight) {
      // Check if mouse is over this row (only within scroll area)
      Rectangle rowRect = {panelX + 5, yPos, panelWidth - 10 - scrollbarWidth, rowHeight};
      bool isHovered = CheckCollisionPointRec(mousePos, rowRect) &&
                       mousePos.y >= scrollAreaY && mousePos.y < scrollAreaY + scrollAreaHeight;
      bool isSelected = !uiState.selectedMaterialId.empty() &&
                        uiState.selectedMaterialId == mat.materialId;

      // Highlight hovered/selected row
      if (isHovered || isSelected) {
        Color highlightColor = isSelected ? Fade(ORANGE, 0.25f) : Fade(SKYBLUE, 0.2f);
        DrawRectangleRec(rowRect, highlightColor);
        if (isHovered) {
          uiState.hoveredMaterialId = mat.materialId;
        }
      }

      // Handle click to select/open link
      if (isHovered && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
        if (uiState.selectedMaterialId == mat.materialId) {
          // Already selected - open link if available
          if (!mat.link.empty()) {
            std::string cmd = "open \"" + mat.link + "\"";
            system(cmd.c_str());
          }
          uiState.selectedMaterialId.clear();
        } else {
          uiState.selectedMaterialId = mat.materialId;
        }
      }

      // Color swatch
      float swatchX = panelX + 10;
      float swatchY = yPos + (rowHeight - colorSwatchSize) / 2.0f;
      DrawRectangle(static_cast<int>(swatchX), static_cast<int>(swatchY),
                    static_cast<int>(colorSwatchSize), static_cast<int>(colorSwatchSize),
                    mat.color);
      DrawRectangleLines(static_cast<int>(swatchX), static_cast<int>(swatchY),
                         static_cast<int>(colorSwatchSize), static_cast<int>(colorSwatchSize),
                         DARKGRAY);

      // Material name (after color swatch)
      std::string displayName = toUpper(mat.name);
      if (displayName.length() > 20) {
        displayName = displayName.substr(0, 17) + "...";
      }

      Color textColor = isHovered ? DARKBLUE : GRAY;
      DrawTextEx(uiFont, displayName.c_str(), {swatchX + colorSwatchSize + 6, yPos + 4}, 12.0f, 0.0f, textColor);

      // Quantity and price on right
      float lineTotal = mat.unitPrice * mat.quantity;
      char priceText[64];
      snprintf(priceText, sizeof(priceText), "%dX%.0f", mat.quantity, lineTotal);
      float priceWidth = MeasureTextEx(uiFont, priceText, 11.0f, 0.0f).x;
      DrawTextEx(uiFont, priceText, {panelX + panelWidth - priceWidth - 15 - scrollbarWidth, yPos + 5}, 11.0f, 0.0f, GRAY);
    }

    yPos += rowHeight;
  }

  EndScissorMode();

  // Draw scrollbar if content overflows
  if (maxScroll > 0.0f) {
    float scrollbarX = panelX + panelWidth - scrollbarWidth - 3;
    float scrollbarTrackY = scrollAreaY + 2;
    float scrollbarTrackHeight = scrollAreaHeight - 4;

    // Track
    DrawRectangle(static_cast<int>(scrollbarX), static_cast<int>(scrollbarTrackY),
                  static_cast<int>(scrollbarWidth), static_cast<int>(scrollbarTrackHeight),
                  Fade(LIGHTGRAY, 0.3f));

    // Thumb
    float thumbHeight = std::max(20.0f, scrollbarTrackHeight * (scrollAreaHeight / contentHeight));
    float thumbY = scrollbarTrackY + (scrollbarTrackHeight - thumbHeight) * (uiState.materialScrollOffset / maxScroll);
    DrawRectangle(static_cast<int>(scrollbarX), static_cast<int>(thumbY),
                  static_cast<int>(scrollbarWidth), static_cast<int>(thumbHeight),
                  Fade(GRAY, 0.6f));
  }

  // Footer area (total and hints)
  float footerY = panelY + panelHeight - footerHeight;
  DrawRectangle(static_cast<int>(panelX + 1), static_cast<int>(footerY),
                static_cast<int>(panelWidth - 2), static_cast<int>(footerHeight),
                Fade(RAYWHITE, 0.95f));
  DrawLine(static_cast<int>(panelX + 5), static_cast<int>(footerY + 5),
           static_cast<int>(panelX + panelWidth - 5), static_cast<int>(footerY + 5), DARKGRAY);

  char totalText[64];
  snprintf(totalText, sizeof(totalText), "TOTAL: %.2f EUR", totalCost);
  DrawTextEx(uiFont, totalText, {panelX + 10, footerY + 15}, 17.0f, 0.0f, DARKGRAY);

  // Hotkey hint and instructions
  DrawTextEx(uiFont, "[M] TOGGLE  SHIFT+CLICK 3D=SELECT",
             {panelX + 10, footerY + 35}, 10.0f, 0.0f, LIGHTGRAY);
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
