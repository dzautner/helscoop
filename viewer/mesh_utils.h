#pragma once

#include "types.h"
#include "manifold/manifold.h"
#include "raylib.h"

#include <vector>

namespace dingcad {

// Convert manifold mesh to raylib Model
Model CreateRaylibModelFrom(const manifold::MeshGL& meshGL, Color baseColor = kBaseColor);

// Destroy a single Model
void DestroyModel(Model& model);

// Convert SceneData to vector of raylib Models
std::vector<ModelWithColor> CreateModelsFromScene(const SceneData& sceneData);

// Convert pre-computed meshes to raylib Models (for GPU upload after background load)
std::vector<ModelWithColor> CreateModelsFromPrecomputed(std::vector<PrecomputedMesh>& meshes);

// Destroy all models in a vector
void DestroyModels(std::vector<ModelWithColor>& models);

// Draw debug axes
void DrawAxes(float length);

// Draw XZ grid
void DrawXZGrid(int halfLines, float spacing, Color color);

}  // namespace dingcad
