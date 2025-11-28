#pragma once

#include "raylib.h"
#include "manifold/manifold.h"

#include <cctype>
#include <filesystem>
#include <memory>
#include <optional>
#include <set>
#include <string>
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

// Scene object with optional color
struct ColoredObject {
  std::shared_ptr<manifold::Manifold> geometry;
  Color color;
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
