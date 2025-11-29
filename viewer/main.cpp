#include "raylib.h"
#include "raymath.h"
#include "rlgl.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <future>
#include <iostream>
#include <mutex>
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

  // UI State
  UIState uiState;
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

  // Load shaders
  Shader outlineShader = LoadShaderFromMemory(shaders::kOutlineVS, shaders::kOutlineFS);
  Shader toonShader = LoadShaderFromMemory(shaders::kToonVS, shaders::kToonFS);
  Shader normalDepthShader = LoadShaderFromMemory(shaders::kNormalDepthVS, shaders::kNormalDepthFS);
  Shader edgeShader = LoadShaderFromMemory(shaders::kEdgeQuadVS, shaders::kEdgeFS);

  if (outlineShader.id == 0 || toonShader.id == 0 || normalDepthShader.id == 0 || edgeShader.id == 0) {
    TraceLog(LOG_ERROR, "Failed to load one or more shaders.");
    DestroyModels(models);
    if (brandingFontCustom) UnloadFont(brandingFont);
    if (uiFontCustom) UnloadFont(uiFont);
    JS_FreeRuntime(runtime);
    CloseWindow();
    return 1;
  }

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

  // Static toon lighting configuration
  const Vector3 lightDirWS = Vector3Normalize({0.45f, 0.85f, 0.35f});
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

    // Export handling
    static bool prevPDown = false;
    bool exportRequested = false;

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

    // Mouse over panel check
    const int screenWidth = std::max(GetScreenWidth(), 1);
    const int screenHeight = std::max(GetScreenHeight(), 1);
    bool mouseOverPanel = IsMouseOverPanels(sceneMaterials, sceneParameters,
                                            uiState.showMaterialsPanel, uiState.showParametersPanel,
                                            screenWidth, screenHeight);

    // Camera controls
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
      camera.target = Vector3Add(camera.target, Vector3Scale(right, mouseDelta.x * 0.01f * orbitDistance));
      camera.target = Vector3Add(camera.target, Vector3Scale(camUp, -mouseDelta.y * 0.01f * orbitDistance));
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

    // Render to color texture
    BeginTextureMode(rtColor);
    ClearBackground(RAYWHITE);
    BeginMode3D(camera);
    DrawXZGrid(40, 0.5f, Fade(LIGHTGRAY, 0.4f));
    DrawAxes(2.0f);

    // Determine which material ID to highlight (hover takes precedence)
    const std::string& highlightMatId = !uiState.hoveredMaterialId.empty()
        ? uiState.hoveredMaterialId
        : uiState.selectedMaterialId;

    // Outline pass - use bright highlight for hovered/selected material
    rlDisableBackfaceCulling();
    for (const auto &modelWithColor : models) {
      // Check if this object should be highlighted
      bool shouldHighlight = !highlightMatId.empty() &&
                             modelWithColor.materialId == highlightMatId;

      if (shouldHighlight) {
        // Bright cyan outline for highlighted objects
        setOutlineUniforms(outlineThickness * 2.5f, ORANGE);
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

    // Toon shading pass
    for (const auto &modelWithColor : models) {
      const float modelColor[4] = {
        modelWithColor.color.r / 255.0f,
        modelWithColor.color.g / 255.0f,
        modelWithColor.color.b / 255.0f,
        1.0f
      };
      SetShaderValue(toonShader, locBaseColor, modelColor, SHADER_UNIFORM_VEC4);

      // Get material texture or use fallback
      Texture2D* materialTex = nullptr;
      if (!modelWithColor.materialId.empty()) {
        materialTex = g_materialLibrary.getTexture(modelWithColor.materialId);
      }

      // Set texture on material and update useTexture uniform
      int useTex = (materialTex && materialTex->id != 0) ? 1 : 0;

      // Debug log on first frame only - log ALL materials
      static bool loggedOnce = false;
      if (frameCount == 0 && !loggedOnce) {
        TraceLog(LOG_INFO, "RENDER-CHECK: matId='%s' useTex=%d (first obj)",
                 modelWithColor.materialId.empty() ? "(empty)" : modelWithColor.materialId.c_str(),
                 useTex);
        loggedOnce = true;
      }

      SetShaderValue(toonShader, locUseTexture, &useTex, SHADER_UNIFORM_INT);

      // Update material's diffuse map with either material texture or fallback
      toonMat.maps[MATERIAL_MAP_DIFFUSE].texture =
        (materialTex && materialTex->id != 0) ? *materialTex : fallbackTexture;

      for (int i = 0; i < modelWithColor.model.meshCount; ++i) {
        DrawMesh(modelWithColor.model.meshes[i], toonMat, modelWithColor.model.transform);
      }
    }
    EndMode3D();
    EndTextureMode();

    // Render normal/depth buffer
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

    // Draw branding
    const float margin = 15.0f;
    const Vector2 brandPos = {margin, margin};
    DrawTextEx(brandingFont, kBrandText, brandPos, kBrandFontSize, 0.0f, DARKGRAY);

    // Draw UI panels
    if (uiState.showMaterialsPanel) {
      DrawMaterialsPanel(sceneMaterials, uiState, uiFont, screenWidth, screenHeight);
    }

    if (uiState.showParametersPanel) {
      bool paramWritten = DrawParametersPanel(sceneParameters, uiState, uiFont,
                                              screenWidth, screenHeight,
                                              loadingInBackground, scriptPath);
      (void)paramWritten;  // File watcher handles reload
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
  UnloadMaterial(toonMat);
  UnloadMaterial(normalDepthMat);
  UnloadMaterial(outlineMat);
  UnloadShader(edgeShader);
  DestroyModels(models);
  if (brandingFontCustom) UnloadFont(brandingFont);
  if (uiFontCustom) UnloadFont(uiFont);
  JS_FreeRuntime(runtime);
  CloseWindow();

  return 0;
}
