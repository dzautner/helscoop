#include "scene_loader.h"
#include "file_utils.h"
#include "js_bindings.h"
#include "material_loader.h"

#include "raymath.h"

#include <chrono>
#include <future>
#include <iostream>

namespace dingcad {

ModuleLoaderData g_moduleLoaderData;

JSModuleDef* FilesystemModuleLoader(JSContext* ctx, const char* module_name, void* opaque) {
  auto* data = static_cast<ModuleLoaderData*>(opaque);
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

  auto* module = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(funcVal));
  JS_FreeValue(ctx, funcVal);
  return module;
}

LoadResult LoadSceneFromFile(JSRuntime* runtime,
                             const std::filesystem::path& path,
                             ModuleLoaderData* loaderData) {
  auto loadStart = std::chrono::high_resolution_clock::now();

  ModuleLoaderData* data = loaderData ? loaderData : &g_moduleLoaderData;

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
    result.dependencies.assign(data->dependencies.begin(), data->dependencies.end());
    return result;
  }

  auto afterRead = std::chrono::high_resolution_clock::now();

  JSContext* ctx = JS_NewContext(runtime);
  RegisterBindings(ctx);

  auto afterBindings = std::chrono::high_resolution_clock::now();

  auto captureException = [&]() {
    JSValue exc = JS_GetException(ctx);
    JSValue stack = JS_GetPropertyStr(ctx, exc, "stack");
    const char* stackStr = JS_ToCString(ctx, JS_IsUndefined(stack) ? exc : stack);
    result.message = stackStr ? stackStr : "JavaScript error";
    JS_FreeCString(ctx, stackStr);
    JS_FreeValue(ctx, stack);
    JS_FreeValue(ctx, exc);
  };
  auto assignDependencies = [&]() {
    result.dependencies.assign(data->dependencies.begin(), data->dependencies.end());
  };

  JSValue moduleFunc = JS_Eval(ctx, sourceOpt->c_str(), sourceOpt->size(),
                               absolutePath.string().c_str(),
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

  auto* module = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(moduleFunc));
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

  auto parseColoredObject = [&](JSValue objVal) -> std::optional<ColoredObject> {
    // Case 1: Raw manifold geometry
    auto manifoldHandle = GetManifoldHandle(ctx, objVal);
    if (manifoldHandle) {
      return ColoredObject{manifoldHandle, kBaseColor, "", 1};
    }

    // Case 2: Object with geometry property
    JSValue geomVal = JS_GetPropertyStr(ctx, objVal, "geometry");
    if (JS_IsUndefined(geomVal)) {
      JS_FreeValue(ctx, geomVal);
      return std::nullopt;
    }

    auto geom = GetManifoldHandle(ctx, geomVal);
    JS_FreeValue(ctx, geomVal);
    if (!geom) {
      return std::nullopt;
    }

    Color color = kBaseColor;
    std::string materialId;
    int quantity = 1;

    // Check for material reference (string)
    JSValue materialVal = JS_GetPropertyStr(ctx, objVal, "material");
    if (!JS_IsUndefined(materialVal) && JS_IsString(materialVal)) {
      const char* matIdStr = JS_ToCString(ctx, materialVal);
      if (matIdStr) {
        materialId = matIdStr;
        TraceLog(LOG_INFO, "SCENE-LOAD: Parsed object with material='%s'", matIdStr);
        // Look up in material library for color
        const PBRMaterial* mat = g_materialLibrary.get(materialId);
        if (mat) {
          color = mat->visual.toColor();
        }
        JS_FreeCString(ctx, matIdStr);
      }
    }
    JS_FreeValue(ctx, materialVal);

    // Check for explicit color (overrides material color)
    JSValue colorVal = JS_GetPropertyStr(ctx, objVal, "color");
    if (!JS_IsUndefined(colorVal) && JS_IsArray(colorVal)) {
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
        color = {
          static_cast<unsigned char>(Clamp(colorArray[0] * 255.0, 0.0, 255.0)),
          static_cast<unsigned char>(Clamp(colorArray[1] * 255.0, 0.0, 255.0)),
          static_cast<unsigned char>(Clamp(colorArray[2] * 255.0, 0.0, 255.0)),
          255
        };
      }
    }
    JS_FreeValue(ctx, colorVal);

    // Check for quantity
    JSValue quantityVal = JS_GetPropertyStr(ctx, objVal, "quantity");
    if (!JS_IsUndefined(quantityVal)) {
      int32_t q = 1;
      JS_ToInt32(ctx, &q, quantityVal);
      quantity = q;
    }
    JS_FreeValue(ctx, quantityVal);

    return ColoredObject{geom, color, materialId, quantity};
  };

  if (JS_IsArray(sceneVal)) {
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

  // Parse materials array from JS
  if (!JS_IsUndefined(materialsVal) && !JS_IsException(materialsVal) && JS_IsArray(materialsVal)) {
    JSValue matLengthVal = JS_GetPropertyStr(ctx, materialsVal, "length");
    uint32_t matLength = 0;
    if (JS_ToUint32(ctx, &matLength, matLengthVal) >= 0) {
      for (uint32_t i = 0; i < matLength; ++i) {
        JSValue itemVal = JS_GetPropertyUint32(ctx, materialsVal, i);
        MaterialItem item;

        JSValue nameVal = JS_GetPropertyStr(ctx, itemVal, "name");
        if (!JS_IsUndefined(nameVal)) {
          const char* str = JS_ToCString(ctx, nameVal);
          if (str) { item.name = str; JS_FreeCString(ctx, str); }
        }
        JS_FreeValue(ctx, nameVal);

        JSValue catVal = JS_GetPropertyStr(ctx, itemVal, "category");
        if (!JS_IsUndefined(catVal)) {
          const char* str = JS_ToCString(ctx, catVal);
          if (str) { item.category = str; JS_FreeCString(ctx, str); }
        }
        JS_FreeValue(ctx, catVal);

        JSValue linkVal = JS_GetPropertyStr(ctx, itemVal, "link");
        if (!JS_IsUndefined(linkVal)) {
          const char* str = JS_ToCString(ctx, linkVal);
          if (str) { item.link = str; JS_FreeCString(ctx, str); }
        }
        JS_FreeValue(ctx, linkVal);

        JSValue unitVal = JS_GetPropertyStr(ctx, itemVal, "unit");
        if (!JS_IsUndefined(unitVal)) {
          const char* str = JS_ToCString(ctx, unitVal);
          if (str) { item.unit = str; JS_FreeCString(ctx, str); }
        }
        JS_FreeValue(ctx, unitVal);

        JSValue priceVal = JS_GetPropertyStr(ctx, itemVal, "unitPrice");
        if (!JS_IsUndefined(priceVal)) {
          double val = 0;
          if (JS_ToFloat64(ctx, &val, priceVal) >= 0) {
            item.unitPrice = static_cast<float>(val);
          }
        }
        JS_FreeValue(ctx, priceVal);

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

BackgroundLoadResult LoadAndTessellate(const std::filesystem::path& path) {
  auto start = std::chrono::high_resolution_clock::now();
  BackgroundLoadResult result;

  JSRuntime* runtime = JS_NewRuntime();
  if (!runtime) {
    result.message = "Failed to create JS runtime for background load";
    return result;
  }

  EnsureManifoldClass(runtime);

  ModuleLoaderData localLoaderData;
  JS_SetModuleLoaderFunc(runtime, nullptr, FilesystemModuleLoader, &localLoaderData);

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

  struct TessTask {
    std::future<manifold::MeshGL> future;
    Color color;
    std::string materialId;
  };
  std::vector<TessTask> tasks;
  tasks.reserve(result.sceneData.objects.size());

  for (const auto& obj : result.sceneData.objects) {
    if (obj.geometry) {
      tasks.push_back({
        std::async(std::launch::async, [geom = obj.geometry]() {
          return geom->GetMeshGL();
        }),
        obj.color,
        obj.materialId
      });
    }
  }

  result.meshes.reserve(tasks.size());
  for (auto& task : tasks) {
    result.meshes.push_back({task.future.get(), task.color, task.materialId});
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

}  // namespace dingcad
