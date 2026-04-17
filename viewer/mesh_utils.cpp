#include "mesh_utils.h"
#include "raymath.h"
#include "rlgl.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <future>
#include <iostream>
#include <limits>
#include <vector>

namespace dingcad {

void DestroyModel(Model& model) {
  if (model.meshes != nullptr || model.materials != nullptr) {
    UnloadModel(model);
  }
  model = Model{};
}

Model CreateRaylibModelFrom(const manifold::MeshGL& meshGL, Color baseColor) {
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
    const float cadX = meshGL.vertProperties[base + 0] * kSceneScale;
    const float cadY = meshGL.vertProperties[base + 1] * kSceneScale;
    const float cadZ = meshGL.vertProperties[base + 2] * kSceneScale;
    positions[v] = {cadX, cadZ, -cadY};  // Z-up to Y-up conversion
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
    const Vector3 n = {u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x};

    accum[i0].x += n.x; accum[i0].y += n.y; accum[i0].z += n.z;
    accum[i1].x += n.x; accum[i1].y += n.y; accum[i1].z += n.z;
    accum[i2].x += n.x; accum[i2].y += n.y; accum[i2].z += n.z;
  }

  std::vector<Vector3> normals(vertexCount);
  std::vector<Vector2> texcoords(vertexCount);
  const float textureScale = 1.0f;

  for (int v = 0; v < vertexCount; ++v) {
    const Vector3 n = accum[v];
    const float length = std::sqrt(n.x * n.x + n.y * n.y + n.z * n.z);

    Vector3 normal = {0.0f, 1.0f, 0.0f};
    if (length > 0.0f) {
      normal = {n.x / length, n.y / length, n.z / length};
    }
    normals[v] = normal;

    // Triplanar UV mapping based on dominant normal axis
    const Vector3& pos = positions[v];
    const float absX = std::fabs(normal.x);
    const float absY = std::fabs(normal.y);
    const float absZ = std::fabs(normal.z);

    Vector2 uv;
    if (absX >= absY && absX >= absZ) {
      uv = {pos.z * textureScale, pos.y * textureScale};
    } else if (absY >= absX && absY >= absZ) {
      uv = {pos.x * textureScale, pos.z * textureScale};
    } else {
      uv = {pos.x * textureScale, pos.y * textureScale};
    }
    texcoords[v] = uv;
  }

  constexpr int kMaxVerticesPerMesh = std::numeric_limits<unsigned short>::max();
  std::vector<int> remap(vertexCount, 0);
  std::vector<int> remapMarker(vertexCount, 0);
  int chunkToken = 1;

  std::vector<Mesh> meshes;
  meshes.reserve(static_cast<size_t>(triangleCount) / kMaxVerticesPerMesh + 1);

  int triIndex = 0;
  while (triIndex < triangleCount) {
    const int currentToken = chunkToken++;
    int chunkVertexCount = 0;
    std::vector<Vector3> chunkPositions;
    std::vector<Vector3> chunkNormals;
    std::vector<Vector2> chunkTexcoords;
    std::vector<unsigned short> chunkIndices;

    chunkPositions.reserve(std::min(kMaxVerticesPerMesh, vertexCount));
    chunkNormals.reserve(std::min(kMaxVerticesPerMesh, vertexCount));
    chunkTexcoords.reserve(std::min(kMaxVerticesPerMesh, vertexCount));
    chunkIndices.reserve(std::min(kMaxVerticesPerMesh, vertexCount) * 3);

    while (triIndex < triangleCount) {
      const int indices[3] = {
        static_cast<int>(meshGL.triVerts[triIndex * 3 + 0]),
        static_cast<int>(meshGL.triVerts[triIndex * 3 + 1]),
        static_cast<int>(meshGL.triVerts[triIndex * 3 + 2])
      };

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
          chunkTexcoords.push_back(texcoords[original]);
        }
        chunkIndices.push_back(static_cast<unsigned short>(remap[original]));
      }
      ++triIndex;
    }

    Mesh chunkMesh = {0};
    chunkMesh.vertexCount = chunkVertexCount;
    chunkMesh.triangleCount = static_cast<int>(chunkIndices.size() / 3);
    chunkMesh.vertices = static_cast<float*>(MemAlloc(chunkVertexCount * 3 * sizeof(float)));
    chunkMesh.normals = static_cast<float*>(MemAlloc(chunkVertexCount * 3 * sizeof(float)));
    chunkMesh.texcoords = static_cast<float*>(MemAlloc(chunkVertexCount * 2 * sizeof(float)));
    chunkMesh.indices = static_cast<unsigned short*>(MemAlloc(chunkIndices.size() * sizeof(unsigned short)));
    chunkMesh.colors = nullptr;
    chunkMesh.texcoords2 = nullptr;
    chunkMesh.tangents = nullptr;

    for (int v = 0; v < chunkVertexCount; ++v) {
      const Vector3& pos = chunkPositions[v];
      chunkMesh.vertices[v * 3 + 0] = pos.x;
      chunkMesh.vertices[v * 3 + 1] = pos.y;
      chunkMesh.vertices[v * 3 + 2] = pos.z;

      const Vector3& normal = chunkNormals[v];
      chunkMesh.normals[v * 3 + 0] = normal.x;
      chunkMesh.normals[v * 3 + 1] = normal.y;
      chunkMesh.normals[v * 3 + 2] = normal.z;

      const Vector2& uv = chunkTexcoords[v];
      chunkMesh.texcoords[v * 2 + 0] = uv.x;
      chunkMesh.texcoords[v * 2 + 1] = uv.y;
    }

    std::memcpy(chunkMesh.indices, chunkIndices.data(), chunkIndices.size() * sizeof(unsigned short));
    UploadMesh(&chunkMesh, false);
    meshes.push_back(chunkMesh);
  }

  if (meshes.empty()) {
    return model;
  }

  model.transform = MatrixIdentity();
  model.meshCount = static_cast<int>(meshes.size());
  model.meshes = static_cast<Mesh*>(MemAlloc(model.meshCount * sizeof(Mesh)));
  for (int i = 0; i < model.meshCount; ++i) {
    model.meshes[i] = meshes[i];
  }
  model.materialCount = 1;
  model.materials = static_cast<Material*>(MemAlloc(sizeof(Material)));
  model.materials[0] = LoadMaterialDefault();
  model.meshMaterial = static_cast<int*>(MemAlloc(model.meshCount * sizeof(int)));
  for (int i = 0; i < model.meshCount; ++i) {
    model.meshMaterial[i] = 0;
  }

  return model;
}

std::vector<ModelWithColor> CreateModelsFromScene(const SceneData& sceneData) {
  auto start = std::chrono::high_resolution_clock::now();

  struct MeshTask {
    std::future<manifold::MeshGL> future;
    Color color;
    std::string materialId;
    size_t sceneObjectIndex;  // Track original index for assemblyOnly check
  };
  std::vector<MeshTask> tasks;
  tasks.reserve(sceneData.objects.size());

  for (size_t i = 0; i < sceneData.objects.size(); ++i) {
    const auto& obj = sceneData.objects[i];
    if (obj.geometry) {
      tasks.push_back({
        std::async(std::launch::async, [geom = obj.geometry]() {
          return geom->GetMeshGL();
        }),
        obj.color,
        obj.materialId,
        i  // Store original scene object index
      });
    }
  }

  struct MeshResult {
    manifold::MeshGL meshGL;
    Color color;
    std::string materialId;
    size_t sceneObjectIndex;
  };
  std::vector<MeshResult> meshes;
  meshes.reserve(tasks.size());
  for (auto& task : tasks) {
    meshes.push_back({task.future.get(), task.color, std::move(task.materialId), task.sceneObjectIndex});
  }

  auto meshEnd = std::chrono::high_resolution_clock::now();
  auto meshMs = std::chrono::duration_cast<std::chrono::milliseconds>(meshEnd - start).count();

  std::vector<ModelWithColor> result;
  result.reserve(meshes.size());
  for (auto& mesh : meshes) {
    Model model = CreateRaylibModelFrom(mesh.meshGL, mesh.color);
    result.push_back({model, mesh.color, std::move(mesh.materialId), mesh.sceneObjectIndex});
  }

  auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::high_resolution_clock::now() - start).count();
  TraceLog(LOG_INFO, "PROFILE: CreateModelsFromScene: tessellation=%lld ms, total=%lld ms (%zu objects)",
           meshMs, totalMs, result.size());

  return result;
}

std::vector<ModelWithColor> CreateModelsFromPrecomputed(std::vector<PrecomputedMesh>& meshes) {
  auto start = std::chrono::high_resolution_clock::now();

  std::vector<ModelWithColor> result;
  result.reserve(meshes.size());

  for (auto& mesh : meshes) {
    Model model = CreateRaylibModelFrom(mesh.meshGL, mesh.color);
    result.push_back({model, mesh.color, mesh.materialId, mesh.sceneObjectIndex, mesh.roughness, mesh.metallic});
  }

  auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::high_resolution_clock::now() - start).count();
  TraceLog(LOG_INFO, "PROFILE: CreateModelsFromPrecomputed (GPU upload): %lld ms (%zu objects)",
           totalMs, result.size());

  return result;
}

void DestroyModels(std::vector<ModelWithColor>& models) {
  for (auto& modelWithColor : models) {
    DestroyModel(modelWithColor.model);
  }
  models.clear();
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

  drawAxis({1.0f, 0.0f, 0.0f}, RED);
  drawAxis({0.0f, 1.0f, 0.0f}, GREEN);
  drawAxis({0.0f, 0.0f, 1.0f}, BLUE);

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

PickResult PickModelAtRay(const Ray& ray, const std::vector<ModelWithColor>& models) {
  PickResult result;
  float closestDistance = std::numeric_limits<float>::max();

  for (size_t modelIdx = 0; modelIdx < models.size(); ++modelIdx) {
    const auto& modelWithColor = models[modelIdx];
    const Model& model = modelWithColor.model;

    // Test each mesh in the model
    for (int meshIdx = 0; meshIdx < model.meshCount; ++meshIdx) {
      RayCollision collision = GetRayCollisionMesh(ray, model.meshes[meshIdx], model.transform);
      if (collision.hit && collision.distance < closestDistance) {
        closestDistance = collision.distance;
        result.hit = true;
        result.distance = collision.distance;
        result.modelIndex = static_cast<int>(modelIdx);
        result.materialId = modelWithColor.materialId;
      }
    }
  }

  return result;
}

}  // namespace dingcad
