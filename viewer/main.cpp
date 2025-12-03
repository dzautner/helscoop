#include "raylib.h"
#include "raymath.h"
#include "rlgl.h"

#ifdef __APPLE__
#include <OpenGL/gl3.h>
#endif

#include <atomic>
#include <cfloat>
#include <chrono>
#include <cmath>
#include <future>
#include <iostream>
#include <mutex>
#include <set>
#include <thread>
#include <unordered_map>

extern "C" {
#include "quickjs.h"
}

#include "manifold/manifold.h"
#include "js_bindings.h"

#include "shaders.h"
#include "types.h"
#include "file_utils.h"
#include "mesh_utils.h"
#include "scene_loader.h"
#include "material_loader.h"
#include "ui_panels.h"
#include "thermal.h"
#include "structural.h"
#include "ifc_export.h"
#include "blueprint_export.h"
#include "assembly.h"

using namespace dingcad;

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
  JS_SetModuleLoaderFunc(runtime, nullptr, FilesystemModuleLoader, &g_moduleLoaderData);

  // Load material library
  InitMaterialLibrary(std::filesystem::current_path());

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

  std::vector<MaterialItem> initialMaterials;
  AssemblyInstructions initialAssembly;
  if (defaultScript) {
    scriptPath = std::filesystem::absolute(*defaultScript);
    auto load = LoadSceneFromFile(runtime, scriptPath);
    if (load.success) {
      sceneData = load.sceneData;
      initialMaterials = std::move(load.materials);
      initialAssembly = std::move(load.assembly);
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

  // UI State
  UIState uiState;
  std::vector<SceneParameter> sceneParameters;
  std::vector<MaterialItem> sceneMaterials = std::move(initialMaterials);
  ThermalAnalysisResult thermalResult;
  bool thermalResultDirty = true;  // Flag to recalculate when scene changes
  StructuralAnalysisResult structuralResult;
  bool structuralResultDirty = true;  // Flag to recalculate when scene changes
  AssemblyInstructions assemblyInstructions = std::move(initialAssembly);
  if (!assemblyInstructions.steps.empty()) {
    ResolveAssemblyMaterials(assemblyInstructions, sceneData);
  }
  bool assemblyDirty = assemblyInstructions.steps.empty();  // Only regenerate if not scene-defined

  auto refreshParameters = [&]() {
    if (!scriptPath.empty()) {
      sceneParameters = ParseSceneParameters(scriptPath);
      TraceLog(LOG_INFO, "Parsed %zu parameters", sceneParameters.size());
    }
  };

  refreshParameters();
  TraceLog(LOG_INFO, "Initial load: %zu parameters, %zu materials",
           sceneParameters.size(), sceneMaterials.size());

  // Load shaders
  Shader outlineShader = LoadShaderFromMemory(shaders::kOutlineVS, shaders::kOutlineFS);
  Shader toonShader = LoadShaderFromMemory(shaders::kToonVS, shaders::kToonFS);
  Shader normalDepthShader = LoadShaderFromMemory(shaders::kNormalDepthVS, shaders::kNormalDepthFS);
  Shader edgeShader = LoadShaderFromMemory(shaders::kEdgeQuadVS, shaders::kEdgeFS);
  Shader pbrShader = LoadShaderFromMemory(shaders::kPBR_VS, shaders::kPBR_FS);
  Shader skyShader = LoadShaderFromMemory(shaders::kSky_VS, shaders::kSky_FS);

  if (outlineShader.id == 0 || toonShader.id == 0 || normalDepthShader.id == 0 || edgeShader.id == 0 || pbrShader.id == 0 || skyShader.id == 0) {
    TraceLog(LOG_ERROR, "Failed to load one or more shaders.");
    DestroyModels(models);
    if (brandingFontCustom) UnloadFont(brandingFont);
    if (uiFontCustom) UnloadFont(uiFont);
    JS_FreeRuntime(runtime);
    CloseWindow();
    return 1;
  }

  // Shadow mapping shaders
  Shader shadowDepthShader = LoadShaderFromMemory(shaders::kShadowDepth_VS, shaders::kShadowDepth_FS);
  Shader pbrShadowShader = LoadShaderFromMemory(shaders::kPBRShadow_VS, shaders::kPBRShadow_FS);
  // Shadow mapping disabled - causes visual artifacts (minimap bug)
  bool shadowsEnabled = false;
  // bool shadowsEnabled = (shadowDepthShader.id != 0 && pbrShadowShader.id != 0);
  // if (shadowsEnabled) {
  //   TraceLog(LOG_INFO, "Shadow mapping enabled");
  // }

  // Ground plane shader
  Shader groundPlaneShader = LoadShaderFromMemory(shaders::kGroundPlane_VS, shaders::kGroundPlane_FS);
  const int locGroundColor = GetShaderLocation(groundPlaneShader, "groundColor");
  const int locHorizonColor = GetShaderLocation(groundPlaneShader, "horizonColor");
  const int locFadeRadius = GetShaderLocation(groundPlaneShader, "fadeRadius");
  const int locSceneCenter = GetShaderLocation(groundPlaneShader, "sceneCenter");

  Material groundPlaneMat = LoadMaterialDefault();
  groundPlaneMat.shader = groundPlaneShader;

  // Outline shader setup
  const int locOutline = GetShaderLocation(outlineShader, "outline");
  const int locOutlineColor = GetShaderLocation(outlineShader, "outlineColor");
  Material outlineMat = LoadMaterialDefault();
  outlineMat.shader = outlineShader;

  auto setOutlineUniforms = [&](float worldThickness, Color color) {
    float c[4] = {color.r / 255.0f, color.g / 255.0f, color.b / 255.0f, color.a / 255.0f};
    SetShaderValue(outlineMat.shader, locOutline, &worldThickness, SHADER_UNIFORM_FLOAT);
    SetShaderValue(outlineMat.shader, locOutlineColor, c, SHADER_UNIFORM_VEC4);
  };

  // Toon shader setup
  const int locLightDirVS = GetShaderLocation(toonShader, "lightDirVS");
  const int locBaseColor = GetShaderLocation(toonShader, "baseColor");
  const int locToonSteps = GetShaderLocation(toonShader, "toonSteps");
  const int locAmbient = GetShaderLocation(toonShader, "ambient");
  const int locDiffuseWeight = GetShaderLocation(toonShader, "diffuseWeight");
  const int locRimWeight = GetShaderLocation(toonShader, "rimWeight");
  const int locSpecWeight = GetShaderLocation(toonShader, "specWeight");
  const int locSpecShininess = GetShaderLocation(toonShader, "specShininess");
  const int locAlbedoTex = GetShaderLocation(toonShader, "albedoTex");
  const int locUseTexture = GetShaderLocation(toonShader, "useTexture");
  Material toonMat = LoadMaterialDefault();
  toonMat.shader = toonShader;
  // Tell raylib that our albedoTex sampler is at SHADER_LOC_MAP_DIFFUSE location
  // This makes raylib bind material.maps[MATERIAL_MAP_DIFFUSE].texture to our sampler
  toonShader.locs[SHADER_LOC_MAP_DIFFUSE] = locAlbedoTex;

  // Normal/depth shader setup
  const int locNear = GetShaderLocation(normalDepthShader, "zNear");
  const int locFar = GetShaderLocation(normalDepthShader, "zFar");
  Material normalDepthMat = LoadMaterialDefault();
  normalDepthMat.shader = normalDepthShader;

  // Edge composite shader setup
  const int locNormDepthTexture = GetShaderLocation(edgeShader, "normDepthTex");
  const int locTexel = GetShaderLocation(edgeShader, "texel");
  const int locNormalThreshold = GetShaderLocation(edgeShader, "normalThreshold");
  const int locDepthThreshold = GetShaderLocation(edgeShader, "depthThreshold");
  const int locEdgeIntensity = GetShaderLocation(edgeShader, "edgeIntensity");
  const int locInkColor = GetShaderLocation(edgeShader, "inkColor");

  // PBR shader setup
  const int locPbrAlbedoColor = GetShaderLocation(pbrShader, "albedoColor");
  const int locPbrMetallic = GetShaderLocation(pbrShader, "metallic");
  const int locPbrRoughness = GetShaderLocation(pbrShader, "roughness");
  const int locPbrAo = GetShaderLocation(pbrShader, "ao");
  const int locPbrAlbedoTex = GetShaderLocation(pbrShader, "albedoTex");
  const int locPbrUseAlbedoTex = GetShaderLocation(pbrShader, "useAlbedoTex");
  const int locPbrLightDir = GetShaderLocation(pbrShader, "lightDir");
  const int locPbrLightColor = GetShaderLocation(pbrShader, "lightColor");
  const int locPbrLightDir2 = GetShaderLocation(pbrShader, "lightDir2");
  const int locPbrLightColor2 = GetShaderLocation(pbrShader, "lightColor2");
  const int locPbrSkyTop = GetShaderLocation(pbrShader, "skyColorTop");
  const int locPbrSkyBottom = GetShaderLocation(pbrShader, "skyColorBottom");
  const int locPbrGround = GetShaderLocation(pbrShader, "groundColor");

  Material pbrMat = LoadMaterialDefault();
  pbrMat.shader = pbrShader;
  pbrShader.locs[SHADER_LOC_MAP_DIFFUSE] = locPbrAlbedoTex;

  // PBR environment colors (soft outdoor lighting)
  const float pbrSkyTop[3] = {0.5f, 0.7f, 1.0f};     // Light blue sky
  const float pbrSkyBottom[3] = {0.9f, 0.9f, 0.95f}; // Pale horizon
  const float pbrGround[3] = {0.3f, 0.35f, 0.25f};   // Grass/ground reflection
  SetShaderValue(pbrShader, locPbrSkyTop, pbrSkyTop, SHADER_UNIFORM_VEC3);
  SetShaderValue(pbrShader, locPbrSkyBottom, pbrSkyBottom, SHADER_UNIFORM_VEC3);
  SetShaderValue(pbrShader, locPbrGround, pbrGround, SHADER_UNIFORM_VEC3);

  // PBR light (sun-like directional) - bright for good contrast
  const float pbrLightColor[3] = {4.5f, 4.3f, 3.8f}; // Bright warm sunlight (HDR intensity)
  SetShaderValue(pbrShader, locPbrLightColor, pbrLightColor, SHADER_UNIFORM_VEC3);

  // Secondary light (cool fill from opposite side) - fills in shadows
  const float pbrLightColor2[3] = {0.8f, 0.9f, 1.2f}; // Cool blue-ish fill light

  // Rendering mode toggle
  bool pbrModeEnabled = true;  // Start with PBR enabled for realistic look

  // Sky shader setup
  const int locSkyTop = GetShaderLocation(skyShader, "skyTop");
  const int locSkyHorizon = GetShaderLocation(skyShader, "skyHorizon");
  const int locSkyGround = GetShaderLocation(skyShader, "groundColor");

  // Sky colors - vibrant outdoor lighting
  const float skyTopCol[3] = {0.4f, 0.6f, 0.95f};       // Bright blue sky
  const float skyHorizonCol[3] = {0.85f, 0.9f, 1.0f};   // Light blue/white horizon
  const float skyGroundCol[3] = {0.4f, 0.45f, 0.35f};   // Muted ground color
  SetShaderValue(skyShader, locSkyTop, skyTopCol, SHADER_UNIFORM_VEC3);
  SetShaderValue(skyShader, locSkyHorizon, skyHorizonCol, SHADER_UNIFORM_VEC3);
  SetShaderValue(skyShader, locSkyGround, skyGroundCol, SHADER_UNIFORM_VEC3);

  Material skyMat = LoadMaterialDefault();
  skyMat.shader = skyShader;

  // Create fullscreen quad mesh for sky rendering (in clip space XY plane)
  // GenMeshPlane creates in XZ, so we rotate the transform when drawing
  Mesh skyQuad = GenMeshPlane(2.0f, 2.0f, 1, 1);
  UploadMesh(&skyQuad, false);
  // Transform to put plane in XY (rotate -90 degrees around X axis)
  Matrix skyTransform = MatrixRotateX(-90.0f * DEG2RAD);

  // Create ground plane mesh for PBR mode (large, high-res for smooth fade)
  const float groundPlaneSize = 60.0f;
  Mesh groundPlaneMesh = GenMeshPlane(groundPlaneSize, groundPlaneSize, 1, 1);
  UploadMesh(&groundPlaneMesh, false);
  Matrix groundPlaneTransform = MatrixTranslate(0.0f, -0.01f, 0.0f);  // Slightly below origin

  // ============================================================================
  // Shadow mapping setup - Use standard render texture and encode depth in color
  // ============================================================================
  const int SHADOW_MAP_SIZE = 2048;
  RenderTexture2D shadowMap = {0};
  if (shadowsEnabled) {
    shadowMap = LoadRenderTexture(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    // Set texture filtering for shadow map
    SetTextureFilter(shadowMap.texture, TEXTURE_FILTER_BILINEAR);
    SetTextureWrap(shadowMap.texture, TEXTURE_WRAP_CLAMP);
    TraceLog(LOG_INFO, "Shadow map render texture created successfully (%dx%d)", SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  }

  // Shadow depth shader uniforms
  const int locShadowLightMVP = GetShaderLocation(shadowDepthShader, "lightMVP");

  // PBR Shadow shader uniforms
  const int locPbrShadowAlbedoColor = GetShaderLocation(pbrShadowShader, "albedoColor");
  const int locPbrShadowMetallic = GetShaderLocation(pbrShadowShader, "metallic");
  const int locPbrShadowRoughness = GetShaderLocation(pbrShadowShader, "roughness");
  const int locPbrShadowAo = GetShaderLocation(pbrShadowShader, "ao");
  const int locPbrShadowAlbedoTex = GetShaderLocation(pbrShadowShader, "albedoTex");
  const int locPbrShadowUseAlbedoTex = GetShaderLocation(pbrShadowShader, "useAlbedoTex");
  const int locPbrShadowShadowMap = GetShaderLocation(pbrShadowShader, "shadowMap");
  const int locPbrShadowLightDir = GetShaderLocation(pbrShadowShader, "lightDir");
  const int locPbrShadowLightColor = GetShaderLocation(pbrShadowShader, "lightColor");
  const int locPbrShadowSkyTop = GetShaderLocation(pbrShadowShader, "skyColorTop");
  const int locPbrShadowSkyBottom = GetShaderLocation(pbrShadowShader, "skyColorBottom");
  const int locPbrShadowGround = GetShaderLocation(pbrShadowShader, "groundColor");
  const int locPbrShadowLightSpaceMatrix = GetShaderLocation(pbrShadowShader, "lightSpaceMatrix");

  // Set PBR shadow shader environment colors (same as regular PBR)
  SetShaderValue(pbrShadowShader, locPbrShadowSkyTop, pbrSkyTop, SHADER_UNIFORM_VEC3);
  SetShaderValue(pbrShadowShader, locPbrShadowSkyBottom, pbrSkyBottom, SHADER_UNIFORM_VEC3);
  SetShaderValue(pbrShadowShader, locPbrShadowGround, pbrGround, SHADER_UNIFORM_VEC3);
  SetShaderValue(pbrShadowShader, locPbrShadowLightColor, pbrLightColor, SHADER_UNIFORM_VEC3);

  // Set shadow map sampler to use texture unit 1
  int shadowMapTexUnit = 1;
  SetShaderValue(pbrShadowShader, locPbrShadowShadowMap, &shadowMapTexUnit, SHADER_UNIFORM_INT);

  Material pbrShadowMat = LoadMaterialDefault();
  pbrShadowMat.shader = pbrShadowShader;
  pbrShadowShader.locs[SHADER_LOC_MAP_DIFFUSE] = locPbrShadowAlbedoTex;

  Material shadowDepthMat = LoadMaterialDefault();
  shadowDepthMat.shader = shadowDepthShader;

  // Static toon lighting configuration
  const Vector3 lightDirWS = Vector3Normalize({0.45f, 0.85f, 0.35f});
  // Secondary fill light - comes from opposite side, lower angle (simulates sky bounce)
  const Vector3 lightDir2WS = Vector3Normalize({-0.6f, 0.4f, -0.5f});
  const float baseCol[4] = {kBaseColor.r / 255.0f, kBaseColor.g / 255.0f, kBaseColor.b / 255.0f, 1.0f};
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
  int useTexture = 0;  // Default: no texture
  SetShaderValue(toonShader, locUseTexture, &useTexture, SHADER_UNIFORM_INT);

  // Load material textures (must be after OpenGL init)
  LoadMaterialTextures();

  // Create a 1x1 white fallback texture for when no material texture is available
  // This ensures the albedoTex sampler is always bound to something valid
  Image whiteImg = GenImageColor(1, 1, WHITE);
  Texture2D fallbackTexture = LoadTextureFromImage(whiteImg);
  UnloadImage(whiteImg);

  // Set fallback texture on toon material - raylib will handle texture unit binding
  // Use MATERIAL_MAP_DIFFUSE (index 0) which raylib binds to texture unit 0
  toonMat.maps[MATERIAL_MAP_DIFFUSE].texture = fallbackTexture;
  pbrMat.maps[MATERIAL_MAP_DIFFUSE].texture = fallbackTexture;

  float normalThreshold = 0.25f;
  float depthThreshold = 0.002f;
  float edgeIntensity = 1.0f;
  SetShaderValue(edgeShader, locNormalThreshold, &normalThreshold, SHADER_UNIFORM_FLOAT);
  SetShaderValue(edgeShader, locDepthThreshold, &depthThreshold, SHADER_UNIFORM_FLOAT);
  SetShaderValue(edgeShader, locEdgeIntensity, &edgeIntensity, SHADER_UNIFORM_FLOAT);

  const Color outlineColor = BLACK;
  const float inkColor[4] = {outlineColor.r / 255.0f, outlineColor.g / 255.0f, outlineColor.b / 255.0f, 1.0f};
  SetShaderValue(edgeShader, locInkColor, inkColor, SHADER_UNIFORM_VEC4);

  // Render targets
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

  auto startBackgroundLoad = [&]() {
    if (loadingInBackground) {
      TraceLog(LOG_INFO, "Background load already in progress, skipping");
      return;
    }
    loadingInBackground = true;
    backgroundLoadStartTime = std::chrono::high_resolution_clock::now();
    reportStatus("Loading...");

    backgroundLoadFuture = std::async(std::launch::async, [scriptPath]() {
      return LoadAndTessellate(scriptPath);
    });
    TraceLog(LOG_INFO, "Started background load");
  };

  auto checkBackgroundLoad = [&]() {
    if (!loadingInBackground) return;

    if (backgroundLoadFuture.wait_for(std::chrono::milliseconds(0)) != std::future_status::ready) {
      return;
    }

    BackgroundLoadResult result = backgroundLoadFuture.get();
    loadingInBackground = false;

    auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::high_resolution_clock::now() - backgroundLoadStartTime).count();

    if (result.success) {
      sceneData = std::move(result.sceneData);
      DestroyModels(models);
      models = CreateModelsFromPrecomputed(result.meshes);
      reportStatus(result.message);
      sceneParameters = ParseSceneParameters(scriptPath);
      sceneMaterials = std::move(result.materials);
      // Use scene-defined assembly if available, otherwise regenerate
      if (!result.assembly.steps.empty()) {
        assemblyInstructions = std::move(result.assembly);
        ResolveAssemblyMaterials(assemblyInstructions, sceneData);
        assemblyDirty = false;
        TraceLog(LOG_INFO, "Using scene-defined assembly: %zu steps", assemblyInstructions.steps.size());
      } else {
        assemblyDirty = true;  // Regenerate assembly after scene reload
      }
      thermalResultDirty = true;  // Recalculate thermal after scene reload
      structuralResultDirty = true;  // Recalculate structural after scene reload
      uiState.currentAssemblyStep = 0;  // Reset to first step
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

  // Main loop
  while (!WindowShouldClose()) {
    frameCount++;
    const Vector2 mouseDelta = GetMouseDelta();

    checkBackgroundLoad();

    // File watching
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
        } else if (!entry.second.timestamp.has_value() || currentTs != *entry.second.timestamp) {
          changed = true;
          break;
        }
      }
      if (changed) {
        startBackgroundLoad();
      }
    }

    // Skip global hotkeys when search filter is active (typing in search box)
    if (!uiState.materialFilterActive) {
      if (IsKeyPressed(KEY_R) && !scriptPath.empty()) {
        startBackgroundLoad();
      }

      // Panel toggle hotkeys
      if (IsKeyPressed(KEY_T)) {
        uiState.showParametersPanel = !uiState.showParametersPanel;
      }
      if (IsKeyPressed(KEY_M)) {
        uiState.showMaterialsPanel = !uiState.showMaterialsPanel;
      }
      if (IsKeyPressed(KEY_H)) {
        uiState.thermalViewEnabled = !uiState.thermalViewEnabled;
        uiState.showThermalPanel = uiState.thermalViewEnabled;
        if (uiState.thermalViewEnabled) {
          thermalResultDirty = true;  // Recalculate on toggle
        }
      }
      if (IsKeyPressed(KEY_S)) {
        uiState.showStructuralPanel = !uiState.showStructuralPanel;
        if (uiState.showStructuralPanel) {
          structuralResultDirty = true;  // Recalculate on toggle
        }
      }
      if (IsKeyPressed(KEY_A)) {
        uiState.showAssemblyPanel = !uiState.showAssemblyPanel;
        // Only regenerate if no scene-defined assembly exists
        if (uiState.showAssemblyPanel && assemblyInstructions.steps.empty()) {
          assemblyDirty = true;
        }
      }
      if (IsKeyPressed(KEY_P)) {
        pbrModeEnabled = !pbrModeEnabled;
        TraceLog(LOG_INFO, "Rendering mode: %s", pbrModeEnabled ? "PBR (Realistic)" : "Toon (Stylized)");
      }
      // Assembly step navigation with arrow keys (when panel is visible)
      if (uiState.showAssemblyPanel) {
        if (IsKeyPressed(KEY_LEFT) && uiState.currentAssemblyStep > 0) {
          uiState.currentAssemblyStep--;
        }
        if (IsKeyPressed(KEY_RIGHT) && uiState.currentAssemblyStep < static_cast<int>(assemblyInstructions.steps.size()) - 1) {
          uiState.currentAssemblyStep++;
        }
      }
    }

    // STL Export handling - keyboard [P] or toolbar button
    static bool prevPDown = false;
    bool exportRequested = uiState.stlExportClicked;
    uiState.stlExportClicked = false;  // Clear the flag

    if (!uiState.materialFilterActive && !exportRequested) {
      for (int key = GetKeyPressed(); key != 0; key = GetKeyPressed()) {
        if (key == KEY_P) exportRequested = true;
      }
      for (int ch = GetCharPressed(); ch != 0; ch = GetCharPressed()) {
        if (ch == 'p' || ch == 'P') exportRequested = true;
      }
      const bool pDown = IsKeyDown(KEY_P);
      if (pDown && !prevPDown) exportRequested = true;
      prevPDown = pDown;
      if (!exportRequested && IsKeyPressed(KEY_P)) exportRequested = true;
    }

    if (exportRequested && !sceneData.objects.empty()) {
      std::vector<manifold::Manifold> allGeometry;
      allGeometry.reserve(sceneData.objects.size());
      for (const auto &obj : sceneData.objects) {
        if (obj.geometry) allGeometry.push_back(*obj.geometry);
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
          if (WriteMeshAsBinaryStl(combined.GetMeshGL(), savePath, error)) {
            reportStatus("Saved " + savePath.string());
          } else {
            reportStatus(error);
          }
        }
      }
    }

    // IFC Export handling - keyboard [I] or toolbar button
    static bool prevIDown = false;
    bool ifcExportRequested = uiState.ifcExportClicked;
    uiState.ifcExportClicked = false;  // Clear the flag

    if (!uiState.materialFilterActive && !ifcExportRequested) {
      const bool iDown = IsKeyDown(KEY_I);
      if (iDown && !prevIDown) ifcExportRequested = true;
      prevIDown = iDown;
      if (!ifcExportRequested && IsKeyPressed(KEY_I)) ifcExportRequested = true;
    }

    if (ifcExportRequested && !sceneData.objects.empty()) {
      std::filesystem::path downloads;
      if (const char *home = std::getenv("HOME")) {
        downloads = std::filesystem::path(home) / "Downloads";
      } else {
        downloads = std::filesystem::current_path();
      }

      std::error_code dirErr;
      std::filesystem::create_directories(downloads, dirErr);
      if (dirErr && !std::filesystem::exists(downloads)) {
        reportStatus("IFC export failed: cannot access " + downloads.string());
      } else {
        std::filesystem::path ifcPath = downloads / "helscoop.ifc";
        std::string error;
        if (ExportToIFC(sceneData, sceneMaterials, g_materialLibrary, ifcPath, error)) {
          reportStatus("Saved ~/Downloads/helscoop.ifc");
        } else {
          reportStatus("IFC export failed: " + error);
        }
      }
    }

    // SVG Blueprint Export handling - toolbar button
    if (uiState.svgExportClicked) {
      uiState.svgExportClicked = false;
      if (!sceneData.objects.empty()) {
        std::filesystem::path downloads;
        if (const char *home = std::getenv("HOME")) {
          downloads = std::filesystem::path(home) / "Downloads";
        } else {
          downloads = std::filesystem::current_path();
        }

        std::error_code dirErr;
        std::filesystem::create_directories(downloads, dirErr);
        if (dirErr && !std::filesystem::exists(downloads)) {
          reportStatus("SVG export failed: cannot access Downloads");
        } else {
          std::filesystem::path svgPath = downloads / "helscoop_blueprint.svg";
          BlueprintOptions options;
          std::string error;
          if (ExportToSVG(sceneData, sceneMaterials, g_materialLibrary, svgPath, options, error)) {
            reportStatus("Saved ~/Downloads/helscoop_blueprint.svg");
          } else {
            reportStatus("SVG export failed: " + error);
          }
        }
      }
    }

    // BOM/Parts List Export handling - toolbar button
    if (uiState.bomExportClicked) {
      uiState.bomExportClicked = false;
      if (!sceneMaterials.empty()) {
        std::filesystem::path downloads;
        if (const char *home = std::getenv("HOME")) {
          downloads = std::filesystem::path(home) / "Downloads";
        } else {
          downloads = std::filesystem::current_path();
        }

        std::error_code dirErr;
        std::filesystem::create_directories(downloads, dirErr);
        if (dirErr && !std::filesystem::exists(downloads)) {
          reportStatus("BOM export failed: cannot access Downloads");
        } else {
          std::filesystem::path csvPath = downloads / "helscoop_parts.csv";
          std::string error;
          if (ExportPartsList(sceneMaterials, g_materialLibrary, csvPath, error)) {
            reportStatus("Saved ~/Downloads/helscoop_parts.csv");
          } else {
            reportStatus("BOM export failed: " + error);
          }
        }
      }
    }

    // IKEA-style Assembly Instructions Export handling - toolbar button
    if (uiState.instructionsExportClicked) {
      uiState.instructionsExportClicked = false;
      if (!sceneData.objects.empty()) {
        // Regenerate assembly if needed
        if (assemblyInstructions.steps.empty()) {
          assemblyInstructions = GenerateDefaultAssembly(sceneData, sceneMaterials);
        }

        std::filesystem::path downloads;
        if (const char *home = std::getenv("HOME")) {
          downloads = std::filesystem::path(home) / "Downloads";
        } else {
          downloads = std::filesystem::current_path();
        }

        std::filesystem::path instructionsDir = downloads / "helscoop_instructions";
        std::string error;
        if (ExportAssemblyInstructions(sceneData, sceneMaterials, g_materialLibrary,
                                       assemblyInstructions, instructionsDir, error)) {
          reportStatus("Saved ~/Downloads/helscoop_instructions/");
        } else {
          reportStatus("Instructions export failed: " + error);
        }
      }
    }

    // Mouse over panel check
    const int screenWidth = std::max(GetScreenWidth(), 1);
    const int screenHeight = std::max(GetScreenHeight(), 1);
    bool mouseOverPanel = IsMouseOverPanels(sceneMaterials, sceneParameters,
                                            uiState.showMaterialsPanel, uiState.showParametersPanel,
                                            screenWidth, screenHeight);

    // Object picking with middle-click or Shift+Left-click
    // This allows reverse selection: click on 3D object to highlight its material
    if (!mouseOverPanel &&
        (IsMouseButtonPressed(MOUSE_BUTTON_MIDDLE) ||
         (IsKeyDown(KEY_LEFT_SHIFT) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)))) {
      Vector2 mousePos = GetMousePosition();
      Ray pickRay = GetMouseRay(mousePos, camera);
      PickResult pickResult = PickModelAtRay(pickRay, models);

      if (pickResult.hit && !pickResult.materialId.empty()) {
        uiState.selectedMaterialId = pickResult.materialId;

        // Calculate scroll offset to show the selected material in the panel
        // Find the material index and scroll to it
        float scrollTarget = 0.0f;
        float yPos = 5.0f;  // Initial padding
        const float rowHeight = 24.0f;
        const float sectionHeight = 26.0f;
        std::string prevCategory;
        for (size_t i = 0; i < sceneMaterials.size(); ++i) {
          const auto& mat = sceneMaterials[i];
          if (mat.category != prevCategory) {
            prevCategory = mat.category;
            yPos += 5.0f + sectionHeight;
          }
          if (mat.materialId == pickResult.materialId) {
            // Scroll to center this item (adjust by half the visible height)
            scrollTarget = std::max(0.0f, yPos - 100.0f);
            break;
          }
          yPos += rowHeight;
        }
        uiState.materialScrollOffset = scrollTarget;

        // Ensure materials panel is visible
        uiState.showMaterialsPanel = true;

        TraceLog(LOG_INFO, "Picked object with material: %s", pickResult.materialId.c_str());
      } else if (pickResult.hit) {
        // Clicked on object without materialId - clear selection
        uiState.selectedMaterialId.clear();
      }
    }

    // Camera controls (skip if shift is held - that's for object picking, or if dragging a panel)
    bool isDraggingPanel = uiState.draggingPanel >= 0;
    if (!mouseOverPanel && !isDraggingPanel && !IsKeyDown(KEY_LEFT_SHIFT) && IsMouseButtonDown(MOUSE_BUTTON_LEFT)) {
      orbitYaw -= mouseDelta.x * 0.01f;
      orbitPitch += mouseDelta.y * 0.01f;
      const float limit = DEG2RAD * 89.0f;
      orbitPitch = Clamp(orbitPitch, -limit, limit);
    }

    const float wheel = GetMouseWheelMove();
    if (!mouseOverPanel && !isDraggingPanel && wheel != 0.0f) {
      orbitDistance *= (1.0f - wheel * 0.1f);
      orbitDistance = Clamp(orbitDistance, 1.0f, 50.0f);
    }

    const Vector3 forward = Vector3Normalize(Vector3Subtract(camera.target, camera.position));
    const Vector3 worldUp = {0.0f, 1.0f, 0.0f};
    const Vector3 right = Vector3Normalize(Vector3CrossProduct(worldUp, forward));
    const Vector3 camUp = Vector3CrossProduct(forward, right);

    if (!mouseOverPanel && !isDraggingPanel && IsMouseButtonDown(MOUSE_BUTTON_RIGHT)) {
      camera.target = Vector3Add(camera.target, Vector3Scale(right, mouseDelta.x * 0.01f * orbitDistance));
      camera.target = Vector3Add(camera.target, Vector3Scale(camUp, -mouseDelta.y * 0.01f * orbitDistance));
    }

    // Skip camera movement keys when search filter is active
    if (!uiState.materialFilterActive) {
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
    }

    const Vector3 offsets = {
        orbitDistance * cosf(orbitPitch) * sinf(orbitYaw),
        orbitDistance * sinf(orbitPitch),
        orbitDistance * cosf(orbitPitch) * cosf(orbitYaw)};
    camera.position = Vector3Add(camera.target, offsets);
    camera.up = worldUp;

    // Handle window resize
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

    // Update shader uniforms
    Matrix view = GetCameraMatrix(camera);
    Vector3 lightDirVS = {
        view.m0 * lightDirWS.x + view.m4 * lightDirWS.y + view.m8 * lightDirWS.z,
        view.m1 * lightDirWS.x + view.m5 * lightDirWS.y + view.m9 * lightDirWS.z,
        view.m2 * lightDirWS.x + view.m6 * lightDirWS.y + view.m10 * lightDirWS.z};
    lightDirVS = Vector3Normalize(lightDirVS);
    SetShaderValue(toonShader, locLightDirVS, &lightDirVS.x, SHADER_UNIFORM_VEC3);

    // Update PBR shader light directions (world space)
    SetShaderValue(pbrShader, locPbrLightDir, &lightDirWS.x, SHADER_UNIFORM_VEC3);
    SetShaderValue(pbrShader, locPbrLightDir2, &lightDir2WS.x, SHADER_UNIFORM_VEC3);
    SetShaderValue(pbrShader, locPbrLightColor2, pbrLightColor2, SHADER_UNIFORM_VEC3);

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

    // Recalculate thermal analysis if needed
    if (uiState.thermalViewEnabled && thermalResultDirty) {
      thermalResult = CalculateThermalLoss(models, sceneMaterials, g_materialLibrary, uiState.thermalSettings);
      CalculateAnnualThermal(thermalResult, uiState.thermalSettings);  // Add annual heating calc
      thermalResultDirty = false;
      TraceLog(LOG_INFO, "Thermal analysis: %.1f W total heat loss, %.0f kWh/year, %zu surfaces",
               thermalResult.totalHeatLoss_W, thermalResult.annualHeatLoss_kWh, thermalResult.surfaces.size());
    }

    // Recalculate structural analysis if needed
    if (uiState.showStructuralPanel && structuralResultDirty) {
      structuralResult = AnalyzeStructure(models, sceneData, g_materialLibrary, kSceneScale);
      structuralResultDirty = false;
      TraceLog(LOG_INFO, "Structural analysis: %d warnings, %s",
               structuralResult.warningCount,
               structuralResult.allPassed ? "all OK" : "issues found");
    }

    // Regenerate assembly instructions if needed
    if (assemblyDirty && !sceneData.objects.empty()) {
      assemblyInstructions = GenerateDefaultAssembly(sceneData, sceneMaterials);
      assemblyDirty = false;
      uiState.currentAssemblyStep = 0;  // Reset to first step
      TraceLog(LOG_INFO, "Generated %zu assembly steps", assemblyInstructions.steps.size());
    }

    // Build thermal color lookup map for rendering
    std::unordered_map<std::string, Color> thermalColorByMaterial;
    if (uiState.thermalViewEnabled) {
      for (const auto& surface : thermalResult.surfaces) {
        thermalColorByMaterial[surface.materialId] = HeatFluxToColor(
            surface.heatFluxDensity, thermalResult.minHeatFlux, thermalResult.maxHeatFlux);
      }
    }

    // ========================================================================
    // SHADOW MAP PASS - Render depth from light's perspective
    // ========================================================================
    Matrix lightSpaceMatrix = MatrixIdentity();
    if (shadowsEnabled && pbrModeEnabled) {
      // Calculate light space matrix for shadow mapping
      Vector3 lightDir = lightDirWS;
      Vector3 sceneCenter = {0.0f, 1.5f, 0.0f};  // Approximate scene center
      float sceneRadius = 12.0f;  // Approximate scene radius

      // Light view matrix - looking at scene from light direction
      Vector3 lightPos = Vector3Add(sceneCenter, Vector3Scale(lightDir, sceneRadius * 2.0f));
      Matrix lightView = MatrixLookAt(lightPos, sceneCenter, {0.0f, 1.0f, 0.0f});

      // Orthographic projection for directional light
      float orthoSize = sceneRadius * 1.5f;
      Matrix lightProj = MatrixOrtho(-orthoSize, orthoSize, -orthoSize, orthoSize, 0.1f, sceneRadius * 4.0f);

      lightSpaceMatrix = MatrixMultiply(lightView, lightProj);

      // Render shadow map (depth encoded in color texture)
      BeginTextureMode(shadowMap);
      ClearBackground(WHITE);  // White = max depth (far away)

      // Set up orthographic camera from light's perspective
      Camera3D lightCam = {0};
      lightCam.position = lightPos;
      lightCam.target = sceneCenter;
      lightCam.up = {0.0f, 1.0f, 0.0f};
      lightCam.fovy = orthoSize * 2.0f;  // Full width for ortho
      lightCam.projection = CAMERA_ORTHOGRAPHIC;

      BeginMode3D(lightCam);

      // Get the actual view-projection matrix that Raylib is using
      Matrix lightViewMat = rlGetMatrixModelview();
      Matrix lightProjMat = rlGetMatrixProjection();
      lightSpaceMatrix = MatrixMultiply(lightViewMat, lightProjMat);

      for (const auto &modelWithColor : models) {
        for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
          DrawMesh(modelWithColor.model.meshes[i], shadowDepthMat, modelWithColor.model.transform);
        }
      }

      EndMode3D();
      EndTextureMode();

      // Update PBR shadow shader with light space matrix
      SetShaderValueMatrix(pbrShadowShader, locPbrShadowLightSpaceMatrix, lightSpaceMatrix);
      SetShaderValue(pbrShadowShader, locPbrShadowLightDir, &lightDirWS.x, SHADER_UNIFORM_VEC3);

      // Bind shadow map to texture unit 1
      rlActiveTextureSlot(1);
      rlEnableTexture(shadowMap.texture.id);
    }

    // ========================================================================
    // MAIN COLOR PASS
    // ========================================================================

    // Render to color texture
    BeginTextureMode(rtColor);
    ClearBackground(RAYWHITE);

    // Render sky gradient background (only in PBR mode)
    if (pbrModeEnabled) {
      // Draw gradient sky using simple 2D rects
      // Sky top to horizon
      Color skyTopC = {static_cast<unsigned char>(skyTopCol[0] * 255),
                       static_cast<unsigned char>(skyTopCol[1] * 255),
                       static_cast<unsigned char>(skyTopCol[2] * 255), 255};
      Color skyHorizC = {static_cast<unsigned char>(skyHorizonCol[0] * 255),
                         static_cast<unsigned char>(skyHorizonCol[1] * 255),
                         static_cast<unsigned char>(skyHorizonCol[2] * 255), 255};
      Color skyGroundC = {static_cast<unsigned char>(skyGroundCol[0] * 255),
                          static_cast<unsigned char>(skyGroundCol[1] * 255),
                          static_cast<unsigned char>(skyGroundCol[2] * 255), 255};
      int h = GetScreenHeight();
      int w = GetScreenWidth();
      // Upper half: sky gradient
      DrawRectangleGradientV(0, 0, w, h/2, skyTopC, skyHorizC);
      // Lower half: ground gradient
      DrawRectangleGradientV(0, h/2, w, h/2, skyHorizC, skyGroundC);
    }

    BeginMode3D(camera);
    if (pbrModeEnabled) {
      // Draw a simple ground plane using the PBR shader
      // Calculate scene bounds to position and center ground correctly
      float minY = 0.0f, centerX = 0.0f, centerZ = 0.0f;
      float minX = FLT_MAX, maxX = -FLT_MAX, minZ = FLT_MAX, maxZ = -FLT_MAX;
      for (const auto& m : models) {
        BoundingBox bbox = GetModelBoundingBox(m.model);
        Vector3 corners[8] = {
          {bbox.min.x, bbox.min.y, bbox.min.z}, {bbox.max.x, bbox.min.y, bbox.min.z},
          {bbox.min.x, bbox.min.y, bbox.max.z}, {bbox.max.x, bbox.min.y, bbox.max.z},
          {bbox.min.x, bbox.max.y, bbox.min.z}, {bbox.max.x, bbox.max.y, bbox.min.z},
          {bbox.min.x, bbox.max.y, bbox.max.z}, {bbox.max.x, bbox.max.y, bbox.max.z},
        };
        for (int i = 0; i < 8; i++) {
          Vector3 p = Vector3Transform(corners[i], m.model.transform);
          if (p.y < minY) minY = p.y;
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.z < minZ) minZ = p.z;
          if (p.z > maxZ) maxZ = p.z;
        }
      }
      centerX = (minX + maxX) * 0.5f;
      centerZ = (minZ + maxZ) * 0.5f;

      // Set ground material properties (earthy brown-grey, rough, non-metallic)
      float groundAlbedo[4] = {0.32f, 0.30f, 0.25f, 1.0f};  // Earthy brown
      float groundRoughness = 0.95f;
      float groundMetallic = 0.0f;
      float groundAo = 1.0f;
      int noTex = 0;
      SetShaderValue(pbrShader, locPbrAlbedoColor, groundAlbedo, SHADER_UNIFORM_VEC4);
      SetShaderValue(pbrShader, locPbrRoughness, &groundRoughness, SHADER_UNIFORM_FLOAT);
      SetShaderValue(pbrShader, locPbrMetallic, &groundMetallic, SHADER_UNIFORM_FLOAT);
      SetShaderValue(pbrShader, locPbrAo, &groundAo, SHADER_UNIFORM_FLOAT);
      SetShaderValue(pbrShader, locPbrUseAlbedoTex, &noTex, SHADER_UNIFORM_INT);

      // Draw ground plane centered on scene, slightly below
      rlPushMatrix();
      rlTranslatef(centerX, minY - 0.002f, centerZ);
      DrawMesh(groundPlaneMesh, pbrMat, MatrixIdentity());
      rlPopMatrix();
    } else {
      DrawXZGrid(40, 0.5f, Fade(LIGHTGRAY, 0.4f));
      DrawAxes(2.0f);  // Only draw axes in toon mode
    }

    // Determine which material ID to highlight (hover takes precedence)
    const std::string& highlightMatId = !uiState.hoveredMaterialId.empty()
        ? uiState.hoveredMaterialId
        : uiState.selectedMaterialId;

    // Build assembly visibility set if in assembly mode
    std::set<size_t> assemblyVisibleSet;
    std::set<size_t> assemblyNewSet;
    if (uiState.showAssemblyPanel && !assemblyInstructions.steps.empty()) {
      int stepIdx = std::clamp(uiState.currentAssemblyStep, 0,
                               static_cast<int>(assemblyInstructions.steps.size()) - 1);
      const auto& step = assemblyInstructions.steps[stepIdx];
      assemblyVisibleSet.insert(step.objectIndices.begin(), step.objectIndices.end());
      assemblyNewSet.insert(step.newObjectIndices.begin(), step.newObjectIndices.end());
    }

    // Outline pass - use bright highlight for hovered/selected material
    // Skip outlines in PBR mode for cleaner look (outlines are toon-style)
    if (!pbrModeEnabled) {
    rlDisableBackfaceCulling();
    for (size_t modelIdx = 0; modelIdx < models.size(); ++modelIdx) {
      const auto &modelWithColor = models[modelIdx];

      // Skip assemblyOnly objects when NOT in assembly mode
      if (!uiState.showAssemblyPanel && modelIdx < sceneData.objects.size() &&
          sceneData.objects[modelIdx].assemblyOnly) {
        continue;
      }

      // Skip objects not visible in current assembly step
      if (uiState.showAssemblyPanel && !assemblyVisibleSet.empty()) {
        if (assemblyVisibleSet.find(modelIdx) == assemblyVisibleSet.end()) {
          continue;
        }
      }

      // Check if this object should be highlighted
      bool shouldHighlight = !highlightMatId.empty() &&
                             modelWithColor.materialId == highlightMatId;

      // In assembly mode, highlight new parts
      bool isNewPart = uiState.showAssemblyPanel && assemblyNewSet.find(modelIdx) != assemblyNewSet.end();

      if (shouldHighlight) {
        // Bright orange outline for highlighted objects
        setOutlineUniforms(outlineThickness * 2.5f, ORANGE);
      } else if (isNewPart) {
        // Green outline for new assembly parts
        setOutlineUniforms(outlineThickness * 2.0f, GREEN);
      } else {
        // Normal black outline
        setOutlineUniforms(outlineThickness, outlineColor);
      }

      for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
        DrawMesh(modelWithColor.model.meshes[i], outlineMat, modelWithColor.model.transform);
      }
    }
    rlEnableBackfaceCulling();

    // Reset outline uniforms for consistency
    setOutlineUniforms(outlineThickness, outlineColor);
    } // end of !pbrModeEnabled outline pass

    // Enable polygon offset to fix z-fighting on coplanar surfaces (door panels, cladding)
#ifdef __APPLE__
    if (pbrModeEnabled) {
      glEnable(GL_POLYGON_OFFSET_FILL);
      glPolygonOffset(1.0f, 1.0f);
    }
#endif

    // Toon shading pass
    for (size_t modelIdx = 0; modelIdx < models.size(); ++modelIdx) {
      const auto &modelWithColor = models[modelIdx];

      // Skip assemblyOnly objects when NOT in assembly mode
      if (!uiState.showAssemblyPanel && modelIdx < sceneData.objects.size() &&
          sceneData.objects[modelIdx].assemblyOnly) {
        continue;
      }

      // Skip objects not visible in current assembly step
      if (uiState.showAssemblyPanel && !assemblyVisibleSet.empty()) {
        if (assemblyVisibleSet.find(modelIdx) == assemblyVisibleSet.end()) {
          continue;
        }
      }

      // In thermal view, hide exterior layers that cover insulation
      // This makes the thermal visualization visible
      if (uiState.thermalViewEnabled && !modelWithColor.materialId.empty()) {
        const PBRMaterial* mat = g_materialLibrary.get(modelWithColor.materialId);
        if (mat) {
          const std::string& cat = mat->category;
          // Hide sheathing, roofing, and finish - they cover the insulation
          if (cat == "sheathing" || cat == "roofing" || cat == "finish") {
            continue;  // Skip this object in thermal view
          }
        }
      }

      // Check if this is a new part in assembly mode (for color modification)
      bool isNewPart = uiState.showAssemblyPanel && assemblyNewSet.find(modelIdx) != assemblyNewSet.end();

      // Use thermal color if thermal view is enabled and material has thermal data
      Color renderColor = modelWithColor.color;
      if (uiState.thermalViewEnabled && !modelWithColor.materialId.empty()) {
        auto it = thermalColorByMaterial.find(modelWithColor.materialId);
        if (it != thermalColorByMaterial.end()) {
          renderColor = it->second;
        }
      }

      // In assembly mode: new parts are bright, old parts are faded
      float alpha = 1.0f;
      if (uiState.showAssemblyPanel && !assemblyVisibleSet.empty()) {
        if (isNewPart) {
          // Brighten new parts slightly
          renderColor.r = std::min(255, renderColor.r + 30);
          renderColor.g = std::min(255, renderColor.g + 30);
          renderColor.b = std::min(255, renderColor.b + 30);
        } else {
          // Fade old parts
          alpha = 0.4f;
        }
      }

      const float modelColor[4] = {
        renderColor.r / 255.0f,
        renderColor.g / 255.0f,
        renderColor.b / 255.0f,
        alpha
      };

      // Get material texture or use fallback
      Texture2D* materialTex = nullptr;
      if (!modelWithColor.materialId.empty()) {
        materialTex = g_materialLibrary.getTexture(modelWithColor.materialId);
      }
      int useTex = (materialTex && materialTex->id != 0) ? 1 : 0;

      if (pbrModeEnabled) {
        // Get material PBR properties (roughness, metallic)
        float matRoughness = 0.5f;
        float matMetallic = 0.0f;
        float matAo = 1.0f;

        if (!modelWithColor.materialId.empty()) {
          const PBRMaterial* mat = g_materialLibrary.get(modelWithColor.materialId);
          if (mat) {
            matRoughness = mat->visual.roughness;
            matMetallic = mat->visual.metallic;
          }
        }

        if (shadowsEnabled) {
          // PBR with shadows rendering path
          SetShaderValue(pbrShadowShader, locPbrShadowAlbedoColor, modelColor, SHADER_UNIFORM_VEC4);
          SetShaderValue(pbrShadowShader, locPbrShadowUseAlbedoTex, &useTex, SHADER_UNIFORM_INT);
          SetShaderValue(pbrShadowShader, locPbrShadowRoughness, &matRoughness, SHADER_UNIFORM_FLOAT);
          SetShaderValue(pbrShadowShader, locPbrShadowMetallic, &matMetallic, SHADER_UNIFORM_FLOAT);
          SetShaderValue(pbrShadowShader, locPbrShadowAo, &matAo, SHADER_UNIFORM_FLOAT);

          pbrShadowMat.maps[MATERIAL_MAP_DIFFUSE].texture =
            (materialTex && materialTex->id != 0) ? *materialTex : fallbackTexture;

          for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
            DrawMesh(modelWithColor.model.meshes[i], pbrShadowMat, modelWithColor.model.transform);
          }
        } else {
          // PBR without shadows (fallback)
          SetShaderValue(pbrShader, locPbrAlbedoColor, modelColor, SHADER_UNIFORM_VEC4);
          SetShaderValue(pbrShader, locPbrUseAlbedoTex, &useTex, SHADER_UNIFORM_INT);
          SetShaderValue(pbrShader, locPbrRoughness, &matRoughness, SHADER_UNIFORM_FLOAT);
          SetShaderValue(pbrShader, locPbrMetallic, &matMetallic, SHADER_UNIFORM_FLOAT);
          SetShaderValue(pbrShader, locPbrAo, &matAo, SHADER_UNIFORM_FLOAT);

          pbrMat.maps[MATERIAL_MAP_DIFFUSE].texture =
            (materialTex && materialTex->id != 0) ? *materialTex : fallbackTexture;

          for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
            DrawMesh(modelWithColor.model.meshes[i], pbrMat, modelWithColor.model.transform);
          }
        }
      } else {
        // Toon rendering path (original)
        SetShaderValue(toonShader, locBaseColor, modelColor, SHADER_UNIFORM_VEC4);
        SetShaderValue(toonShader, locUseTexture, &useTex, SHADER_UNIFORM_INT);

        toonMat.maps[MATERIAL_MAP_DIFFUSE].texture =
          (materialTex && materialTex->id != 0) ? *materialTex : fallbackTexture;

        for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
          DrawMesh(modelWithColor.model.meshes[i], toonMat, modelWithColor.model.transform);
        }
      }
    }

    // Disable polygon offset after rendering
#ifdef __APPLE__
    if (pbrModeEnabled) {
      glDisable(GL_POLYGON_OFFSET_FILL);
    }
#endif

    EndMode3D();
    EndTextureMode();

    // Render normal/depth buffer
    BeginTextureMode(rtNormalDepth);
    ClearBackground({127, 127, 255, 0});
    BeginMode3D(camera);
    for (const auto &modelWithColor : models) {
      // Skip exterior layers in thermal view (same filter as toon shading pass)
      if (uiState.thermalViewEnabled && !modelWithColor.materialId.empty()) {
        const PBRMaterial* mat = g_materialLibrary.get(modelWithColor.materialId);
        if (mat) {
          const std::string& cat = mat->category;
          if (cat == "sheathing" || cat == "roofing" || cat == "finish") {
            continue;
          }
        }
      }
      for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
        DrawMesh(modelWithColor.model.meshes[i], normalDepthMat, modelWithColor.model.transform);
      }
    }
    EndMode3D();
    EndTextureMode();

    // Rebind normal/depth texture in case texture slots were modified by per-object bindings
    SetShaderValueTexture(edgeShader, locNormDepthTexture, rtNormalDepth.texture);

    // Final composite
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

    // Draw toolbar at top (includes panel toggles and status)
    DrawToolbar(uiState, uiFont, screenWidth, statusMessage);

    // Draw branding in toolbar area
    const float margin = 15.0f;
    const Vector2 brandPos = {margin, 4.0f};  // Adjusted for toolbar
    DrawTextEx(brandingFont, kBrandText, brandPos, kBrandFontSize, 0.0f, WHITE);

    // Draw UI panels (positioned below toolbar)
    if (uiState.showMaterialsPanel) {
      // When assembly panel is active, filter materials to show only materials visible in current step
      std::vector<std::string> assemblyMaterialFilter;
      if (uiState.showAssemblyPanel && !assemblyInstructions.steps.empty()) {
        int stepIdx = std::clamp(uiState.currentAssemblyStep, 0,
                                 static_cast<int>(assemblyInstructions.steps.size()) - 1);
        const auto& currentStep = assemblyInstructions.steps[stepIdx];

        // Collect materials from visible objects in this step
        std::set<std::string> visibleMaterials;

        // If step uses showObjects, get materials from those object indices
        if (!currentStep.objectIndices.empty()) {
          for (size_t objIdx : currentStep.objectIndices) {
            if (objIdx < sceneData.objects.size()) {
              const auto& obj = sceneData.objects[objIdx];
              if (!obj.materialId.empty()) {
                visibleMaterials.insert(obj.materialId);
              }
            }
          }
        }

        // Also include explicitly listed showMaterials (for steps that use material-based filtering)
        for (const auto& mat : currentStep.showMaterials) {
          visibleMaterials.insert(mat);
        }

        // Convert set to vector for the filter
        for (const auto& mat : visibleMaterials) {
          assemblyMaterialFilter.push_back(mat);
        }
      }
      DrawMaterialsPanel(sceneMaterials, uiState, uiFont, screenWidth, screenHeight, assemblyMaterialFilter);
    }

    if (uiState.showParametersPanel) {
      bool paramWritten = DrawParametersPanel(sceneParameters, uiState, uiFont,
                                              screenWidth, screenHeight,
                                              loadingInBackground, scriptPath);
      (void)paramWritten;  // File watcher handles reload
    }

    // Thermal view UI
    if (uiState.thermalViewEnabled) {
      if (uiState.showThermalPanel) {
        if (DrawThermalPanel(thermalResult, uiState, uiFont, screenWidth, screenHeight)) {
          // Thermal settings changed - trigger recalculation
          thermalResultDirty = true;
        }
      }
      DrawThermalLegend(thermalResult.minHeatFlux, thermalResult.maxHeatFlux,
                        uiFont, screenWidth, screenHeight);
    }

    // Draw structural panel
    if (uiState.showStructuralPanel) {
      DrawStructuralPanel(structuralResult, uiState, uiFont, screenWidth, screenHeight);
    }

    // Draw assembly preview panel
    if (uiState.showAssemblyPanel) {
      DrawAssemblyPanel(assemblyInstructions, uiState, uiFont, screenWidth, screenHeight);
    }

    EndDrawing();

    // Screenshot for render mode
    if (renderMode && !screenshotTaken && frameCount >= 3) {
      TakeScreenshot(renderOutputPath.c_str());
      TraceLog(LOG_INFO, "Rendered to: %s", renderOutputPath.c_str());
      std::cout << "Rendered to: " << renderOutputPath << std::endl;
      screenshotTaken = true;
      break;
    }
  }

  // Cleanup
  UnloadMaterialTextures();
  UnloadRenderTexture(rtColor);
  UnloadRenderTexture(rtNormalDepth);
  if (shadowsEnabled) {
    UnloadRenderTexture(shadowMap);
    UnloadMaterial(pbrShadowMat);
    UnloadMaterial(shadowDepthMat);
    UnloadShader(pbrShadowShader);
    UnloadShader(shadowDepthShader);
  }
  UnloadMaterial(toonMat);
  UnloadMaterial(normalDepthMat);
  UnloadMaterial(outlineMat);
  UnloadMaterial(groundPlaneMat);
  UnloadShader(groundPlaneShader);
  UnloadMesh(groundPlaneMesh);
  UnloadShader(edgeShader);
  DestroyModels(models);
  if (brandingFontCustom) UnloadFont(brandingFont);
  if (uiFontCustom) UnloadFont(uiFont);
  JS_FreeRuntime(runtime);
  CloseWindow();

  return 0;
}
