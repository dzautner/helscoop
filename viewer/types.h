#pragma once

#include "raylib.h"
#include "manifold/manifold.h"

#include <array>
#include <cctype>
#include <filesystem>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

namespace dingcad {

// UI constants
inline const Color kBaseColor = {210, 210, 220, 255};
inline const char* kBrandText = "HELSCOOP";
inline constexpr float kBrandFontSize = 34.0f;
inline constexpr int kUIFontSize = 48;
inline constexpr float kSceneScale = 0.1f;

// Helper to convert string to uppercase
inline std::string toUpper(const std::string& s) {
  std::string result = s;
  for (char& c : result) {
    c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  }
  return result;
}

// Simple 3D vector for mesh operations
struct Vec3f {
  float x, y, z;
};

// PBR Visual properties for materials
struct PBRVisual {
  std::array<float, 3> albedo = {0.8f, 0.8f, 0.8f};  // RGB [0-1]
  float roughness = 0.5f;                             // [0-1]
  float metallic = 0.0f;                              // [0-1]
  std::string albedoTexture;                          // Path to texture (future)
  std::string normalTexture;                          // Path to normal map (future)

  // Convert to raylib Color
  Color toColor() const {
    return Color{
      static_cast<unsigned char>(albedo[0] * 255.0f),
      static_cast<unsigned char>(albedo[1] * 255.0f),
      static_cast<unsigned char>(albedo[2] * 255.0f),
      255
    };
  }
};

// Pricing info for BOM generation
struct PBRPricing {
  std::string unit;
  float unitPrice = 0.0f;
  std::string supplier;
  std::string link;
};

// Full PBR material definition
struct PBRMaterial {
  std::string id;
  std::string name;
  std::string category;
  std::vector<std::string> tags;
  PBRVisual visual;
  PBRPricing pricing;
};

// Material library loaded from JSON
struct MaterialLibrary {
  std::unordered_map<std::string, PBRMaterial> materials;
  std::filesystem::path basePath;

  const PBRMaterial* get(const std::string& id) const {
    auto it = materials.find(id);
    return it != materials.end() ? &it->second : nullptr;
  }
};

// Scene object with optional color and material reference
struct ColoredObject {
  std::shared_ptr<manifold::Manifold> geometry;
  Color color;
  std::string materialId;  // Optional reference to material library
  int quantity = 1;        // For BOM calculation
};

// Collection of scene objects
struct SceneData {
  std::vector<ColoredObject> objects;
};

// Raylib model with associated color
struct ModelWithColor {
  Model model;
  Color color;
};

// Module loader state for QuickJS
struct ModuleLoaderData {
  std::filesystem::path baseDir;
  std::set<std::filesystem::path> dependencies;
};

// Editable scene parameter (parsed from JS file)
struct SceneParameter {
  std::string name;
  std::string displayName;
  std::string section;
  float value;
  float minValue;
  float maxValue;
  int lineNumber;
};

// Material item for cost estimation
struct MaterialItem {
  std::string name;
  std::string category;
  std::string link;
  std::string unit;
  float unitPrice = 0.0f;
  int quantity = 0;
};

// File watch state
struct WatchedFile {
  std::optional<std::filesystem::file_time_type> timestamp;
};

// Result of loading a scene from JS
struct LoadResult {
  bool success = false;
  SceneData sceneData;
  std::string message;
  std::vector<std::filesystem::path> dependencies;
  std::vector<MaterialItem> materials;
};

// Pre-computed mesh for GPU upload
struct PrecomputedMesh {
  manifold::MeshGL meshGL;
  Color color;
};

// Result of background loading (JS eval + CSG + tessellation)
struct BackgroundLoadResult {
  bool success = false;
  std::string message;
  SceneData sceneData;
  std::vector<PrecomputedMesh> meshes;
  std::vector<std::filesystem::path> dependencies;
  std::vector<MaterialItem> materials;
};

}  // namespace dingcad
