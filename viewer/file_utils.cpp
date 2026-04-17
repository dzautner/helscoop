#include "file_utils.h"

#include <array>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <regex>
#include <sstream>

namespace dingcad {

std::optional<std::string> ReadTextFile(const std::filesystem::path& path) {
  std::ifstream file(path);
  if (!file) return std::nullopt;
  std::ostringstream ss;
  ss << file.rdbuf();
  return ss.str();
}

std::optional<std::filesystem::path> FindDefaultScene() {
  auto cwdCandidate = std::filesystem::current_path() / "scene.js";
  if (std::filesystem::exists(cwdCandidate)) return cwdCandidate;
  if (const char* home = std::getenv("HOME")) {
    std::filesystem::path homeCandidate = std::filesystem::path(home) / "scene.js";
    if (std::filesystem::exists(homeCandidate)) return homeCandidate;
  }
  return std::nullopt;
}

namespace {

Vec3f FetchVertex(const manifold::MeshGL& mesh, uint32_t index) {
  const size_t offset = static_cast<size_t>(index) * mesh.numProp;
  return {
    static_cast<float>(mesh.vertProperties[offset + 0]),
    static_cast<float>(mesh.vertProperties[offset + 1]),
    static_cast<float>(mesh.vertProperties[offset + 2])
  };
}

Vec3f Subtract(const Vec3f& a, const Vec3f& b) {
  return {a.x - b.x, a.y - b.y, a.z - b.z};
}

Vec3f Cross(const Vec3f& a, const Vec3f& b) {
  return {
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  };
}

Vec3f Normalize(const Vec3f& v) {
  const float lenSq = v.x * v.x + v.y * v.y + v.z * v.z;
  if (lenSq <= 0.0f) return {0.0f, 0.0f, 0.0f};
  const float invLen = 1.0f / std::sqrt(lenSq);
  return {v.x * invLen, v.y * invLen, v.z * invLen};
}

}  // namespace

bool WriteMeshAsBinaryStl(const manifold::MeshGL& mesh,
                          const std::filesystem::path& path,
                          std::string& error) {
  const uint32_t triCount = static_cast<uint32_t>(mesh.NumTri());
  if (triCount == 0) {
    error = "Export failed: mesh is empty";
    return false;
  }

  std::ofstream out(path, std::ios::binary);
  if (!out) {
    error = "Export failed: cannot open " + path.string();
    return false;
  }

  std::array<char, 80> header{};
  constexpr const char kHeader[] = "dingcad export";
  std::memcpy(header.data(), kHeader, std::min(header.size(), std::strlen(kHeader)));
  out.write(header.data(), header.size());
  out.write(reinterpret_cast<const char*>(&triCount), sizeof(uint32_t));

  for (uint32_t tri = 0; tri < triCount; ++tri) {
    const uint32_t i0 = mesh.triVerts[tri * 3 + 0];
    const uint32_t i1 = mesh.triVerts[tri * 3 + 1];
    const uint32_t i2 = mesh.triVerts[tri * 3 + 2];

    const Vec3f v0 = FetchVertex(mesh, i0);
    const Vec3f v1 = FetchVertex(mesh, i1);
    const Vec3f v2 = FetchVertex(mesh, i2);

    const Vec3f normal = Normalize(Cross(Subtract(v1, v0), Subtract(v2, v0)));

    out.write(reinterpret_cast<const char*>(&normal), sizeof(Vec3f));
    out.write(reinterpret_cast<const char*>(&v0), sizeof(Vec3f));
    out.write(reinterpret_cast<const char*>(&v1), sizeof(Vec3f));
    out.write(reinterpret_cast<const char*>(&v2), sizeof(Vec3f));
    const uint16_t attr = 0;
    out.write(reinterpret_cast<const char*>(&attr), sizeof(uint16_t));
  }

  if (!out) {
    error = "Export failed: write error";
    return false;
  }

  return true;
}

std::vector<SceneParameter> ParseSceneParameters(const std::filesystem::path& path) {
  std::vector<SceneParameter> params;

  auto source = ReadTextFile(path);
  if (!source) return params;

  // Check for re-export pattern: export { ... } from './path/to/file.js'
  // Or import pattern: import { ... } from './path/to/file.js'
  // If found, parse that file instead (it contains the actual parameter definitions)
  std::regex reexportRegex(R"((export|import)\s*\{[^}]*\}\s*from\s*['\"]([^'\"]+)['\"])");
  std::smatch match;
  if (std::regex_search(*source, match, reexportRegex)) {
    std::string importPath = match[2].str();  // Changed from match[1] to match[2] due to extra group
    std::filesystem::path resolvedPath = path.parent_path() / importPath;
    if (std::filesystem::exists(resolvedPath)) {
      source = ReadTextFile(resolvedPath);
      if (!source) return params;
    }
  }

  struct ParamDef {
    const char* name;
    const char* displayName;
    const char* section;
    float minVal;
    float maxVal;
  };

  const std::vector<ParamDef> knownParams = {
    // Coop Dimensions
    {"coop_len", "Coop Length", "Coop Dimensions", 1500, 6000},
    {"coop_w", "Coop Width", "Coop Dimensions", 1500, 6000},
    {"wall_h", "Wall Height", "Coop Dimensions", 1500, 3000},
    // Roof
    {"roof_pitch_deg", "Roof Pitch", "Roof", 15, 45},
    {"overhang", "Overhang", "Roof", 50, 400},
    // Doors
    {"door_w", "Door Width", "Doors", 500, 1000},
    {"door_h", "Door Height", "Doors", 1200, 2200},
    {"pop_w", "Pop Door Width", "Doors", 150, 400},
    {"pop_opening_h", "Pop Opening Height", "Doors", 200, 500},
    // Nesting Boxes
    {"nest_boxes", "Number of Boxes", "Nesting Boxes", 1, 6},
    {"nest_box_w", "Box Width", "Nesting Boxes", 200, 500},
    {"nest_box_d", "Box Depth", "Nesting Boxes", 300, 600},
    {"nest_box_h", "Box Height", "Nesting Boxes", 250, 500},
    {"nest_height_off_floor", "Height Off Floor", "Nesting Boxes", 100, 600},
    // Visibility Toggles
    {"show_cladding", "Show Cladding", "Visibility", 0, 1},
    {"show_roof", "Show Roof", "Visibility", 0, 1},
    {"show_walls", "Show Wall Framing", "Visibility", 0, 1},
    {"show_floor", "Show Floor", "Visibility", 0, 1},
    {"show_insulation", "Show Insulation", "Visibility", 0, 1},
    {"show_run", "Show Chicken Run", "Visibility", 0, 1},
    {"show_tunnel", "Show Tunnel", "Visibility", 0, 1},
    {"show_interior", "Show Interior", "Visibility", 0, 1},
    {"show_chickens", "Show Chickens", "Visibility", 0, 1},
    // Door Angles
    {"human_door_angle", "Human Door", "Door Angles", 0, 120},
    {"nest_lid_angle", "Nest Box Lid", "Door Angles", 0, 90},
    {"tunnel_door_angle", "Tunnel Door", "Door Angles", 0, 90},
    {"run_gate_angle", "Run Gate", "Door Angles", 0, 120},
    // Energy & Heating
    {"electricity_price", "Price c/kWh", "Energy", 5, 50},
    {"heater_power", "Heater Watts", "Energy", 100, 2000},
    {"chicken_body_heat", "Heat/Chicken W", "Energy", 5, 15},
    {"num_chickens_for_heat", "Num Chickens", "Energy", 0, 20},
    // Exterior Colors (0=Yellow, 1=Falu Red, 2=Gray, 3=Blue, 4=Green, 5=White)
    {"cladding_color", "Cladding Color", "Exterior", 0, 5},
  };

  std::istringstream stream(*source);
  std::string line;
  int lineNum = 0;

  while (std::getline(stream, line)) {
    lineNum++;

    for (const auto& def : knownParams) {
      std::string pattern = std::string("const ") + def.name + " = ";
      size_t pos = line.find(pattern);
      if (pos != std::string::npos) {
        size_t valueStart = pos + pattern.length();
        size_t valueEnd = line.find(';', valueStart);
        if (valueEnd != std::string::npos) {
          std::string valueStr = line.substr(valueStart, valueEnd - valueStart);
          valueStr.erase(0, valueStr.find_first_not_of(" \t"));
          valueStr.erase(valueStr.find_last_not_of(" \t") + 1);

          try {
            float value = std::stof(valueStr);
            params.push_back({
              def.name,
              def.displayName,
              def.section,
              value,
              def.minVal,
              def.maxVal,
              lineNum
            });
          } catch (...) {
            // Skip non-numeric values
          }
        }
        break;
      }
    }
  }

  return params;
}

bool WriteParameterToFile(const std::filesystem::path& path, const SceneParameter& param) {
  // First check if this file re-exports from another file
  auto source = ReadTextFile(path);
  if (!source) {
    std::cerr << "WriteParameterToFile: Failed to read " << path << std::endl;
    return false;
  }

  std::filesystem::path actualPath = path;

  // Check for re-export or import pattern
  std::regex reexportRegex(R"((export|import)\s*\{[^}]*\}\s*from\s*['\"]([^'\"]+)['\"])");
  std::smatch match;
  if (std::regex_search(*source, match, reexportRegex)) {
    std::string importPath = match[2].str();
    std::filesystem::path resolvedPath = path.parent_path() / importPath;
    std::cerr << "WriteParameterToFile: Found import, resolved to " << resolvedPath << std::endl;
    if (std::filesystem::exists(resolvedPath)) {
      actualPath = resolvedPath;
      source = ReadTextFile(actualPath);
      if (!source) {
        std::cerr << "WriteParameterToFile: Failed to read resolved file" << std::endl;
        return false;
      }
    } else {
      std::cerr << "WriteParameterToFile: Resolved file does not exist" << std::endl;
    }
  } else {
    std::cerr << "WriteParameterToFile: No import pattern found in " << path << std::endl;
  }

  std::ostringstream result;
  std::istringstream stream(*source);
  std::string line;
  int lineNum = 0;

  while (std::getline(stream, line)) {
    lineNum++;
    if (lineNum == param.lineNumber) {
      std::string pattern = std::string("const ") + param.name + " = ";
      size_t pos = line.find(pattern);
      if (pos != std::string::npos) {
        size_t valueStart = pos + pattern.length();
        size_t valueEnd = line.find(';', valueStart);
        if (valueEnd != std::string::npos) {
          std::ostringstream newValue;
          float intpart;
          if (std::modff(param.value, &intpart) == 0.0f) {
            newValue << static_cast<int>(param.value);
          } else {
            newValue << param.value;
          }
          result << line.substr(0, valueStart) << newValue.str() << line.substr(valueEnd) << "\n";
          continue;
        }
      }
    }
    result << line << "\n";
  }

  std::cerr << "WriteParameterToFile: Writing param '" << param.name << "' = " << param.value
            << " at line " << param.lineNumber << " to " << actualPath << std::endl;

  std::ofstream out(actualPath);
  if (!out) {
    std::cerr << "WriteParameterToFile: Failed to open file for writing" << std::endl;
    return false;
  }
  out << result.str();
  std::cerr << "WriteParameterToFile: Success" << std::endl;
  return true;
}

}  // namespace dingcad
