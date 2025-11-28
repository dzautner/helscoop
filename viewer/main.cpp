#include "raylib.h"
#include "raymath.h"
#include "rlgl.h"

#define RAYGUI_IMPLEMENTATION
#include "raygui.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <chrono>
#include <cmath>
#include <future>
#include <mutex>
#include <thread>
#include <cstring>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <memory>
#include <optional>
#include <set>
#include <sstream>
#include <string>
#include <system_error>
#include <unordered_map>
#include <vector>
#include <utility>

extern "C" {
#include "quickjs.h"
}

#include "manifold/manifold.h"
#include "manifold/polygon.h"
#include "js_bindings.h"

namespace {
const Color kBaseColor = {210, 210, 220, 255};
const char *kBrandText = "HELSCOOP";
constexpr float kBrandFontSize = 34.0f;
constexpr int kUIFontSize = 48;  // Load at larger size for quality
constexpr float kSceneScale = 0.1f;  // convert mm scene units to renderer units

// Helper to convert string to uppercase
std::string toUpper(const std::string &s) {
  std::string result = s;
  for (char &c : result) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  return result;
}

// GLSL 330 core (desktop). Uses raylib's default attribute/uniform names.
const char* kOutlineVS = R"glsl(
#version 330

in vec3 vertexPosition;
in vec3 vertexNormal;

uniform mat4 mvp;
uniform float outline;   // world-units thickness

void main()
{
    // Expand along the vertex normal in model space. This is robust as long as
    // your model transform has no non-uniform scale (true in your code).
    vec3 pos = vertexPosition + normalize(vertexNormal) * outline;
    gl_Position = mvp * vec4(pos, 1.0);
}
)glsl";

const char* kOutlineFS = R"glsl(
#version 330

out vec4 finalColor;
uniform vec4 outlineColor;

void main()
{
    // Keep only back-faces for a clean silhouette.
    if (gl_FrontFacing) discard;
    finalColor = outlineColor;
}
)glsl";

// Toon (cel) shading — lit 3D pass
const char* kToonVS = R"glsl(
#version 330
in vec3 vertexPosition;
in vec3 vertexNormal;
uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 matView;
out vec3 vNvs;
out vec3 vVdir; // view dir in view space
void main() {
    vec4 wpos = matModel * vec4(vertexPosition, 1.0);
    vec3 nvs  = mat3(matView) * mat3(matModel) * vertexNormal;
    vNvs      = normalize(nvs);
    vec3 vpos = (matView * wpos).xyz;
    vVdir     = normalize(-vpos);
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

const char* kToonFS = R"glsl(
#version 330
in vec3 vNvs;
in vec3 vVdir;
out vec4 finalColor;

uniform vec3 lightDirVS;     // normalized, in view space
uniform vec4 baseColor;      // your kBaseColor normalized [0..1]
uniform int  toonSteps;      // e.g. 3 or 4
uniform float ambient;       // e.g. 0.3
uniform float diffuseWeight; // e.g. 0.7
uniform float rimWeight;     // e.g. 0.25
uniform float specWeight;    // e.g. 0.15
uniform float specShininess; // e.g. 32.0

float quantize(float x, int steps){
    float s = max(1, steps-1);
    return floor(clamp(x,0.0,1.0)*s + 1e-4)/s;
}

void main() {
    vec3 n   = normalize(vNvs);
    vec3 l   = normalize(lightDirVS);
    vec3 v   = normalize(vVdir);

    float ndl = max(0.0, dot(n,l));
    float cel = quantize(ndl, toonSteps);

    // crisp rim
    float rim = pow(1.0 - max(0.0, dot(n, v)), 1.5);

    // hard-edged spec
    float spec = pow(max(0.0, dot(reflect(-l, n), v)), specShininess);
    spec = step(0.5, spec) * specWeight;

    float shade = clamp(ambient + diffuseWeight*cel + rimWeight*rim + spec, 0.0, 1.0);
    finalColor  = vec4(baseColor.rgb * shade, 1.0);
}
)glsl";

// Normal+Depth G-buffer — for screen-space edges
const char* kNormalDepthVS = R"glsl(
#version 330
in vec3 vertexPosition;
in vec3 vertexNormal;
uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 matView;
out vec3 nVS;
out float depthLin;
void main() {
    vec4 wpos = matModel * vec4(vertexPosition, 1.0);
    vec3 vpos = (matView * wpos).xyz;
    nVS = normalize(mat3(matView) * mat3(matModel) * vertexNormal);
    depthLin = -vpos.z; // linear view-space depth
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

const char* kNormalDepthFS = R"glsl(
#version 330
in vec3 nVS;
in float depthLin;
out vec4 outColor;
uniform float zNear;
uniform float zFar;
void main() {
    float d = clamp((depthLin - zNear) / (zFar - zNear), 0.0, 1.0);
    outColor = vec4(nVS*0.5 + 0.5, d); // RGB: normal, A: linear depth
}
)glsl";

// Fullscreen composite — ink from normal/depth discontinuities
const char* kEdgeQuadVS = R"glsl(
#version 330
in vec3 vertexPosition;
in vec2 vertexTexCoord;
uniform mat4 mvp;
out vec2 uv;
void main() {
    uv = vertexTexCoord;
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

const char* kEdgeFS = R"glsl(
#version 330
in vec2 uv;
out vec4 finalColor;

uniform sampler2D texture0;      // color from toon pass
uniform sampler2D normDepthTex;  // RG: normal, A: depth from ND pass
uniform vec2 texel;              // 1/width, 1/height

uniform float normalThreshold;   // e.g. 0.25
uniform float depthThreshold;    // e.g. 0.002
uniform float edgeIntensity;     // e.g. 1.0
uniform vec4 inkColor;           // usually black

vec3 decodeN(vec3 c){ return normalize(c*2.0 - 1.0); }

void main(){
    vec4 col = texture(texture0, uv);
    vec4 nd  = texture(normDepthTex, uv);
    vec3 n   = decodeN(nd.rgb);
    float d  = nd.a;

    const vec2 offs[8] = vec2[](vec2(-1,-1), vec2(0,-1), vec2(1,-1),
                                vec2(-1, 0),              vec2(1, 0),
                                vec2(-1, 1), vec2(0, 1), vec2(1, 1));
    float maxNDiff = 0.0;
    float maxDDiff = 0.0;
    for (int i=0;i<8;i++){
        vec4 ndn = texture(normDepthTex, uv + offs[i]*texel);
        maxNDiff = max(maxNDiff, length(n - decodeN(ndn.rgb)));
        maxDDiff = max(maxDDiff, abs(d - ndn.a));
    }

    float eN = smoothstep(normalThreshold, normalThreshold*2.5, maxNDiff);
    float eD = smoothstep(depthThreshold,  depthThreshold*6.0,  maxDDiff);
    float edge = clamp(max(eN, eD)*edgeIntensity, 0.0, 1.0);

    vec3 inked = mix(col.rgb, inkColor.rgb, edge);
    finalColor = vec4(inked, col.a);
}
)glsl";

struct Vec3f {
  float x;
  float y;
  float z;
};

struct ColoredObject {
  std::shared_ptr<manifold::Manifold> geometry;
  Color color;
};

struct SceneData {
  std::vector<ColoredObject> objects;
};

struct ModelWithColor {
  Model model;
  Color color;
};

struct ModuleLoaderData {
  std::filesystem::path baseDir;
  std::set<std::filesystem::path> dependencies;
};

ModuleLoaderData g_module_loader_data;

// Forward declaration for ReadTextFile (defined later)
std::optional<std::string> ReadTextFile(const std::filesystem::path &path);

// ============================================================================
// PARAMETER PANEL STRUCTURES
// ============================================================================

struct SceneParameter {
  std::string name;           // Variable name in JS
  std::string displayName;    // Human-readable name
  std::string section;        // Section grouping (e.g., "Coop Dimensions")
  float value;                // Current value
  float minValue;             // Slider minimum
  float maxValue;             // Slider maximum
  int lineNumber;             // Line number in file (for editing)
};

struct MaterialItem {
  std::string name;
  std::string category;
  std::string link;
  std::string unit;
  float unitPrice;
  int quantity;
};

// Parse parameters from a JS file
std::vector<SceneParameter> ParseSceneParameters(const std::filesystem::path &path) {
  std::vector<SceneParameter> params;

  auto source = ReadTextFile(path);
  if (!source) return params;

  // Parameter definitions: name, displayName, section, min, max
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
  };

  // Parse the source line by line
  std::istringstream stream(*source);
  std::string line;
  int lineNum = 0;

  while (std::getline(stream, line)) {
    lineNum++;

    // Look for "const name = value;" patterns
    for (const auto& def : knownParams) {
      std::string pattern = std::string("const ") + def.name + " = ";
      size_t pos = line.find(pattern);
      if (pos != std::string::npos) {
        // Extract the value
        size_t valueStart = pos + pattern.length();
        size_t valueEnd = line.find(';', valueStart);
        if (valueEnd != std::string::npos) {
          std::string valueStr = line.substr(valueStart, valueEnd - valueStart);
          // Trim whitespace
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

// Parse materials from a JS file (reads the export const materials = [...] block)
std::vector<MaterialItem> ParseMaterials(const std::filesystem::path &path) {
  std::vector<MaterialItem> materials;

  auto source = ReadTextFile(path);
  if (!source) return materials;

  // Find "export const materials = ["
  size_t startPos = source->find("export const materials = [");
  if (startPos == std::string::npos) return materials;

  // Find the closing bracket
  size_t endPos = source->find("];", startPos);
  if (endPos == std::string::npos) return materials;

  std::string block = source->substr(startPos, endPos - startPos + 2);

  // Parse each { ... } block
  size_t pos = 0;
  while ((pos = block.find('{', pos)) != std::string::npos) {
    size_t objEnd = block.find('}', pos);
    if (objEnd == std::string::npos) break;

    std::string objStr = block.substr(pos, objEnd - pos + 1);
    MaterialItem item;

    // Extract name
    size_t namePos = objStr.find("name:");
    if (namePos != std::string::npos) {
      size_t qStart = objStr.find('"', namePos);
      size_t qEnd = objStr.find('"', qStart + 1);
      if (qStart != std::string::npos && qEnd != std::string::npos) {
        item.name = objStr.substr(qStart + 1, qEnd - qStart - 1);
      }
    }

    // Extract category
    size_t catPos = objStr.find("category:");
    if (catPos != std::string::npos) {
      size_t qStart = objStr.find('"', catPos);
      size_t qEnd = objStr.find('"', qStart + 1);
      if (qStart != std::string::npos && qEnd != std::string::npos) {
        item.category = objStr.substr(qStart + 1, qEnd - qStart - 1);
      }
    }

    // Extract link
    size_t linkPos = objStr.find("link:");
    if (linkPos != std::string::npos) {
      size_t qStart = objStr.find('"', linkPos);
      size_t qEnd = objStr.find('"', qStart + 1);
      if (qStart != std::string::npos && qEnd != std::string::npos) {
        item.link = objStr.substr(qStart + 1, qEnd - qStart - 1);
      }
    }

    // Extract unit
    size_t unitPos = objStr.find("unit:");
    if (unitPos != std::string::npos) {
      size_t qStart = objStr.find('"', unitPos);
      size_t qEnd = objStr.find('"', qStart + 1);
      if (qStart != std::string::npos && qEnd != std::string::npos) {
        item.unit = objStr.substr(qStart + 1, qEnd - qStart - 1);
      }
    }

    // Extract unitPrice
    size_t pricePos = objStr.find("unitPrice:");
    if (pricePos != std::string::npos) {
      size_t numStart = pricePos + 10;
      while (numStart < objStr.size() && (objStr[numStart] == ' ' || objStr[numStart] == ':')) numStart++;
      size_t numEnd = objStr.find_first_of(",}", numStart);
      if (numEnd != std::string::npos) {
        std::string numStr = objStr.substr(numStart, numEnd - numStart);
        try { item.unitPrice = std::stof(numStr); } catch (...) { item.unitPrice = 0; }
      }
    }

    // Extract quantity (may be a variable name or number)
    size_t qtyPos = objStr.find("quantity:");
    if (qtyPos != std::string::npos) {
      size_t numStart = qtyPos + 9;
      while (numStart < objStr.size() && (objStr[numStart] == ' ' || objStr[numStart] == ':')) numStart++;
      size_t numEnd = objStr.find_first_of(",}", numStart);
      if (numEnd != std::string::npos) {
        std::string numStr = objStr.substr(numStart, numEnd - numStart);
        numStr.erase(0, numStr.find_first_not_of(" \t"));
        numStr.erase(numStr.find_last_not_of(" \t") + 1);
        try { item.quantity = std::stoi(numStr); } catch (...) { item.quantity = 0; }
      }
    }

    if (!item.name.empty()) {
      materials.push_back(item);
    }

    pos = objEnd + 1;
  }

  return materials;
}

// Write a parameter value back to the JS file
bool WriteParameterToFile(const std::filesystem::path &path, const SceneParameter &param) {
  auto source = ReadTextFile(path);
  if (!source) return false;

  std::ostringstream result;
  std::istringstream stream(*source);
  std::string line;
  int lineNum = 0;

  while (std::getline(stream, line)) {
    lineNum++;
    if (lineNum == param.lineNumber) {
      // Replace this line
      std::string pattern = std::string("const ") + param.name + " = ";
      size_t pos = line.find(pattern);
      if (pos != std::string::npos) {
        size_t valueStart = pos + pattern.length();
        size_t valueEnd = line.find(';', valueStart);
        if (valueEnd != std::string::npos) {
          // Reconstruct line with new value
          std::ostringstream newValue;
          if (param.name == "nest_boxes") {
            newValue << static_cast<int>(param.value);  // Integer for count
          } else {
            newValue << static_cast<int>(param.value);  // Integer for mm values
          }
          result << line.substr(0, valueStart) << newValue.str() << line.substr(valueEnd) << "\n";
          continue;
        }
      }
    }
    result << line << "\n";
  }

  std::ofstream out(path);
  if (!out) return false;
  out << result.str();
  return true;
}

struct WatchedFile {
  std::optional<std::filesystem::file_time_type> timestamp;
};

Vec3f FetchVertex(const manifold::MeshGL &mesh, uint32_t index) {
  const size_t offset = static_cast<size_t>(index) * mesh.numProp;
  return {
      static_cast<float>(mesh.vertProperties[offset + 0]),
      static_cast<float>(mesh.vertProperties[offset + 1]),
      static_cast<float>(mesh.vertProperties[offset + 2])
  };
}

Vec3f Subtract(const Vec3f &a, const Vec3f &b) {
  return {a.x - b.x, a.y - b.y, a.z - b.z};
}

Vec3f Cross(const Vec3f &a, const Vec3f &b) {
  return {a.y * b.z - a.z * b.y,
          a.z * b.x - a.x * b.z,
          a.x * b.y - a.y * b.x};
}

Vec3f Normalize(const Vec3f &v) {
  const float lenSq = v.x * v.x + v.y * v.y + v.z * v.z;
  if (lenSq <= 0.0f) return {0.0f, 0.0f, 0.0f};
  const float invLen = 1.0f / std::sqrt(lenSq);
  return {v.x * invLen, v.y * invLen, v.z * invLen};
}

bool WriteMeshAsBinaryStl(const manifold::MeshGL &mesh,
                          const std::filesystem::path &path,
                          std::string &error) {
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
  out.write(reinterpret_cast<const char *>(&triCount), sizeof(uint32_t));

  for (uint32_t tri = 0; tri < triCount; ++tri) {
    const uint32_t i0 = mesh.triVerts[tri * 3 + 0];
    const uint32_t i1 = mesh.triVerts[tri * 3 + 1];
    const uint32_t i2 = mesh.triVerts[tri * 3 + 2];

    const Vec3f v0 = FetchVertex(mesh, i0);
    const Vec3f v1 = FetchVertex(mesh, i1);
    const Vec3f v2 = FetchVertex(mesh, i2);

    const Vec3f normal = Normalize(Cross(Subtract(v1, v0), Subtract(v2, v0)));

    out.write(reinterpret_cast<const char *>(&normal), sizeof(Vec3f));
    out.write(reinterpret_cast<const char *>(&v0), sizeof(Vec3f));
    out.write(reinterpret_cast<const char *>(&v1), sizeof(Vec3f));
    out.write(reinterpret_cast<const char *>(&v2), sizeof(Vec3f));
    const uint16_t attr = 0;
    out.write(reinterpret_cast<const char *>(&attr), sizeof(uint16_t));
  }

  if (!out) {
    error = "Export failed: write error";
    return false;
  }

  return true;
}

void DestroyModel(Model &model) {
  if (model.meshes != nullptr || model.materials != nullptr) {
    UnloadModel(model);
  }
  model = Model{};
}

Model CreateRaylibModelFrom(const manifold::MeshGL &meshGL, Color baseColor = kBaseColor) {
  Model model = {0};
  const int vertexCount = meshGL.NumVert();
  const int triangleCount = meshGL.NumTri();

  if (vertexCount <= 0 || triangleCount <= 0) {
    return model;
  }

  const int stride = meshGL.numProp;
  std::vector<Vector3> positions(vertexCount);
  for (int v = 0; v < vertexCount; ++v) {
    const int base = v * stride;
    // Convert from the scene's Z-up coordinates to raylib's Y-up system.
    const float cadX = meshGL.vertProperties[base + 0] * kSceneScale;
    const float cadY = meshGL.vertProperties[base + 1] * kSceneScale;
    const float cadZ = meshGL.vertProperties[base + 2] * kSceneScale;
    positions[v] = {cadX, cadZ, -cadY};
  }

  std::vector<Vector3> accum(vertexCount, {0.0f, 0.0f, 0.0f});
  for (int tri = 0; tri < triangleCount; ++tri) {
    const int i0 = meshGL.triVerts[tri * 3 + 0];
    const int i1 = meshGL.triVerts[tri * 3 + 1];
    const int i2 = meshGL.triVerts[tri * 3 + 2];

    const Vector3 p0 = positions[i0];
    const Vector3 p1 = positions[i1];
    const Vector3 p2 = positions[i2];

    const Vector3 u = {p1.x - p0.x, p1.y - p0.y, p1.z - p0.z};
    const Vector3 v = {p2.x - p0.x, p2.y - p0.y, p2.z - p0.z};
    const Vector3 n = {u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z,
                       u.x * v.y - u.y * v.x};

    accum[i0].x += n.x;
    accum[i0].y += n.y;
    accum[i0].z += n.z;
    accum[i1].x += n.x;
    accum[i1].y += n.y;
    accum[i1].z += n.z;
    accum[i2].x += n.x;
    accum[i2].y += n.y;
    accum[i2].z += n.z;
  }

  std::vector<Vector3> normals(vertexCount);
  std::vector<Color> colors(vertexCount);
  const Vector3 lightDir = Vector3Normalize({0.45f, 0.85f, 0.35f});
  for (int v = 0; v < vertexCount; ++v) {
    const Vector3 n = accum[v];
    const float length = std::sqrt(n.x * n.x + n.y * n.y + n.z * n.z);

    Vector3 normal = {0.0f, 1.0f, 0.0f};
    if (length > 0.0f) {
      normal = {n.x / length, n.y / length, n.z / length};
    }
    normals[v] = normal;

    float intensity = Vector3DotProduct(normal, lightDir);
    intensity = Clamp(intensity, 0.0f, 1.0f);
    constexpr int toonSteps = 3;
    int level = static_cast<int>(std::floor(intensity * toonSteps));
    if (level >= toonSteps) level = toonSteps - 1;
    const float toon = (toonSteps > 1)
                           ? static_cast<float>(level) /
                                 static_cast<float>(toonSteps - 1)
                           : intensity;
    const float ambient = 0.3f;
    const float diffuse = 0.7f;
    float finalIntensity = Clamp(ambient + diffuse * toon, 0.0f, 1.0f);

    const Color base = baseColor;  // Use parameter instead of kBaseColor
    Color color = {0};
    color.r = static_cast<unsigned char>(
        Clamp(base.r * finalIntensity, 0.0f, 255.0f));
    color.g = static_cast<unsigned char>(
        Clamp(base.g * finalIntensity, 0.0f, 255.0f));
    color.b = static_cast<unsigned char>(
        Clamp(base.b * finalIntensity, 0.0f, 255.0f));
    color.a = base.a;
    colors[v] = color;
  }

  constexpr int kMaxVerticesPerMesh = std::numeric_limits<unsigned short>::max();
  std::vector<int> remap(vertexCount, 0);
  std::vector<int> remapMarker(vertexCount, 0);
  int chunkToken = 1;

  std::vector<Mesh> meshes;
  meshes.reserve(
      static_cast<size_t>(triangleCount) / kMaxVerticesPerMesh + 1);

  int triIndex = 0;
  while (triIndex < triangleCount) {
    const int currentToken = chunkToken++;
    int chunkVertexCount = 0;
    std::vector<Vector3> chunkPositions;
    std::vector<Vector3> chunkNormals;
    std::vector<Color> chunkColors;
    std::vector<unsigned short> chunkIndices;

    chunkPositions.reserve(std::min(kMaxVerticesPerMesh, vertexCount));
    chunkNormals.reserve(std::min(kMaxVerticesPerMesh, vertexCount));
    chunkColors.reserve(std::min(kMaxVerticesPerMesh, vertexCount));
    chunkIndices.reserve(std::min(kMaxVerticesPerMesh, vertexCount) * 3);

    while (triIndex < triangleCount) {
      const int indices[3] = {
          static_cast<int>(meshGL.triVerts[triIndex * 3 + 0]),
          static_cast<int>(meshGL.triVerts[triIndex * 3 + 1]),
          static_cast<int>(meshGL.triVerts[triIndex * 3 + 2])};

      int needed = 0;
      for (int j = 0; j < 3; ++j) {
        if (remapMarker[indices[j]] != currentToken) {
          ++needed;
        }
      }

      if (chunkVertexCount + needed > kMaxVerticesPerMesh) {
        break;
      }

      for (int j = 0; j < 3; ++j) {
        const int original = indices[j];
        if (remapMarker[original] != currentToken) {
          remapMarker[original] = currentToken;
          remap[original] = chunkVertexCount++;
          chunkPositions.push_back(positions[original]);
          chunkNormals.push_back(normals[original]);
          chunkColors.push_back(colors[original]);
        }
        chunkIndices.push_back(static_cast<unsigned short>(remap[original]));
      }
      ++triIndex;
    }

    Mesh chunkMesh = {0};
    chunkMesh.vertexCount = chunkVertexCount;
    chunkMesh.triangleCount = static_cast<int>(chunkIndices.size() / 3);
    chunkMesh.vertices = static_cast<float *>(
        MemAlloc(chunkVertexCount * 3 * sizeof(float)));
    chunkMesh.normals = static_cast<float *>(
        MemAlloc(chunkVertexCount * 3 * sizeof(float)));
    chunkMesh.colors = static_cast<unsigned char *>(
        MemAlloc(chunkVertexCount * 4 * sizeof(unsigned char)));
    chunkMesh.indices = static_cast<unsigned short *>(
        MemAlloc(chunkIndices.size() * sizeof(unsigned short)));
    chunkMesh.texcoords = nullptr;
    chunkMesh.texcoords2 = nullptr;
    chunkMesh.tangents = nullptr;

    for (int v = 0; v < chunkVertexCount; ++v) {
      const Vector3 &pos = chunkPositions[v];
      chunkMesh.vertices[v * 3 + 0] = pos.x;
      chunkMesh.vertices[v * 3 + 1] = pos.y;
      chunkMesh.vertices[v * 3 + 2] = pos.z;

      const Vector3 &normal = chunkNormals[v];
      chunkMesh.normals[v * 3 + 0] = normal.x;
      chunkMesh.normals[v * 3 + 1] = normal.y;
      chunkMesh.normals[v * 3 + 2] = normal.z;

      const Color color = chunkColors[v];
      chunkMesh.colors[v * 4 + 0] = color.r;
      chunkMesh.colors[v * 4 + 1] = color.g;
      chunkMesh.colors[v * 4 + 2] = color.b;
      chunkMesh.colors[v * 4 + 3] = color.a;
    }

    std::memcpy(chunkMesh.indices, chunkIndices.data(),
                chunkIndices.size() * sizeof(unsigned short));
    UploadMesh(&chunkMesh, false);
    meshes.push_back(chunkMesh);
  }

  if (meshes.empty()) {
    return model;
  }

  model.transform = MatrixIdentity();
  model.meshCount = static_cast<int>(meshes.size());
  model.meshes = static_cast<Mesh *>(
      MemAlloc(model.meshCount * sizeof(Mesh)));
  for (int i = 0; i < model.meshCount; ++i) {
    model.meshes[i] = meshes[i];
  }
  model.materialCount = 1;
  model.materials = static_cast<Material *>(MemAlloc(sizeof(Material)));
  model.materials[0] = LoadMaterialDefault();
  model.meshMaterial = static_cast<int *>(
      MemAlloc(model.meshCount * sizeof(int)));
  for (int i = 0; i < model.meshCount; ++i) {
    model.meshMaterial[i] = 0;
  }

  return model;
}

void DrawAxes(float length) {
  const float shaftRadius = std::max(length * 0.02f, 0.01f);
  const float headLength = std::min(length * 0.2f, length * 0.75f);
  const float headRadius = shaftRadius * 2.5f;

  auto drawAxis = [&](Vector3 direction, Color color) {
    const Vector3 origin = {0.0f, 0.0f, 0.0f};
    const float shaftLength = std::max(length - headLength, 0.0f);
    const Vector3 shaftEnd = Vector3Scale(direction, shaftLength);
    const Vector3 axisEnd = Vector3Scale(direction, length);

    if (shaftLength > 0.0f) {
      DrawCylinderEx(origin, shaftEnd, shaftRadius, shaftRadius, 12, Fade(color, 0.65f));
    }
    DrawCylinderEx(shaftEnd, axisEnd, headRadius, 0.0f, 16, color);
  };

  drawAxis({1.0f, 0.0f, 0.0f}, RED);    // +X
  drawAxis({0.0f, 1.0f, 0.0f}, GREEN);  // +Y
  drawAxis({0.0f, 0.0f, 1.0f}, BLUE);   // +Z

  DrawSphereEx({0.0f, 0.0f, 0.0f}, shaftRadius * 1.2f, 12, 12, LIGHTGRAY);
}

void DrawXZGrid(int halfLines, float spacing, Color color) {
  for (int i = -halfLines; i <= halfLines; ++i) {
    const float offset = static_cast<float>(i) * spacing;
    DrawLine3D({offset, 0.0f, -halfLines * spacing},
               {offset, 0.0f, halfLines * spacing}, color);
    DrawLine3D({-halfLines * spacing, 0.0f, offset},
               {halfLines * spacing, 0.0f, offset}, color);
  }
}

std::optional<std::filesystem::path> FindDefaultScene() {
  auto cwdCandidate = std::filesystem::current_path() / "scene.js";
  if (std::filesystem::exists(cwdCandidate)) return cwdCandidate;
  if (const char *home = std::getenv("HOME")) {
    std::filesystem::path homeCandidate = std::filesystem::path(home) / "scene.js";
    if (std::filesystem::exists(homeCandidate)) return homeCandidate;
  }
  return std::nullopt;
}

std::optional<std::string> ReadTextFile(const std::filesystem::path &path) {
  std::ifstream file(path);
  if (!file) return std::nullopt;
  std::ostringstream ss;
  ss << file.rdbuf();
  return ss.str();
}

JSModuleDef *FilesystemModuleLoader(JSContext *ctx, const char *module_name, void *opaque) {
  auto *data = static_cast<ModuleLoaderData *>(opaque);
  std::filesystem::path resolved(module_name);
  if (resolved.is_relative()) {
    const std::filesystem::path base = data && !data->baseDir.empty()
                                           ? data->baseDir
                                           : std::filesystem::current_path();
    resolved = base / resolved;
  }
  resolved = std::filesystem::absolute(resolved).lexically_normal();

  if (data) {
    data->baseDir = resolved.parent_path();
    data->dependencies.insert(resolved);
  }

  auto source = ReadTextFile(resolved);
  if (!source) {
    JS_ThrowReferenceError(ctx, "Unable to load module '%s'", resolved.string().c_str());
    return nullptr;
  }

  const std::string moduleName = resolved.string();
  JSValue funcVal = JS_Eval(ctx, source->c_str(), source->size(), moduleName.c_str(),
                            JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(funcVal)) {
    return nullptr;
  }

  auto *module = static_cast<JSModuleDef *>(JS_VALUE_GET_PTR(funcVal));
  JS_FreeValue(ctx, funcVal);
  return module;
}

struct LoadResult {
  bool success = false;
  SceneData sceneData;
  std::string message;
  std::vector<std::filesystem::path> dependencies;
  std::vector<MaterialItem> materials;  // Evaluated materials from JS
};

// LoadSceneFromFile with optional external ModuleLoaderData (for thread safety)
LoadResult LoadSceneFromFile(JSRuntime *runtime, const std::filesystem::path &path, ModuleLoaderData *loaderData = nullptr) {
  auto loadStart = std::chrono::high_resolution_clock::now();

  // Use provided loaderData or fallback to global (for backward compat)
  ModuleLoaderData *data = loaderData ? loaderData : &g_module_loader_data;

  LoadResult result;
  const auto absolutePath = std::filesystem::absolute(path);
  if (!std::filesystem::exists(absolutePath)) {
    result.message = "Scene file not found: " + absolutePath.string();
    return result;
  }
  data->baseDir = absolutePath.parent_path();
  data->dependencies.clear();
  data->dependencies.insert(absolutePath);
  auto sourceOpt = ReadTextFile(absolutePath);
  if (!sourceOpt) {
    result.message = "Unable to read scene file: " + absolutePath.string();
    result.dependencies.assign(data->dependencies.begin(),
                               data->dependencies.end());
    return result;
  }

  auto afterRead = std::chrono::high_resolution_clock::now();

  JSContext *ctx = JS_NewContext(runtime);
  RegisterBindings(ctx);

  auto afterBindings = std::chrono::high_resolution_clock::now();

  auto captureException = [&]() {
    JSValue exc = JS_GetException(ctx);
    JSValue stack = JS_GetPropertyStr(ctx, exc, "stack");
    const char *stackStr = JS_ToCString(ctx, JS_IsUndefined(stack) ? exc : stack);
    result.message = stackStr ? stackStr : "JavaScript error";
    JS_FreeCString(ctx, stackStr);
    JS_FreeValue(ctx, stack);
    JS_FreeValue(ctx, exc);
  };
  auto assignDependencies = [&]() {
    result.dependencies.assign(data->dependencies.begin(),
                               data->dependencies.end());
  };

  JSValue moduleFunc = JS_Eval(ctx, sourceOpt->c_str(), sourceOpt->size(), absolutePath.string().c_str(),
                               JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(moduleFunc)) {
    captureException();
    assignDependencies();
    JS_FreeContext(ctx);
    return result;
  }

  auto afterCompile = std::chrono::high_resolution_clock::now();

  if (JS_ResolveModule(ctx, moduleFunc) < 0) {
    captureException();
    JS_FreeValue(ctx, moduleFunc);
    assignDependencies();
    JS_FreeContext(ctx);
    return result;
  }

  auto afterResolve = std::chrono::high_resolution_clock::now();

  auto *module = static_cast<JSModuleDef *>(JS_VALUE_GET_PTR(moduleFunc));
  JSValue evalResult = JS_EvalFunction(ctx, moduleFunc);
  if (JS_IsException(evalResult)) {
    captureException();
    assignDependencies();
    JS_FreeContext(ctx);
    return result;
  }
  JS_FreeValue(ctx, evalResult);

  auto afterEval = std::chrono::high_resolution_clock::now();

  JSValue moduleNamespace = JS_GetModuleNamespace(ctx, module);
  if (JS_IsException(moduleNamespace)) {
    captureException();
    assignDependencies();
    JS_FreeContext(ctx);
    return result;
  }

  JSValue sceneVal = JS_GetPropertyStr(ctx, moduleNamespace, "scene");
  if (JS_IsException(sceneVal)) {
    JS_FreeValue(ctx, moduleNamespace);
    captureException();
    assignDependencies();
    JS_FreeContext(ctx);
    return result;
  }

  // Also get materials export (optional - may not exist)
  JSValue materialsVal = JS_GetPropertyStr(ctx, moduleNamespace, "materials");
  JS_FreeValue(ctx, moduleNamespace);

  if (JS_IsUndefined(sceneVal)) {
    JS_FreeValue(ctx, sceneVal);
    JS_FreeValue(ctx, materialsVal);
    JS_FreeContext(ctx);
    result.message = "Scene module must export 'scene'";
    assignDependencies();
    return result;
  }

  // Parse scene - can be:
  // 1. Single manifold (backward compat)
  // 2. Array of manifolds (backward compat)
  // 3. Array of colored objects: [{geometry: manifold, color: [r,g,b]}, ...]

  auto parseColoredObject = [&](JSValue objVal) -> std::optional<ColoredObject> {
    // Check if it's a plain manifold
    auto manifoldHandle = GetManifoldHandle(ctx, objVal);
    if (manifoldHandle) {
      return ColoredObject{manifoldHandle, kBaseColor};
    }

    // Check if it's a colored object {geometry, color}
    JSValue geomVal = JS_GetPropertyStr(ctx, objVal, "geometry");
    JSValue colorVal = JS_GetPropertyStr(ctx, objVal, "color");

    if (!JS_IsUndefined(geomVal) && !JS_IsUndefined(colorVal)) {
      auto geom = GetManifoldHandle(ctx, geomVal);

      // Parse color array manually
      if (geom && JS_IsArray(colorVal)) {
        std::array<double, 3> colorArray{};
        bool colorOk = true;

        for (uint32_t i = 0; i < 3; ++i) {
          JSValue element = JS_GetPropertyUint32(ctx, colorVal, i);
          if (JS_ToFloat64(ctx, &colorArray[i], element) < 0) {
            colorOk = false;
            JS_FreeValue(ctx, element);
            break;
          }
          JS_FreeValue(ctx, element);
        }

        if (colorOk) {
          Color color = {
            static_cast<unsigned char>(Clamp(colorArray[0] * 255.0, 0.0, 255.0)),
            static_cast<unsigned char>(Clamp(colorArray[1] * 255.0, 0.0, 255.0)),
            static_cast<unsigned char>(Clamp(colorArray[2] * 255.0, 0.0, 255.0)),
            255
          };
          TraceLog(LOG_INFO, "Parsed colored object: R=%d G=%d B=%d", color.r, color.g, color.b);
          std::cout << "Parsed colored object: R=" << (int)color.r << " G=" << (int)color.g << " B=" << (int)color.b << std::endl;
          JS_FreeValue(ctx, geomVal);
          JS_FreeValue(ctx, colorVal);
          return ColoredObject{geom, color};
        }
      }
    }

    JS_FreeValue(ctx, geomVal);
    JS_FreeValue(ctx, colorVal);
    return std::nullopt;
  };

  // Handle single object or array
  if (JS_IsArray(sceneVal)) {
    // Array of objects
    JSValue lengthVal = JS_GetPropertyStr(ctx, sceneVal, "length");
    uint32_t length = 0;
    if (JS_ToUint32(ctx, &length, lengthVal) < 0) {
      JS_FreeValue(ctx, lengthVal);
      JS_FreeValue(ctx, sceneVal);
      JS_FreeValue(ctx, materialsVal);
      JS_FreeContext(ctx);
      result.message = "Failed to get scene array length";
      assignDependencies();
      return result;
    }
    JS_FreeValue(ctx, lengthVal);

    for (uint32_t i = 0; i < length; ++i) {
      JSValue itemVal = JS_GetPropertyUint32(ctx, sceneVal, i);
      auto obj = parseColoredObject(itemVal);
      JS_FreeValue(ctx, itemVal);

      if (obj) {
        result.sceneData.objects.push_back(*obj);
      } else {
        JS_FreeValue(ctx, sceneVal);
        JS_FreeValue(ctx, materialsVal);
        JS_FreeContext(ctx);
        result.message = "Scene array element " + std::to_string(i) + " is not a manifold or colored object";
        assignDependencies();
        return result;
      }
    }
  } else {
    // Single object
    auto obj = parseColoredObject(sceneVal);
    if (obj) {
      result.sceneData.objects.push_back(*obj);
    } else {
      JS_FreeValue(ctx, sceneVal);
      JS_FreeValue(ctx, materialsVal);
      JS_FreeContext(ctx);
      result.message = "Exported 'scene' is not a manifold or colored object";
      assignDependencies();
      return result;
    }
  }

  if (result.sceneData.objects.empty()) {
    JS_FreeValue(ctx, sceneVal);
    JS_FreeValue(ctx, materialsVal);
    JS_FreeContext(ctx);
    result.message = "Scene is empty";
    assignDependencies();
    return result;
  }

  // Parse materials array from JS (optional export)
  if (!JS_IsUndefined(materialsVal) && !JS_IsException(materialsVal) && JS_IsArray(materialsVal)) {
    JSValue matLengthVal = JS_GetPropertyStr(ctx, materialsVal, "length");
    uint32_t matLength = 0;
    if (JS_ToUint32(ctx, &matLength, matLengthVal) >= 0) {
      for (uint32_t i = 0; i < matLength; ++i) {
        JSValue itemVal = JS_GetPropertyUint32(ctx, materialsVal, i);
        MaterialItem item;

        // Extract name
        JSValue nameVal = JS_GetPropertyStr(ctx, itemVal, "name");
        if (!JS_IsUndefined(nameVal)) {
          const char *str = JS_ToCString(ctx, nameVal);
          if (str) { item.name = str; JS_FreeCString(ctx, str); }
        }
        JS_FreeValue(ctx, nameVal);

        // Extract category
        JSValue catVal = JS_GetPropertyStr(ctx, itemVal, "category");
        if (!JS_IsUndefined(catVal)) {
          const char *str = JS_ToCString(ctx, catVal);
          if (str) { item.category = str; JS_FreeCString(ctx, str); }
        }
        JS_FreeValue(ctx, catVal);

        // Extract link
        JSValue linkVal = JS_GetPropertyStr(ctx, itemVal, "link");
        if (!JS_IsUndefined(linkVal)) {
          const char *str = JS_ToCString(ctx, linkVal);
          if (str) { item.link = str; JS_FreeCString(ctx, str); }
        }
        JS_FreeValue(ctx, linkVal);

        // Extract unit
        JSValue unitVal = JS_GetPropertyStr(ctx, itemVal, "unit");
        if (!JS_IsUndefined(unitVal)) {
          const char *str = JS_ToCString(ctx, unitVal);
          if (str) { item.unit = str; JS_FreeCString(ctx, str); }
        }
        JS_FreeValue(ctx, unitVal);

        // Extract unitPrice
        JSValue priceVal = JS_GetPropertyStr(ctx, itemVal, "unitPrice");
        if (!JS_IsUndefined(priceVal)) {
          double val = 0;
          if (JS_ToFloat64(ctx, &val, priceVal) >= 0) {
            item.unitPrice = static_cast<float>(val);
          }
        }
        JS_FreeValue(ctx, priceVal);

        // Extract quantity (now properly evaluated from JS!)
        JSValue qtyVal = JS_GetPropertyStr(ctx, itemVal, "quantity");
        if (!JS_IsUndefined(qtyVal)) {
          int32_t val = 0;
          if (JS_ToInt32(ctx, &val, qtyVal) >= 0) {
            item.quantity = val;
          }
        }
        JS_FreeValue(ctx, qtyVal);

        JS_FreeValue(ctx, itemVal);

        if (!item.name.empty()) {
          result.materials.push_back(item);
        }
      }
    }
    JS_FreeValue(ctx, matLengthVal);
    TraceLog(LOG_INFO, "Parsed %zu materials from JS", result.materials.size());
  }

  result.success = true;
  result.message = "Loaded " + absolutePath.string() + " (" +
                   std::to_string(result.sceneData.objects.size()) + " object(s))";
  assignDependencies();
  JS_FreeValue(ctx, sceneVal);
  JS_FreeValue(ctx, materialsVal);
  JS_FreeContext(ctx);

  auto loadEnd = std::chrono::high_resolution_clock::now();
  auto readMs = std::chrono::duration_cast<std::chrono::milliseconds>(afterRead - loadStart).count();
  auto bindingsMs = std::chrono::duration_cast<std::chrono::milliseconds>(afterBindings - afterRead).count();
  auto compileMs = std::chrono::duration_cast<std::chrono::milliseconds>(afterCompile - afterBindings).count();
  auto resolveMs = std::chrono::duration_cast<std::chrono::milliseconds>(afterResolve - afterCompile).count();
  auto evalMs = std::chrono::duration_cast<std::chrono::milliseconds>(afterEval - afterResolve).count();
  auto parseMs = std::chrono::duration_cast<std::chrono::milliseconds>(loadEnd - afterEval).count();
  auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(loadEnd - loadStart).count();

  TraceLog(LOG_INFO, "PROFILE: LoadSceneFromFile: read=%lld ms, bindings=%lld ms, compile=%lld ms, "
           "resolve=%lld ms, eval/CSG=%lld ms, parse=%lld ms, TOTAL=%lld ms",
           readMs, bindingsMs, compileMs, resolveMs, evalMs, parseMs, totalMs);

  return result;
}

std::vector<ModelWithColor> CreateModelsFromScene(const SceneData &sceneData) {
  auto start = std::chrono::high_resolution_clock::now();

  // Phase 1: Parallel mesh tessellation (GetMeshGL is thread-safe and CPU-bound)
  struct MeshTask {
    std::future<manifold::MeshGL> future;
    Color color;
  };
  std::vector<MeshTask> tasks;
  tasks.reserve(sceneData.objects.size());

  for (const auto &obj : sceneData.objects) {
    if (obj.geometry) {
      tasks.push_back({
        std::async(std::launch::async, [geom = obj.geometry]() {
          return geom->GetMeshGL();
        }),
        obj.color
      });
    }
  }

  // Collect tessellated meshes
  std::vector<std::pair<manifold::MeshGL, Color>> meshes;
  meshes.reserve(tasks.size());
  for (auto &task : tasks) {
    meshes.emplace_back(task.future.get(), task.color);
  }

  auto meshEnd = std::chrono::high_resolution_clock::now();
  auto meshMs = std::chrono::duration_cast<std::chrono::milliseconds>(meshEnd - start).count();

  // Phase 2: GPU upload (must be sequential, on main thread)
  std::vector<ModelWithColor> result;
  result.reserve(meshes.size());
  for (auto &[meshGL, color] : meshes) {
    Model model = CreateRaylibModelFrom(meshGL, color);
    result.push_back({model, color});
  }

  auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::high_resolution_clock::now() - start).count();
  TraceLog(LOG_INFO, "PROFILE: CreateModelsFromScene: tessellation=%lld ms, total=%lld ms (%zu objects)",
           meshMs, totalMs, result.size());

  return result;
}

void DestroyModels(std::vector<ModelWithColor> &models) {
  for (auto &modelWithColor : models) {
    DestroyModel(modelWithColor.model);
  }
  models.clear();
}

// Pre-computed mesh data that can be created off the main thread
struct PrecomputedMesh {
  manifold::MeshGL meshGL;
  Color color;
};

struct BackgroundLoadResult {
  bool success = false;
  std::string message;
  SceneData sceneData;
  std::vector<PrecomputedMesh> meshes;
  std::vector<std::filesystem::path> dependencies;
  std::vector<MaterialItem> materials;  // Evaluated materials from JS
};

// Does all heavy work (JS eval + CSG + tessellation) - can run on background thread
// Creates its own JSRuntime since JSRuntime is not thread-safe
BackgroundLoadResult LoadAndTessellate(const std::filesystem::path &path) {
  auto start = std::chrono::high_resolution_clock::now();
  BackgroundLoadResult result;

  // Create a new runtime for this thread (JSRuntime is not thread-safe)
  JSRuntime *runtime = JS_NewRuntime();
  if (!runtime) {
    result.message = "Failed to create JS runtime for background load";
    return result;
  }

  // CRITICAL: Register the Manifold class on THIS runtime
  // Each JSRuntime needs its own class registration!
  EnsureManifoldClass(runtime);

  // Use a LOCAL ModuleLoaderData to avoid race conditions with main thread
  ModuleLoaderData localLoaderData;
  JS_SetModuleLoaderFunc(runtime, nullptr, FilesystemModuleLoader, &localLoaderData);

  // Step 1: Load scene from file (JS eval + CSG) - pass local loader data
  LoadResult loadResult = LoadSceneFromFile(runtime, path, &localLoaderData);
  result.success = loadResult.success;
  result.message = loadResult.message;
  result.sceneData = std::move(loadResult.sceneData);
  result.dependencies = std::move(loadResult.dependencies);
  result.materials = std::move(loadResult.materials);

  if (!result.success) {
    JS_FreeRuntime(runtime);
    return result;
  }

  auto afterLoad = std::chrono::high_resolution_clock::now();

  // Step 2: Parallel tessellation (GetMeshGL)
  struct TessTask {
    std::future<manifold::MeshGL> future;
    Color color;
  };
  std::vector<TessTask> tasks;
  tasks.reserve(result.sceneData.objects.size());

  for (const auto &obj : result.sceneData.objects) {
    if (obj.geometry) {
      tasks.push_back({
        std::async(std::launch::async, [geom = obj.geometry]() {
          return geom->GetMeshGL();
        }),
        obj.color
      });
    }
  }

  // Collect tessellated meshes
  result.meshes.reserve(tasks.size());
  for (auto &task : tasks) {
    result.meshes.push_back({task.future.get(), task.color});
  }

  auto end = std::chrono::high_resolution_clock::now();
  auto loadMs = std::chrono::duration_cast<std::chrono::milliseconds>(afterLoad - start).count();
  auto tessMs = std::chrono::duration_cast<std::chrono::milliseconds>(end - afterLoad).count();
  auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

  TraceLog(LOG_INFO, "PROFILE: LoadAndTessellate (background): load=%lld ms, tess=%lld ms, total=%lld ms",
           loadMs, tessMs, totalMs);

  JS_FreeRuntime(runtime);
  return result;
}

// Convert pre-computed meshes to raylib Models (must run on main thread for GPU upload)
std::vector<ModelWithColor> CreateModelsFromPrecomputed(std::vector<PrecomputedMesh> &meshes) {
  auto start = std::chrono::high_resolution_clock::now();

  std::vector<ModelWithColor> result;
  result.reserve(meshes.size());

  for (auto &mesh : meshes) {
    Model model = CreateRaylibModelFrom(mesh.meshGL, mesh.color);
    result.push_back({model, mesh.color});
  }

  auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::high_resolution_clock::now() - start).count();
  TraceLog(LOG_INFO, "PROFILE: CreateModelsFromPrecomputed (GPU upload): %lld ms (%zu objects)",
           totalMs, result.size());

  return result;
}

}  // namespace

int main(int argc, char *argv[]) {
  // Parse command-line arguments
  bool renderMode = false;
  std::string renderScenePath;
  std::string renderOutputPath;

  for (int i = 1; i < argc; i++) {
    std::string arg = argv[i];
    if (arg == "--render" && i + 2 < argc) {
      renderMode = true;
      renderScenePath = argv[i + 1];
      renderOutputPath = argv[i + 2];
      i += 2;
    }
  }

  SetConfigFlags(FLAG_MSAA_4X_HINT | FLAG_WINDOW_RESIZABLE);
  InitWindow(1280, 720, "dingcad");
  SetTargetFPS(60);

  Font brandingFont = GetFontDefault();
  Font uiFont = GetFontDefault();
  bool brandingFontCustom = false;
  bool uiFontCustom = false;
  // Try Berkeley Mono first (in project root), then fall back to Consolas
  const std::filesystem::path berkeleyPath("BerkeleyMonoTrial-Regular.otf");
  const std::filesystem::path consolasPath("/System/Library/Fonts/Supplemental/Consolas.ttf");
  if (std::filesystem::exists(berkeleyPath)) {
    brandingFont = LoadFontEx(berkeleyPath.string().c_str(), static_cast<int>(kBrandFontSize), nullptr, 0);
    uiFont = LoadFontEx(berkeleyPath.string().c_str(), kUIFontSize, nullptr, 0);
    brandingFontCustom = true;
    uiFontCustom = true;
    TraceLog(LOG_INFO, "Loaded Berkeley Mono font");
  } else if (std::filesystem::exists(consolasPath)) {
    brandingFont = LoadFontEx(consolasPath.string().c_str(), static_cast<int>(kBrandFontSize), nullptr, 0);
    uiFont = LoadFontEx(consolasPath.string().c_str(), kUIFontSize, nullptr, 0);
    brandingFontCustom = true;
    uiFontCustom = true;
    TraceLog(LOG_INFO, "Loaded Consolas font (Berkeley Mono not found)");
  }

  Camera3D camera = {0};
  camera.position = {4.0f, 4.0f, 4.0f};
  camera.target = {0.0f, 0.5f, 0.0f};
  camera.up = {0.0f, 1.0f, 0.0f};
  camera.fovy = 45.0f;
  camera.projection = CAMERA_PERSPECTIVE;

  float orbitDistance = Vector3Distance(camera.position, camera.target);
  float orbitYaw = atan2f(camera.position.x - camera.target.x,
                          camera.position.z - camera.target.z);
  float orbitPitch = asinf((camera.position.y - camera.target.y) / orbitDistance);
  const Vector3 initialTarget = camera.target;
  const float initialDistance = orbitDistance;
  const float initialYaw = orbitYaw;
  const float initialPitch = orbitPitch;

  JSRuntime *runtime = JS_NewRuntime();
  EnsureManifoldClass(runtime);
  JS_SetModuleLoaderFunc(runtime, nullptr, FilesystemModuleLoader, &g_module_loader_data);

  SceneData sceneData;
  std::string statusMessage;
  std::filesystem::path scriptPath;
  std::unordered_map<std::filesystem::path, WatchedFile> watchedFiles;
  std::optional<std::filesystem::path> defaultScript;

  if (renderMode && !renderScenePath.empty()) {
    defaultScript = std::filesystem::path(renderScenePath);
  } else {
    defaultScript = FindDefaultScene();
  }
  auto reportStatus = [&](const std::string &message) {
    statusMessage = message;
    TraceLog(LOG_INFO, "%s", statusMessage.c_str());
    std::cout << statusMessage << std::endl;
  };
  auto setWatchedFiles = [&](const std::vector<std::filesystem::path> &deps) {
    std::unordered_map<std::filesystem::path, WatchedFile> updated;
    for (const auto &dep : deps) {
      WatchedFile entry;
      std::error_code ec;
      auto ts = std::filesystem::last_write_time(dep, ec);
      if (!ec) {
        entry.timestamp = ts;
      }
      updated.emplace(dep, entry);
    }
    watchedFiles = std::move(updated);
  };
  std::vector<MaterialItem> initialMaterials;  // Materials from initial load
  if (defaultScript) {
    scriptPath = std::filesystem::absolute(*defaultScript);
    auto load = LoadSceneFromFile(runtime, scriptPath);
    if (load.success) {
      sceneData = load.sceneData;
      initialMaterials = std::move(load.materials);
      reportStatus(load.message);
    } else {
      reportStatus(load.message);
    }
    if (!load.dependencies.empty()) {
      setWatchedFiles(load.dependencies);
    }
  }
  if (sceneData.objects.empty()) {
    manifold::Manifold cube = manifold::Manifold::Cube({2.0, 2.0, 2.0}, true);
    manifold::Manifold sphere = manifold::Manifold::Sphere(1.2, 0);
    manifold::Manifold combo = cube + sphere.Translate({0.0, 0.8, 0.0});
    sceneData.objects.push_back({
      std::make_shared<manifold::Manifold>(combo),
      kBaseColor
    });
    if (statusMessage.empty()) {
      reportStatus("No scene.js found. Using built-in sample.");
    }
  }

  std::vector<ModelWithColor> models = CreateModelsFromScene(sceneData);

  // ============================================================================
  // UI STATE - Parameter and Materials Panels
  // ============================================================================
  bool showParametersPanel = true;
  bool showMaterialsPanel = true;
  bool liveUpdatesEnabled = true;
  float materialsPanelScroll = 0.0f;
  int parameterPanelScroll = 0;

  // Parse parameters from scene file, materials come from evaluated JS
  std::vector<SceneParameter> sceneParameters;
  std::vector<MaterialItem> sceneMaterials = std::move(initialMaterials);

  auto refreshParameters = [&]() {
    if (!scriptPath.empty()) {
      sceneParameters = ParseSceneParameters(scriptPath);
      TraceLog(LOG_INFO, "Parsed %zu parameters", sceneParameters.size());
    }
  };

  refreshParameters();
  TraceLog(LOG_INFO, "Initial load: %zu parameters, %zu materials",
           sceneParameters.size(), sceneMaterials.size());

  // Track which parameter is being edited (for deferred update)
  int editingParamIndex = -1;
  float editingParamOriginalValue = 0.0f;

  Shader outlineShader = LoadShaderFromMemory(kOutlineVS, kOutlineFS);
  Shader toonShader = LoadShaderFromMemory(kToonVS, kToonFS);
  Shader normalDepthShader = LoadShaderFromMemory(kNormalDepthVS, kNormalDepthFS);
  Shader edgeShader = LoadShaderFromMemory(kEdgeQuadVS, kEdgeFS);

  if (outlineShader.id == 0 || toonShader.id == 0 || normalDepthShader.id == 0 || edgeShader.id == 0) {
    TraceLog(LOG_ERROR, "Failed to load one or more shaders.");
    DestroyModels(models);
    if (brandingFontCustom) {
      UnloadFont(brandingFont);
    }
    if (uiFontCustom) {
      UnloadFont(uiFont);
    }
    JS_FreeRuntime(runtime);
    CloseWindow();
    return 1;
  }

  // Outline uniforms/material
  const int locOutline = GetShaderLocation(outlineShader, "outline");
  const int locOutlineColor = GetShaderLocation(outlineShader, "outlineColor");
  Material outlineMat = LoadMaterialDefault();
  outlineMat.shader = outlineShader;

  auto setOutlineUniforms = [&](float worldThickness, Color color) {
    float c[4] = {
        color.r / 255.0f,
        color.g / 255.0f,
        color.b / 255.0f,
        color.a / 255.0f};
    SetShaderValue(outlineMat.shader, locOutline, &worldThickness, SHADER_UNIFORM_FLOAT);
    SetShaderValue(outlineMat.shader, locOutlineColor, c, SHADER_UNIFORM_VEC4);
  };

  // Toon shader uniforms/material
  const int locLightDirVS = GetShaderLocation(toonShader, "lightDirVS");
  const int locBaseColor = GetShaderLocation(toonShader, "baseColor");
  const int locToonSteps = GetShaderLocation(toonShader, "toonSteps");
  const int locAmbient = GetShaderLocation(toonShader, "ambient");
  const int locDiffuseWeight = GetShaderLocation(toonShader, "diffuseWeight");
  const int locRimWeight = GetShaderLocation(toonShader, "rimWeight");
  const int locSpecWeight = GetShaderLocation(toonShader, "specWeight");
  const int locSpecShininess = GetShaderLocation(toonShader, "specShininess");
  Material toonMat = LoadMaterialDefault();
  toonMat.shader = toonShader;

  // Normal/depth shader uniforms/material
  const int locNear = GetShaderLocation(normalDepthShader, "zNear");
  const int locFar = GetShaderLocation(normalDepthShader, "zFar");
  Material normalDepthMat = LoadMaterialDefault();
  normalDepthMat.shader = normalDepthShader;

  // Edge composite uniforms
  const int locNormDepthTexture = GetShaderLocation(edgeShader, "normDepthTex");
  const int locTexel = GetShaderLocation(edgeShader, "texel");
  const int locNormalThreshold = GetShaderLocation(edgeShader, "normalThreshold");
  const int locDepthThreshold = GetShaderLocation(edgeShader, "depthThreshold");
  const int locEdgeIntensity = GetShaderLocation(edgeShader, "edgeIntensity");
  const int locInkColor = GetShaderLocation(edgeShader, "inkColor");

  // Static toon lighting configuration
  const Vector3 lightDirWS = Vector3Normalize({0.45f, 0.85f, 0.35f});
  const float baseCol[4] = {
      kBaseColor.r / 255.0f,
      kBaseColor.g / 255.0f,
      kBaseColor.b / 255.0f,
      1.0f};
  SetShaderValue(toonShader, locBaseColor, baseCol, SHADER_UNIFORM_VEC4);
  int toonSteps = 4;
  SetShaderValue(toonShader, locToonSteps, &toonSteps, SHADER_UNIFORM_INT);
  float ambient = 0.35f;
  SetShaderValue(toonShader, locAmbient, &ambient, SHADER_UNIFORM_FLOAT);
  float diffuseWeight = 0.75f;
  SetShaderValue(toonShader, locDiffuseWeight, &diffuseWeight, SHADER_UNIFORM_FLOAT);
  float rimWeight = 0.25f;
  SetShaderValue(toonShader, locRimWeight, &rimWeight, SHADER_UNIFORM_FLOAT);
  float specWeight = 0.12f;
  SetShaderValue(toonShader, locSpecWeight, &specWeight, SHADER_UNIFORM_FLOAT);
  float specShininess = 32.0f;
  SetShaderValue(toonShader, locSpecShininess, &specShininess, SHADER_UNIFORM_FLOAT);

  float normalThreshold = 0.25f;
  float depthThreshold = 0.002f;
  float edgeIntensity = 1.0f;
  SetShaderValue(edgeShader, locNormalThreshold, &normalThreshold, SHADER_UNIFORM_FLOAT);
  SetShaderValue(edgeShader, locDepthThreshold, &depthThreshold, SHADER_UNIFORM_FLOAT);
  SetShaderValue(edgeShader, locEdgeIntensity, &edgeIntensity, SHADER_UNIFORM_FLOAT);
  const Color outlineColor = BLACK;
  const float inkColor[4] = {
      outlineColor.r / 255.0f,
      outlineColor.g / 255.0f,
      outlineColor.b / 255.0f,
      1.0f};
  SetShaderValue(edgeShader, locInkColor, inkColor, SHADER_UNIFORM_VEC4);

  auto makeRenderTargets = [&]() {
    const int width = std::max(GetScreenWidth(), 1);
    const int height = std::max(GetScreenHeight(), 1);
    RenderTexture2D color = LoadRenderTexture(width, height);
    RenderTexture2D normDepth = LoadRenderTexture(width, height);
    return std::make_pair(color, normDepth);
  };

  auto [rtColor, rtNormalDepth] = makeRenderTargets();
  SetShaderValueTexture(edgeShader, locNormDepthTexture, rtNormalDepth.texture);
  const float initialTexel[2] = {
      1.0f / static_cast<float>(rtNormalDepth.texture.width),
      1.0f / static_cast<float>(rtNormalDepth.texture.height)};
  SetShaderValue(edgeShader, locTexel, initialTexel, SHADER_UNIFORM_VEC2);

  int prevScreenWidth = GetScreenWidth();
  int prevScreenHeight = GetScreenHeight();
  const float zNear = 0.01f;
  const float zFar = 1000.0f;

  int frameCount = 0;
  bool screenshotTaken = false;

  // Background loading state
  std::future<BackgroundLoadResult> backgroundLoadFuture;
  bool loadingInBackground = false;
  auto backgroundLoadStartTime = std::chrono::high_resolution_clock::now();

  // Lambda to start background load
  auto startBackgroundLoad = [&]() {
    if (loadingInBackground) {
      TraceLog(LOG_INFO, "Background load already in progress, skipping");
      return;
    }
    loadingInBackground = true;
    backgroundLoadStartTime = std::chrono::high_resolution_clock::now();
    reportStatus("Loading...");

    // Launch background thread (creates its own JSRuntime since it's not thread-safe)
    backgroundLoadFuture = std::async(std::launch::async, [scriptPath]() {
      return LoadAndTessellate(scriptPath);
    });
    TraceLog(LOG_INFO, "Started background load");
  };

  // Lambda to check and apply background load result
  auto checkBackgroundLoad = [&]() {
    if (!loadingInBackground) return;

    // Check if future is ready (non-blocking)
    if (backgroundLoadFuture.wait_for(std::chrono::milliseconds(0)) != std::future_status::ready) {
      return;  // Still loading, keep rendering old scene
    }

    // Get the result
    BackgroundLoadResult result = backgroundLoadFuture.get();
    loadingInBackground = false;

    auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::high_resolution_clock::now() - backgroundLoadStartTime).count();

    if (result.success) {
      sceneData = std::move(result.sceneData);
      DestroyModels(models);
      // GPU upload happens here on main thread - this is the only blocking part (~5ms)
      models = CreateModelsFromPrecomputed(result.meshes);
      reportStatus(result.message);
      // Update parameters (still parsed from text) and materials (now from evaluated JS!)
      sceneParameters = ParseSceneParameters(scriptPath);
      sceneMaterials = std::move(result.materials);
      TraceLog(LOG_INFO, "Updated %zu parameters and %zu materials from reload",
               sceneParameters.size(), sceneMaterials.size());
      TraceLog(LOG_INFO, "PROFILE: Background load completed, total wall time: %lld ms", totalMs);
    } else {
      reportStatus(result.message);
      TraceLog(LOG_WARNING, "Background load failed: %s", result.message.c_str());
    }

    if (!result.dependencies.empty()) {
      setWatchedFiles(result.dependencies);
    }
  };

  while (!WindowShouldClose()) {
    frameCount++;
    const Vector2 mouseDelta = GetMouseDelta();

    // Check if background load is ready (non-blocking)
    checkBackgroundLoad();

    if (!scriptPath.empty() && !loadingInBackground) {
      bool changed = false;
      for (const auto &entry : watchedFiles) {
        std::error_code ec;
        auto currentTs = std::filesystem::last_write_time(entry.first, ec);
        if (ec) {
          if (entry.second.timestamp.has_value()) {
            changed = true;
            break;
          }
        } else if (!entry.second.timestamp.has_value() ||
                   currentTs != *entry.second.timestamp) {
          changed = true;
          break;
        }
      }
      if (changed) {
        startBackgroundLoad();
      }
    }

    if (IsKeyPressed(KEY_R) && !scriptPath.empty()) {
      startBackgroundLoad();
    }

    // Panel toggle hotkeys
    if (IsKeyPressed(KEY_T)) {
      showParametersPanel = !showParametersPanel;
    }
    if (IsKeyPressed(KEY_M)) {
      showMaterialsPanel = !showMaterialsPanel;
    }

    static bool prevPDown = false;
    bool exportRequested = false;

    for (int key = GetKeyPressed(); key != 0; key = GetKeyPressed()) {
      TraceLog(LOG_INFO, "Key pressed: %d", key);
      std::cout << "Key pressed: " << key << std::endl;
      if (key == KEY_P) {
        exportRequested = true;
      }
    }

    for (int ch = GetCharPressed(); ch != 0; ch = GetCharPressed()) {
      TraceLog(LOG_INFO, "Char pressed: %d", ch);
      std::cout << "Char pressed: " << ch << std::endl;
      if (ch == 'p' || ch == 'P') {
        exportRequested = true;
      }
    }

    const bool pDown = IsKeyDown(KEY_P);
    if (pDown && !prevPDown) {
      TraceLog(LOG_INFO, "P key down edge detected");
      std::cout << "P key down edge detected" << std::endl;
      exportRequested = true;
    }
    prevPDown = pDown;

    if (!exportRequested && IsKeyPressed(KEY_P)) {
      exportRequested = true;
    }

    if (exportRequested) {
      TraceLog(LOG_INFO, "Export trigger detected");
      std::cout << "Export trigger detected" << std::endl;
      if (!sceneData.objects.empty()) {
        // Combine all objects for export
        std::vector<manifold::Manifold> allGeometry;
        allGeometry.reserve(sceneData.objects.size());
        for (const auto &obj : sceneData.objects) {
          if (obj.geometry) {
            allGeometry.push_back(*obj.geometry);
          }
        }

        if (!allGeometry.empty()) {
          manifold::Manifold combined = manifold::Manifold::Compose(allGeometry);

          std::filesystem::path downloads;
          if (const char *home = std::getenv("HOME")) {
            downloads = std::filesystem::path(home) / "Downloads";
          } else {
            downloads = std::filesystem::current_path();
          }

          std::error_code dirErr;
          std::filesystem::create_directories(downloads, dirErr);
          if (dirErr && !std::filesystem::exists(downloads)) {
            reportStatus("Export failed: cannot access " + downloads.string());
          } else {
            std::filesystem::path savePath = downloads / "ding.stl";
            std::string error;
            const bool ok = WriteMeshAsBinaryStl(combined.GetMeshGL(), savePath, error);
            TraceLog(LOG_INFO, "Export path: %s", savePath.string().c_str());
            if (ok) {
              reportStatus("Saved " + savePath.string());
            } else {
              reportStatus(error);
            }
          }
        } else {
          reportStatus("No geometry to export");
        }
      } else {
        reportStatus("No scene loaded to export");
      }
    }

    // Check if mouse is over any UI panel - if so, skip camera controls
    bool mouseOverPanel = false;
    {
      Vector2 mousePos = GetMousePosition();
      int screenWidth = GetScreenWidth();
      int screenHeight = GetScreenHeight();

      // Materials panel bounds (left side)
      if (showMaterialsPanel && !sceneMaterials.empty()) {
        Rectangle matPanel = {10.0f, 10.0f, 320.0f, static_cast<float>(screenHeight) - 20.0f};
        if (CheckCollisionPointRec(mousePos, matPanel)) {
          mouseOverPanel = true;
        }
      }

      // Parameters panel bounds (right side)
      if (showParametersPanel && !sceneParameters.empty()) {
        float paramPanelWidth = 280.0f;
        float paramPanelX = static_cast<float>(screenWidth) - paramPanelWidth - 10.0f;
        Rectangle paramPanel = {paramPanelX, 10.0f, paramPanelWidth, static_cast<float>(screenHeight) - 20.0f};
        if (CheckCollisionPointRec(mousePos, paramPanel)) {
          mouseOverPanel = true;
        }
      }
    }

    if (!mouseOverPanel && IsMouseButtonDown(MOUSE_BUTTON_LEFT)) {
      orbitYaw -= mouseDelta.x * 0.01f;
      orbitPitch += mouseDelta.y * 0.01f;
      const float limit = DEG2RAD * 89.0f;
      orbitPitch = Clamp(orbitPitch, -limit, limit);
    }

    const float wheel = GetMouseWheelMove();
    if (!mouseOverPanel && wheel != 0.0f) {
      orbitDistance *= (1.0f - wheel * 0.1f);
      orbitDistance = Clamp(orbitDistance, 1.0f, 50.0f);
    }

    const Vector3 forward = Vector3Normalize(Vector3Subtract(camera.target, camera.position));
    const Vector3 worldUp = {0.0f, 1.0f, 0.0f};
    const Vector3 right = Vector3Normalize(Vector3CrossProduct(worldUp, forward));
    const Vector3 camUp = Vector3CrossProduct(forward, right);

    if (!mouseOverPanel && IsMouseButtonDown(MOUSE_BUTTON_RIGHT)) {
      camera.target = Vector3Add(camera.target,
                                 Vector3Scale(right, mouseDelta.x * 0.01f * orbitDistance));
      camera.target = Vector3Add(camera.target,
                                 Vector3Scale(camUp, -mouseDelta.y * 0.01f * orbitDistance));
    }

    if (IsKeyPressed(KEY_SPACE)) {
      camera.target = initialTarget;
      orbitDistance = initialDistance;
      orbitYaw = initialYaw;
      orbitPitch = initialPitch;
    }

    const float moveSpeed = 0.05f * orbitDistance;
    if (IsKeyDown(KEY_W)) camera.target = Vector3Add(camera.target, Vector3Scale(forward, moveSpeed));
    if (IsKeyDown(KEY_S)) camera.target = Vector3Add(camera.target, Vector3Scale(forward, -moveSpeed));
    if (IsKeyDown(KEY_A)) camera.target = Vector3Add(camera.target, Vector3Scale(right, -moveSpeed));
    if (IsKeyDown(KEY_D)) camera.target = Vector3Add(camera.target, Vector3Scale(right, moveSpeed));
    if (IsKeyDown(KEY_Q)) camera.target = Vector3Add(camera.target, Vector3Scale(worldUp, -moveSpeed));
    if (IsKeyDown(KEY_E)) camera.target = Vector3Add(camera.target, Vector3Scale(worldUp, moveSpeed));

    const Vector3 offsets = {
        orbitDistance * cosf(orbitPitch) * sinf(orbitYaw),
        orbitDistance * sinf(orbitPitch),
        orbitDistance * cosf(orbitPitch) * cosf(orbitYaw)};
    camera.position = Vector3Add(camera.target, offsets);
    camera.up = worldUp;

    const int screenWidth = std::max(GetScreenWidth(), 1);
    const int screenHeight = std::max(GetScreenHeight(), 1);
    if (screenWidth != prevScreenWidth || screenHeight != prevScreenHeight) {
      UnloadRenderTexture(rtColor);
      UnloadRenderTexture(rtNormalDepth);
      auto resizedTargets = makeRenderTargets();
      rtColor = resizedTargets.first;
      rtNormalDepth = resizedTargets.second;
      SetShaderValueTexture(edgeShader, locNormDepthTexture, rtNormalDepth.texture);
      const float texel[2] = {
          1.0f / static_cast<float>(rtNormalDepth.texture.width),
          1.0f / static_cast<float>(rtNormalDepth.texture.height)};
      SetShaderValue(edgeShader, locTexel, texel, SHADER_UNIFORM_VEC2);
      prevScreenWidth = screenWidth;
      prevScreenHeight = screenHeight;
    }

    Matrix view = GetCameraMatrix(camera);
    Vector3 lightDirVS = {
        view.m0 * lightDirWS.x + view.m4 * lightDirWS.y + view.m8 * lightDirWS.z,
        view.m1 * lightDirWS.x + view.m5 * lightDirWS.y + view.m9 * lightDirWS.z,
        view.m2 * lightDirWS.x + view.m6 * lightDirWS.y + view.m10 * lightDirWS.z};
    lightDirVS = Vector3Normalize(lightDirVS);
    SetShaderValue(toonShader, locLightDirVS, &lightDirVS.x, SHADER_UNIFORM_VEC3);

    float outlineThickness = 0.0f;
    {
      const float pixels = 2.0f;
      const float distance = Vector3Distance(camera.position, camera.target);
      const float screenHeightF = static_cast<float>(screenHeight);
      const float worldPerPixel = (screenHeightF > 0.0f)
                                      ? 2.0f * tanf(DEG2RAD * camera.fovy * 0.5f) * distance / screenHeightF
                                      : 0.0f;
      outlineThickness = pixels * worldPerPixel;
    }
    setOutlineUniforms(outlineThickness, outlineColor);

    SetShaderValue(normalDepthShader, locNear, &zNear, SHADER_UNIFORM_FLOAT);
    SetShaderValue(normalDepthShader, locFar, &zFar, SHADER_UNIFORM_FLOAT);

    BeginTextureMode(rtColor);
    ClearBackground(RAYWHITE);
    BeginMode3D(camera);
    DrawXZGrid(40, 0.5f, Fade(LIGHTGRAY, 0.4f));
    DrawAxes(2.0f);

    // Draw all models - outline pass
    rlDisableBackfaceCulling();
    for (const auto &modelWithColor : models) {
      for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
        DrawMesh(modelWithColor.model.meshes[i], outlineMat, modelWithColor.model.transform);
      }
    }
    rlEnableBackfaceCulling();

    // Draw all models - toon shading pass (set color per model)
    static bool loggedOnce = false;
    for (const auto &modelWithColor : models) {
      const float baseCol[4] = {
        modelWithColor.color.r / 255.0f,
        modelWithColor.color.g / 255.0f,
        modelWithColor.color.b / 255.0f,
        1.0f
      };

      if (!loggedOnce) {
        TraceLog(LOG_INFO, "Drawing with color: R=%.2f G=%.2f B=%.2f", baseCol[0], baseCol[1], baseCol[2]);
        std::cout << "Drawing with color: R=" << baseCol[0] << " G=" << baseCol[1] << " B=" << baseCol[2] << std::endl;
      }

      SetShaderValue(toonShader, locBaseColor, baseCol, SHADER_UNIFORM_VEC4);

      for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
        DrawMesh(modelWithColor.model.meshes[i], toonMat, modelWithColor.model.transform);
      }
    }
    loggedOnce = true;
    EndMode3D();
    EndTextureMode();

    BeginTextureMode(rtNormalDepth);
    ClearBackground({127, 127, 255, 0});
    BeginMode3D(camera);
    for (const auto &modelWithColor : models) {
      for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
        DrawMesh(modelWithColor.model.meshes[i], normalDepthMat, modelWithColor.model.transform);
      }
    }
    EndMode3D();
    EndTextureMode();

    BeginDrawing();
    ClearBackground(RAYWHITE);

    const float texel[2] = {
        1.0f / static_cast<float>(rtNormalDepth.texture.width),
        1.0f / static_cast<float>(rtNormalDepth.texture.height)};
    SetShaderValue(edgeShader, locTexel, texel, SHADER_UNIFORM_VEC2);

    BeginShaderMode(edgeShader);
    const Rectangle srcRect = {0.0f, 0.0f, static_cast<float>(rtColor.texture.width),
                               -static_cast<float>(rtColor.texture.height)};
    DrawTextureRec(rtColor.texture, srcRect, {0.0f, 0.0f}, WHITE);
    EndShaderMode();

    const float margin = 15.0f;
    const Vector2 brandPos = {margin, margin};  // Top left above materials panel
    DrawTextEx(brandingFont, kBrandText, brandPos, kBrandFontSize, 0.0f, DARKGRAY);

    // Status message removed - script name not shown at top

    // ========================================================================
    // MATERIALS PANEL (Left side)
    // ========================================================================
    if (showMaterialsPanel && !sceneMaterials.empty()) {
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
      for (const auto &mat : sceneMaterials) {
        categoryTotals[mat.category] += mat.unitPrice * mat.quantity;
        totalCost += mat.unitPrice * mat.quantity;
      }

      for (const auto &mat : sceneMaterials) {
        if (yPos > panelY + panelHeight - 50.0f) break;  // Don't overflow

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

        // Truncate if too long
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

    // ========================================================================
    // PARAMETERS PANEL (Right side)
    // ========================================================================
    if (showParametersPanel && !sceneParameters.empty()) {
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
      if (GuiCheckBox(checkboxRect, "Live", &liveUpdatesEnabled)) {
        // Checkbox was clicked
      }

      // Track if any slider is being dragged (defer file write until mouse release)
      static int draggingParamIndex = -1;
      static float draggingStartValue = 0.0f;

      for (size_t i = 0; i < sceneParameters.size(); ++i) {
        if (yPos > panelY + panelHeight - 30.0f) break;  // Don't overflow

        auto &param = sceneParameters[i];

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
        float newValue = GuiSlider(sliderRect, "", "", &param.value, param.minValue, param.maxValue);
        (void)newValue;  // GuiSlider modifies param.value directly

        // Round to integer for most params
        param.value = std::round(param.value);

        // Track dragging state - start drag when value changes
        if (param.value != oldValue && draggingParamIndex == -1) {
          draggingParamIndex = static_cast<int>(i);
          draggingStartValue = oldValue;
        }

        yPos += rowHeight;
      }

      // Only write to file when mouse is released (end of drag)
      if (draggingParamIndex >= 0 && IsMouseButtonReleased(MOUSE_BUTTON_LEFT)) {
        auto &param = sceneParameters[draggingParamIndex];
        // Only write if value actually changed from start
        if (param.value != draggingStartValue && !loadingInBackground) {
          if (WriteParameterToFile(scriptPath, param)) {
            // File watcher will detect the change and trigger reload
          }
        }
        draggingParamIndex = -1;
      }

      // Hotkey hint at bottom
      DrawTextEx(uiFont, "[T] TOGGLE", {panelX + panelWidth - 85, panelY + panelHeight - 18}, 12.0f, 0.0f, LIGHTGRAY);
    }

    EndDrawing();

    // If in render mode, take screenshot after rendering a few frames (to ensure everything is loaded)
    if (renderMode && !screenshotTaken && frameCount >= 3) {
      TakeScreenshot(renderOutputPath.c_str());
      TraceLog(LOG_INFO, "Rendered to: %s", renderOutputPath.c_str());
      std::cout << "Rendered to: " << renderOutputPath << std::endl;
      screenshotTaken = true;
      break;  // Exit the loop
    }
  }

  UnloadRenderTexture(rtColor);
  UnloadRenderTexture(rtNormalDepth);
  UnloadMaterial(toonMat);
  UnloadMaterial(normalDepthMat);
  UnloadMaterial(outlineMat);   // also releases the shader
  UnloadShader(edgeShader);
  DestroyModels(models);
  if (brandingFontCustom) {
    UnloadFont(brandingFont);
  }
  if (uiFontCustom) {
    UnloadFont(uiFont);
  }
  JS_FreeRuntime(runtime);
  CloseWindow();

  return 0;
}
