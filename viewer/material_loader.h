#pragma once

#include "types.h"

#include <filesystem>
#include <optional>

namespace dingcad {

// Load material library from JSON file
std::optional<MaterialLibrary> LoadMaterialLibrary(const std::filesystem::path& jsonPath);

// Get default material library path relative to executable
std::filesystem::path GetDefaultMaterialLibraryPath();

// Global material library (loaded once at startup)
extern MaterialLibrary g_materialLibrary;

// Initialize global material library
bool InitMaterialLibrary(const std::filesystem::path& basePath);

}  // namespace dingcad
