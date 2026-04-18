#include "js_bindings.h"

#include <array>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#include "manifold/manifold.h"
#include "manifold/cross_section.h"
#include "manifold/polygon.h"
#include "manifold/meshIO.h"
#include "primitives/wall.h"

namespace {

void PrintLoadMeshError(const std::string &message) {
  const char esc = 0x1B;
  std::fprintf(stderr, "%c[31m%s%c[0m\n", esc, message.c_str(), esc);
  std::fflush(stderr);
}


struct JsManifold {
  std::shared_ptr<manifold::Manifold> handle;
};

JSClassID g_manifoldClassId;

void JsManifoldFinalizer(JSRuntime *rt, JSValue val) {
  (void)rt;
  auto *wrapper = static_cast<JsManifold *>(JS_GetOpaque(val, g_manifoldClassId));
  delete wrapper;
}

// Mutex for thread-safe class ID initialization
static std::mutex g_classIdMutex;

void EnsureManifoldClassInternal(JSRuntime *runtime) {
  // Thread-safe class ID initialization (only needs to happen once globally)
  {
    std::lock_guard<std::mutex> lock(g_classIdMutex);
    static bool idInitialised = false;
    if (!idInitialised) {
      JS_NewClassID(runtime, &g_manifoldClassId);
      idInitialised = true;
    }
  }
  // IMPORTANT: JS_NewClass must be called for EACH runtime, not just once!
  // QuickJS requires class registration per-runtime, even with same class ID.
  JSClassDef def{};
  def.class_name = "Manifold";
  def.finalizer = JsManifoldFinalizer;
  JS_NewClass(runtime, g_manifoldClassId, &def);
}

JSValue WrapManifold(JSContext *ctx, std::shared_ptr<manifold::Manifold> manifold) {
  JSValue obj = JS_NewObjectClass(ctx, g_manifoldClassId);
  if (JS_IsException(obj)) return obj;
  auto *wrapper = new JsManifold{std::move(manifold)};
  JS_SetOpaque(obj, wrapper);
  return obj;
}

JsManifold *GetJsManifold(JSContext *ctx, JSValueConst value) {
  return static_cast<JsManifold *>(JS_GetOpaque2(ctx, value, g_manifoldClassId));
}

std::shared_ptr<manifold::Manifold> GetManifoldHandleInternal(JSContext *ctx,
                                                              JSValueConst value) {
  JsManifold *jsManifold = GetJsManifold(ctx, value);
  if (!jsManifold) return nullptr;
  return jsManifold->handle;
}

bool GetVec3(JSContext *ctx, JSValueConst value, std::array<double, 3> &out) {
  if (!JS_IsArray(value)) {
    JS_ThrowTypeError(ctx, "expected array of three numbers");
    return false;
  }
  for (uint32_t i = 0; i < 3; ++i) {
    JSValue element = JS_GetPropertyUint32(ctx, value, i);
    if (JS_IsUndefined(element)) {
      JS_FreeValue(ctx, element);
      JS_ThrowTypeError(ctx, "vector requires three entries");
      return false;
    }
    if (JS_ToFloat64(ctx, &out[i], element) < 0) {
      JS_FreeValue(ctx, element);
      return false;
    }
    JS_FreeValue(ctx, element);
  }
  return true;
}

bool GetVec2(JSContext *ctx, JSValueConst value, std::array<double, 2> &out) {
  if (!JS_IsArray(value)) {
    JS_ThrowTypeError(ctx, "expected array of two numbers");
    return false;
  }
  for (uint32_t i = 0; i < 2; ++i) {
    JSValue element = JS_GetPropertyUint32(ctx, value, i);
    if (JS_IsUndefined(element)) {
      JS_FreeValue(ctx, element);
      JS_ThrowTypeError(ctx, "vector requires two entries");
      return false;
    }
    if (JS_ToFloat64(ctx, &out[i], element) < 0) {
      JS_FreeValue(ctx, element);
      return false;
    }
    JS_FreeValue(ctx, element);
  }
  return true;
}

bool GetMat3x4(JSContext *ctx, JSValueConst value, manifold::mat3x4 &out) {
  if (!JS_IsArray(value)) {
    JS_ThrowTypeError(ctx, "transform expects array of 12 numbers");
    return false;
  }
  std::array<double, 12> entries{};
  for (uint32_t i = 0; i < 12; ++i) {
    JSValue element = JS_GetPropertyUint32(ctx, value, i);
    if (JS_IsUndefined(element)) {
      JS_FreeValue(ctx, element);
      JS_ThrowTypeError(ctx, "transform array requires 12 entries");
      return false;
    }
    if (JS_ToFloat64(ctx, &entries[i], element) < 0) {
      JS_FreeValue(ctx, element);
      return false;
    }
    JS_FreeValue(ctx, element);
  }
  for (int row = 0; row < 3; ++row) {
    for (int col = 0; col < 4; ++col) {
      out[row][col] = entries[row * 4 + col];
    }
  }
  return true;
}

JSValue Vec3ToJs(JSContext *ctx, const manifold::vec3 &v) {
  JSValue arr = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, arr, 0, JS_NewFloat64(ctx, v.x));
  JS_SetPropertyUint32(ctx, arr, 1, JS_NewFloat64(ctx, v.y));
  JS_SetPropertyUint32(ctx, arr, 2, JS_NewFloat64(ctx, v.z));
  return arr;
}

JSValue Vec2ToJs(JSContext *ctx, const manifold::vec2 &v) {
  JSValue arr = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, arr, 0, JS_NewFloat64(ctx, v.x));
  JS_SetPropertyUint32(ctx, arr, 1, JS_NewFloat64(ctx, v.y));
  return arr;
}

bool JsValueToPolygons(JSContext *ctx, JSValueConst value,
                       manifold::Polygons &out) {
  if (!JS_IsArray(value)) {
    JS_ThrowTypeError(ctx, "polygons must be an array of loops");
    return false;
  }
  JSValue lengthVal = JS_GetPropertyStr(ctx, value, "length");
  uint32_t numItems = 0;
  if (JS_ToUint32(ctx, &numItems, lengthVal) < 0) {
    JS_FreeValue(ctx, lengthVal);
    return false;
  }
  JS_FreeValue(ctx, lengthVal);
  if (numItems == 0) {
    JS_ThrowTypeError(ctx, "polygons array is empty");
    return false;
  }

  // Auto-detect: flat polygon [[x,y], ...] vs nested [[[x,y], ...], ...]
  // Check if first element is a 2-number array (flat) or array of arrays (nested)
  bool isFlatPolygon = false;
  JSValue first = JS_GetPropertyUint32(ctx, value, 0);
  if (JS_IsArray(first)) {
    JSValue firstLenVal = JS_GetPropertyStr(ctx, first, "length");
    uint32_t firstLen = 0;
    if (JS_ToUint32(ctx, &firstLen, firstLenVal) == 0 && firstLen == 2) {
      JSValue elem0 = JS_GetPropertyUint32(ctx, first, 0);
      isFlatPolygon = JS_IsNumber(elem0);
      JS_FreeValue(ctx, elem0);
    }
    JS_FreeValue(ctx, firstLenVal);
  }
  JS_FreeValue(ctx, first);

  auto parseLoop = [&](JSValueConst loopVal, manifold::SimplePolygon &loop) -> bool {
    if (!JS_IsArray(loopVal)) {
      JS_ThrowTypeError(ctx, "each loop must be an array of [x,y] points");
      return false;
    }
    JSValue loopLenVal = JS_GetPropertyStr(ctx, loopVal, "length");
    uint32_t loopLen = 0;
    if (JS_ToUint32(ctx, &loopLen, loopLenVal) < 0) {
      JS_FreeValue(ctx, loopLenVal);
      return false;
    }
    JS_FreeValue(ctx, loopLenVal);
    loop.reserve(loopLen);
    for (uint32_t j = 0; j < loopLen; ++j) {
      JSValue pointVal = JS_GetPropertyUint32(ctx, loopVal, j);
      if (JS_IsException(pointVal)) return false;
      std::array<double, 2> point{};
      bool ok = GetVec2(ctx, pointVal, point);
      JS_FreeValue(ctx, pointVal);
      if (!ok) return false;
      loop.push_back({point[0], point[1]});
    }
    return true;
  };

  manifold::Polygons result;
  if (isFlatPolygon) {
    manifold::SimplePolygon loop;
    if (!parseLoop(value, loop)) return false;
    result.push_back(std::move(loop));
  } else {
    result.reserve(numItems);
    for (uint32_t i = 0; i < numItems; ++i) {
      JSValue loopVal = JS_GetPropertyUint32(ctx, value, i);
      if (JS_IsException(loopVal)) return false;
      manifold::SimplePolygon loop;
      if (!parseLoop(loopVal, loop)) {
        JS_FreeValue(ctx, loopVal);
        return false;
      }
      JS_FreeValue(ctx, loopVal);
      result.push_back(std::move(loop));
    }
  }
  out = std::move(result);
  return true;
}

JSValue PolygonsToJs(JSContext *ctx, const manifold::Polygons &polys) {
  JSValue arr = JS_NewArray(ctx);
  uint32_t loopIdx = 0;
  for (const auto &loop : polys) {
    JSValue loopArr = JS_NewArray(ctx);
    uint32_t pointIdx = 0;
    for (const auto &pt : loop) {
      JS_SetPropertyUint32(ctx, loopArr, pointIdx++, Vec2ToJs(ctx, pt));
    }
    JS_SetPropertyUint32(ctx, arr, loopIdx++, loopArr);
  }
  return arr;
}

bool CollectManifoldArgs(JSContext *ctx, int argc, JSValueConst *argv,
                         std::vector<manifold::Manifold> &out) {
  if (argc == 0) {
    JS_ThrowTypeError(ctx, "expected at least one manifold");
    return false;
  }
  if (argc == 1 && JS_IsArray(argv[0])) {
    JSValue arr = argv[0];
    JSValue lengthVal = JS_GetPropertyStr(ctx, arr, "length");
    uint32_t len = 0;
    if (JS_ToUint32(ctx, &len, lengthVal) < 0) {
      JS_FreeValue(ctx, lengthVal);
      return false;
    }
    JS_FreeValue(ctx, lengthVal);
    out.reserve(len);
    for (uint32_t i = 0; i < len; ++i) {
      JSValue itemVal = JS_GetPropertyUint32(ctx, arr, i);
      if (JS_IsException(itemVal)) return false;
      JsManifold *jsManifold = GetJsManifold(ctx, itemVal);
      JS_FreeValue(ctx, itemVal);
      if (!jsManifold) return false;
      out.push_back(*jsManifold->handle);
    }
    return true;
  }
  out.reserve(argc);
  for (int i = 0; i < argc; ++i) {
    JsManifold *jsManifold = GetJsManifold(ctx, argv[i]);
    if (!jsManifold) return false;
    out.push_back(*jsManifold->handle);
  }
  return true;
}

JSValue ManifoldVectorToJsArray(JSContext *ctx,
                                std::vector<manifold::Manifold> manifolds) {
  JSValue arr = JS_NewArray(ctx);
  uint32_t idx = 0;
  for (auto &mf : manifolds) {
    auto wrapped = std::make_shared<manifold::Manifold>(std::move(mf));
    JS_SetPropertyUint32(ctx, arr, idx++, WrapManifold(ctx, std::move(wrapped)));
  }
  return arr;
}

bool JsArrayToVec3List(JSContext *ctx, JSValueConst value,
                       std::vector<manifold::vec3> &out) {
  if (!JS_IsArray(value)) {
    JS_ThrowTypeError(ctx, "expected array of [x,y,z] points");
    return false;
  }
  JSValue lengthVal = JS_GetPropertyStr(ctx, value, "length");
  uint32_t length = 0;
  if (JS_ToUint32(ctx, &length, lengthVal) < 0) {
    JS_FreeValue(ctx, lengthVal);
    return false;
  }
  JS_FreeValue(ctx, lengthVal);
  std::vector<manifold::vec3> result;
  result.reserve(length);
  for (uint32_t i = 0; i < length; ++i) {
    JSValue pointVal = JS_GetPropertyUint32(ctx, value, i);
    if (JS_IsException(pointVal)) return false;
    std::array<double, 3> coords{};
    bool ok = GetVec3(ctx, pointVal, coords);
    JS_FreeValue(ctx, pointVal);
    if (!ok) return false;
    manifold::vec3 vec{coords[0], coords[1], coords[2]};
    result.push_back(vec);
  }
  out = std::move(result);
  return true;
}

bool GetOpType(JSContext *ctx, JSValueConst value, manifold::OpType &out) {
  if (JS_IsString(value)) {
    const char *opStr = JS_ToCString(ctx, value);
    if (!opStr) return false;
    std::string opLower(opStr);
    JS_FreeCString(ctx, opStr);
    for (auto &c : opLower) {
      c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    }
    if (opLower == "add" || opLower == "union") {
      out = manifold::OpType::Add;
      return true;
    }
    if (opLower == "subtract" || opLower == "difference") {
      out = manifold::OpType::Subtract;
      return true;
    }
    if (opLower == "intersect" || opLower == "intersection") {
      out = manifold::OpType::Intersect;
      return true;
    }
    JS_ThrowTypeError(ctx, "unknown boolean op");
    return false;
  }
  if (JS_IsNumber(value)) {
    int32_t idx = 0;
    if (JS_ToInt32(ctx, &idx, value) < 0) return false;
    switch (idx) {
      case 0:
        out = manifold::OpType::Add;
        return true;
      case 1:
        out = manifold::OpType::Subtract;
        return true;
      case 2:
        out = manifold::OpType::Intersect;
        return true;
      default:
        JS_ThrowRangeError(ctx, "boolean op index must be 0,1,2");
        return false;
    }
  }
  JS_ThrowTypeError(ctx, "op must be string or number");
  return false;
}

const char *ErrorToString(manifold::Manifold::Error err) {
  switch (err) {
    case manifold::Manifold::Error::NoError:
      return "NoError";
    case manifold::Manifold::Error::NonFiniteVertex:
      return "NonFiniteVertex";
    case manifold::Manifold::Error::NotManifold:
      return "NotManifold";
    case manifold::Manifold::Error::VertexOutOfBounds:
      return "VertexOutOfBounds";
    case manifold::Manifold::Error::PropertiesWrongLength:
      return "PropertiesWrongLength";
    case manifold::Manifold::Error::MissingPositionProperties:
      return "MissingPositionProperties";
    case manifold::Manifold::Error::MergeVectorsDifferentLengths:
      return "MergeVectorsDifferentLengths";
    case manifold::Manifold::Error::MergeIndexOutOfBounds:
      return "MergeIndexOutOfBounds";
    case manifold::Manifold::Error::TransformWrongLength:
      return "TransformWrongLength";
    case manifold::Manifold::Error::RunIndexWrongLength:
      return "RunIndexWrongLength";
    case manifold::Manifold::Error::FaceIDWrongLength:
      return "FaceIDWrongLength";
    case manifold::Manifold::Error::InvalidConstruction:
      return "InvalidConstruction";
    case manifold::Manifold::Error::ResultTooLarge:
      return "ResultTooLarge";
  }
  return "Unknown";
}

bool GetBox(JSContext *ctx, JSValueConst value, manifold::Box &out) {
  if (!JS_IsObject(value)) {
    JS_ThrowTypeError(ctx, "bounds must be an object with min/max");
    return false;
  }
  JSValue minVal = JS_GetPropertyStr(ctx, value, "min");
  JSValue maxVal = JS_GetPropertyStr(ctx, value, "max");
  if (JS_IsUndefined(minVal) || JS_IsUndefined(maxVal)) {
    JS_FreeValue(ctx, minVal);
    JS_FreeValue(ctx, maxVal);
    JS_ThrowTypeError(ctx, "bounds requires min and max arrays");
    return false;
  }
  std::array<double, 3> minArr{};
  std::array<double, 3> maxArr{};
  bool okMin = GetVec3(ctx, minVal, minArr);
  bool okMax = okMin && GetVec3(ctx, maxVal, maxArr);
  JS_FreeValue(ctx, minVal);
  JS_FreeValue(ctx, maxVal);
  if (!okMax) return false;
  out.min = manifold::vec3{minArr[0], minArr[1], minArr[2]};
  out.max = manifold::vec3{maxArr[0], maxArr[1], maxArr[2]};
  return true;
}

JSValue JsCube(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  double sx = 1.0, sy = 1.0, sz = 1.0;
  bool center = false;
  if (argc >= 1 && JS_IsObject(argv[0])) {
    // Accept both cube([w,h,d]) and cube({size: [w,h,d], center: true})
    if (JS_IsArray(argv[0])) {
      std::array<double, 3> size{};
      if (!GetVec3(ctx, argv[0], size)) return JS_EXCEPTION;
      sx = size[0]; sy = size[1]; sz = size[2];
    } else {
      JSValue sizeVal = JS_GetPropertyStr(ctx, argv[0], "size");
      if (!JS_IsUndefined(sizeVal)) {
        std::array<double, 3> size{};
        if (!GetVec3(ctx, sizeVal, size)) {
          JS_FreeValue(ctx, sizeVal);
          return JS_EXCEPTION;
        }
        sx = size[0]; sy = size[1]; sz = size[2];
      }
      JS_FreeValue(ctx, sizeVal);
      JSValue centerVal = JS_GetPropertyStr(ctx, argv[0], "center");
      if (!JS_IsUndefined(centerVal)) {
        int c = JS_ToBool(ctx, centerVal);
        if (c < 0) {
          JS_FreeValue(ctx, centerVal);
          return JS_EXCEPTION;
        }
        center = c == 1;
      }
      JS_FreeValue(ctx, centerVal);
    }
  }
  auto manifold = std::make_shared<manifold::Manifold>(manifold::Manifold::Cube({sx, sy, sz}, center));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsSphere(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  double radius = 1.0;
  if (argc >= 1 && JS_IsNumber(argv[0])) {
    if (JS_ToFloat64(ctx, &radius, argv[0]) < 0) return JS_EXCEPTION;
  } else if (argc >= 1 && JS_IsObject(argv[0])) {
    JSValue radiusVal = JS_GetPropertyStr(ctx, argv[0], "radius");
    if (!JS_IsUndefined(radiusVal)) {
      if (JS_ToFloat64(ctx, &radius, radiusVal) < 0) {
        JS_FreeValue(ctx, radiusVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, radiusVal);
  }
  auto manifold = std::make_shared<manifold::Manifold>(manifold::Manifold::Sphere(radius, 0));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsCylinder(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  double height = 1.0;
  double radius = 0.5;
  double radiusTop = -1.0;
  int32_t segments = 0;
  bool center = false;
  // Accept cylinder(height, radius) shorthand
  if (argc >= 2 && JS_IsNumber(argv[0]) && JS_IsNumber(argv[1])) {
    if (JS_ToFloat64(ctx, &height, argv[0]) < 0) return JS_EXCEPTION;
    if (JS_ToFloat64(ctx, &radius, argv[1]) < 0) return JS_EXCEPTION;
  } else if (argc >= 1 && JS_IsObject(argv[0])) {
    JSValue heightVal = JS_GetPropertyStr(ctx, argv[0], "height");
    if (!JS_IsUndefined(heightVal)) {
      if (JS_ToFloat64(ctx, &height, heightVal) < 0) {
        JS_FreeValue(ctx, heightVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, heightVal);

    JSValue radiusVal = JS_GetPropertyStr(ctx, argv[0], "radius");
    if (!JS_IsUndefined(radiusVal)) {
      if (JS_ToFloat64(ctx, &radius, radiusVal) < 0) {
        JS_FreeValue(ctx, radiusVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, radiusVal);

    JSValue radiusTopVal = JS_GetPropertyStr(ctx, argv[0], "radiusTop");
    if (!JS_IsUndefined(radiusTopVal)) {
      if (JS_ToFloat64(ctx, &radiusTop, radiusTopVal) < 0) {
        JS_FreeValue(ctx, radiusTopVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, radiusTopVal);

    JSValue segVal = JS_GetPropertyStr(ctx, argv[0], "segments");
    if (!JS_IsUndefined(segVal)) {
      if (JS_ToInt32(ctx, &segments, segVal) < 0) {
        JS_FreeValue(ctx, segVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, segVal);

    JSValue centerVal = JS_GetPropertyStr(ctx, argv[0], "center");
    if (!JS_IsUndefined(centerVal)) {
      int c = JS_ToBool(ctx, centerVal);
      if (c < 0) {
        JS_FreeValue(ctx, centerVal);
        return JS_EXCEPTION;
      }
      center = c == 1;
    }
    JS_FreeValue(ctx, centerVal);
  }
  double radiusHigh = (radiusTop < 0.0) ? radius : radiusTop;
  auto manifold = std::make_shared<manifold::Manifold>(
      manifold::Manifold::Cylinder(height, radius, radiusHigh, segments, center));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsWall(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  dingcad::primitives::WallParams params;

  if (argc >= 1 && JS_IsObject(argv[0])) {
    // Get start position [x, y]
    JSValue startVal = JS_GetPropertyStr(ctx, argv[0], "start");
    if (!JS_IsUndefined(startVal)) {
      std::array<double, 3> start3{};
      if (GetVec3(ctx, startVal, start3)) {
        params.start = {start3[0], start3[1]};
      } else {
        // Try as vec2
        JSValue x = JS_GetPropertyUint32(ctx, startVal, 0);
        JSValue y = JS_GetPropertyUint32(ctx, startVal, 1);
        if (!JS_IsUndefined(x) && !JS_IsUndefined(y)) {
          if (JS_ToFloat64(ctx, &params.start[0], x) < 0 ||
              JS_ToFloat64(ctx, &params.start[1], y) < 0) {
            JS_FreeValue(ctx, x); JS_FreeValue(ctx, y);
            JS_FreeValue(ctx, startVal);
            return JS_EXCEPTION;
          }
        }
        JS_FreeValue(ctx, x);
        JS_FreeValue(ctx, y);
      }
    }
    JS_FreeValue(ctx, startVal);

    // Get end position [x, y]
    JSValue endVal = JS_GetPropertyStr(ctx, argv[0], "end");
    if (!JS_IsUndefined(endVal)) {
      std::array<double, 3> end3{};
      if (GetVec3(ctx, endVal, end3)) {
        params.end = {end3[0], end3[1]};
      } else {
        // Try as vec2
        JSValue x = JS_GetPropertyUint32(ctx, endVal, 0);
        JSValue y = JS_GetPropertyUint32(ctx, endVal, 1);
        if (!JS_IsUndefined(x) && !JS_IsUndefined(y)) {
          if (JS_ToFloat64(ctx, &params.end[0], x) < 0 ||
              JS_ToFloat64(ctx, &params.end[1], y) < 0) {
            JS_FreeValue(ctx, x); JS_FreeValue(ctx, y);
            JS_FreeValue(ctx, endVal);
            return JS_EXCEPTION;
          }
        }
        JS_FreeValue(ctx, x);
        JS_FreeValue(ctx, y);
      }
    }
    JS_FreeValue(ctx, endVal);

    JSValue heightVal = JS_GetPropertyStr(ctx, argv[0], "height");
    if (!JS_IsUndefined(heightVal)) {
      if (JS_ToFloat64(ctx, &params.height, heightVal) < 0) {
        JS_FreeValue(ctx, heightVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, heightVal);

    JSValue thicknessVal = JS_GetPropertyStr(ctx, argv[0], "thickness");
    if (!JS_IsUndefined(thicknessVal)) {
      if (JS_ToFloat64(ctx, &params.thickness, thicknessVal) < 0) {
        JS_FreeValue(ctx, thicknessVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, thicknessVal);

    // Get construction type
    JSValue constructionVal = JS_GetPropertyStr(ctx, argv[0], "construction");
    if (!JS_IsUndefined(constructionVal) && JS_IsString(constructionVal)) {
      const char* constructionStr = JS_ToCString(ctx, constructionVal);
      if (constructionStr) {
        std::string construction(constructionStr);
        if (construction == "stickFrame" || construction == "STICK_FRAME") {
          params.constructionType = dingcad::primitives::ConstructionType::STICK_FRAME;
        } else if (construction == "solid" || construction == "SOLID") {
          params.constructionType = dingcad::primitives::ConstructionType::SOLID;
        }
        JS_FreeCString(ctx, constructionStr);
      }
    }
    JS_FreeValue(ctx, constructionVal);

    // Get stick-frame parameters
    JSValue studSizeVal = JS_GetPropertyStr(ctx, argv[0], "studSize");
    if (!JS_IsUndefined(studSizeVal)) {
      JSValue w = JS_GetPropertyUint32(ctx, studSizeVal, 0);
      JSValue d = JS_GetPropertyUint32(ctx, studSizeVal, 1);
      if (!JS_IsUndefined(w) && !JS_IsUndefined(d)) {
        if (JS_ToFloat64(ctx, &params.studSize[0], w) < 0 ||
            JS_ToFloat64(ctx, &params.studSize[1], d) < 0) {
          JS_FreeValue(ctx, w); JS_FreeValue(ctx, d);
          JS_FreeValue(ctx, studSizeVal);
          return JS_EXCEPTION;
        }
      }
      JS_FreeValue(ctx, w);
      JS_FreeValue(ctx, d);
    }
    JS_FreeValue(ctx, studSizeVal);

    JSValue studSpacingVal = JS_GetPropertyStr(ctx, argv[0], "studSpacing");
    if (!JS_IsUndefined(studSpacingVal)) {
      if (JS_ToFloat64(ctx, &params.studSpacing, studSpacingVal) < 0) {
        JS_FreeValue(ctx, studSpacingVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, studSpacingVal);

    JSValue sheathingVal = JS_GetPropertyStr(ctx, argv[0], "includeSheathing");
    if (!JS_IsUndefined(sheathingVal)) {
      int sheathing = JS_ToBool(ctx, sheathingVal);
      if (sheathing >= 0) {
        params.includeSheathing = (sheathing == 1);
      }
    }
    JS_FreeValue(ctx, sheathingVal);

    JSValue sheathingThicknessVal = JS_GetPropertyStr(ctx, argv[0], "sheathingThickness");
    if (!JS_IsUndefined(sheathingThicknessVal)) {
      if (JS_ToFloat64(ctx, &params.sheathingThickness, sheathingThicknessVal) < 0) {
        JS_FreeValue(ctx, sheathingThicknessVal);
        return JS_EXCEPTION;
      }
    }
    JS_FreeValue(ctx, sheathingThicknessVal);
  }

  auto manifold = std::make_shared<manifold::Manifold>(dingcad::primitives::CreateWall(params));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsBoolean(JSContext *ctx, int argc, JSValueConst *argv,
                  manifold::OpType op) {
  std::vector<manifold::Manifold> parts;
  if (!CollectManifoldArgs(ctx, argc, argv, parts)) return JS_EXCEPTION;
  if (parts.size() < 2) {
    return JS_ThrowTypeError(ctx, "boolean operation requires at least two manifolds");
  }
  auto result = std::make_shared<manifold::Manifold>(
    manifold::Manifold::BatchBoolean(parts, op)
  );
  return WrapManifold(ctx, std::move(result));
}

JSValue JsUnion(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  return JsBoolean(ctx, argc, argv, manifold::OpType::Add);
}

JSValue JsDifference(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  return JsBoolean(ctx, argc, argv, manifold::OpType::Subtract);
}

JSValue JsIntersection(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  return JsBoolean(ctx, argc, argv, manifold::OpType::Intersect);
}

JSValue JsTranslate(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "translate expects (manifold, [x,y,z])");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  std::array<double, 3> offset{};
  if (!GetVec3(ctx, argv[1], offset)) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(
      target->handle->Translate({offset[0], offset[1], offset[2]}));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsScale(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "scale expects (manifold, factor)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  manifold::vec3 scaleVec{1.0, 1.0, 1.0};
  if (JS_IsNumber(argv[1])) {
    double s = 1.0;
    if (JS_ToFloat64(ctx, &s, argv[1]) < 0) return JS_EXCEPTION;
    scaleVec = {s, s, s};
  } else {
    std::array<double, 3> factors{};
    if (!GetVec3(ctx, argv[1], factors)) return JS_EXCEPTION;
    scaleVec = {factors[0], factors[1], factors[2]};
  }
  auto manifold = std::make_shared<manifold::Manifold>(target->handle->Scale(scaleVec));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsRotate(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "rotate expects (manifold, [x,y,z] degrees)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  std::array<double, 3> angles{};
  if (!GetVec3(ctx, argv[1], angles)) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(
      target->handle->Rotate(angles[0], angles[1], angles[2]));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsTetrahedron(JSContext *ctx, JSValueConst, int, JSValueConst *) {
  auto manifold = std::make_shared<manifold::Manifold>(
      manifold::Manifold::Tetrahedron());
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsCompose(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  std::vector<manifold::Manifold> parts;
  if (!CollectManifoldArgs(ctx, argc, argv, parts)) return JS_EXCEPTION;
  if (parts.empty()) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(
      manifold::Manifold::Compose(parts));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsDecompose(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "decompose expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  auto manifolds = target->handle->Decompose();
  return ManifoldVectorToJsArray(ctx, std::move(manifolds));
}

JSValue JsMirror(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "mirror expects (manifold, [x,y,z])");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  std::array<double, 3> normal{};
  if (!GetVec3(ctx, argv[1], normal)) return JS_EXCEPTION;
  manifold::vec3 plane{normal[0], normal[1], normal[2]};
  auto manifold = std::make_shared<manifold::Manifold>(
      target->handle->Mirror(plane));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsTransform(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "transform expects (manifold, mat3x4)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  manifold::mat3x4 matrix{};
  if (!GetMat3x4(ctx, argv[1], matrix)) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(target->handle->Transform(matrix));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsSetTolerance(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "setTolerance expects (manifold, tolerance)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  double tol = 0.0;
  if (JS_ToFloat64(ctx, &tol, argv[1]) < 0) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(target->handle->SetTolerance(tol));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsSimplify(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "simplify expects (manifold, tolerance?)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  double tol = 0.0;
  if (argc >= 2 && !JS_IsUndefined(argv[1])) {
    if (JS_ToFloat64(ctx, &tol, argv[1]) < 0) return JS_EXCEPTION;
  }
  auto manifold = std::make_shared<manifold::Manifold>(target->handle->Simplify(tol));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsRefine(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "refine expects (manifold, iterations)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  int32_t iterations = 0;
  if (JS_ToInt32(ctx, &iterations, argv[1]) < 0) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(target->handle->Refine(iterations));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsRefineToLength(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "refineToLength expects (manifold, length)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  double length = 0.0;
  if (JS_ToFloat64(ctx, &length, argv[1]) < 0) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(target->handle->RefineToLength(length));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsRefineToTolerance(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "refineToTolerance expects (manifold, tolerance)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  double tol = 0.0;
  if (JS_ToFloat64(ctx, &tol, argv[1]) < 0) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(target->handle->RefineToTolerance(tol));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsHull(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  std::vector<manifold::Manifold> parts;
  if (!CollectManifoldArgs(ctx, argc, argv, parts)) return JS_EXCEPTION;
  if (parts.empty()) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(
      manifold::Manifold::Hull(parts));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsHullPoints(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "hullPoints expects array of [x,y,z]");
  }
  std::vector<manifold::vec3> pts;
  if (!JsArrayToVec3List(ctx, argv[0], pts)) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(
      manifold::Manifold::Hull(pts));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsTrimByPlane(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "trimByPlane expects (manifold, [nx,ny,nz], offset)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  std::array<double, 3> normal{};
  if (!GetVec3(ctx, argv[1], normal)) return JS_EXCEPTION;
  double offset = 0.0;
  if (JS_ToFloat64(ctx, &offset, argv[2]) < 0) return JS_EXCEPTION;
  manifold::vec3 n{normal[0], normal[1], normal[2]};
  auto manifold = std::make_shared<manifold::Manifold>(
      target->handle->TrimByPlane(n, offset));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsSurfaceArea(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "surfaceArea expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewFloat64(ctx, target->handle->SurfaceArea());
}

JSValue JsVolume(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "volume expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewFloat64(ctx, target->handle->Volume());
}

JSValue JsBoundingBox(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "boundingBox expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  manifold::Box box = target->handle->BoundingBox();
  JSValue obj = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, obj, "min", Vec3ToJs(ctx, box.min));
  JS_SetPropertyStr(ctx, obj, "max", Vec3ToJs(ctx, box.max));
  return obj;
}

JSValue JsNumTriangles(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "numTriangles expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewInt64(ctx, static_cast<int64_t>(target->handle->NumTri()));
}

JSValue JsNumVertices(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "numVertices expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewInt64(ctx, static_cast<int64_t>(target->handle->NumVert()));
}

JSValue JsNumEdges(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "numEdges expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewInt64(ctx, static_cast<int64_t>(target->handle->NumEdge()));
}

JSValue JsGenus(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "genus expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewInt32(ctx, target->handle->Genus());
}

JSValue JsGetTolerance(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "getTolerance expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewFloat64(ctx, target->handle->GetTolerance());
}

JSValue JsIsEmpty(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "isEmpty expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewBool(ctx, target->handle->IsEmpty());
}

JSValue JsStatus(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "status expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  const char *err = ErrorToString(target->handle->Status());
  return JS_NewString(ctx, err);
}

JSValue JsSlice(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "slice expects (manifold, height?)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  double height = 0.0;
  if (argc >= 2 && !JS_IsUndefined(argv[1])) {
    if (JS_ToFloat64(ctx, &height, argv[1]) < 0) return JS_EXCEPTION;
  }
  manifold::Polygons polys = target->handle->Slice(height);
  return PolygonsToJs(ctx, polys);
}

JSValue JsProject(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "project expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  manifold::Polygons polys = target->handle->Project();
  return PolygonsToJs(ctx, polys);
}

JSValue JsExtrude(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "extrude expects (polygons, height_or_options)");
  }
  manifold::Polygons polys;
  if (!JsValueToPolygons(ctx, argv[0], polys)) return JS_EXCEPTION;
  if (JS_IsNumber(argv[1])) {
    double height = 1.0;
    if (JS_ToFloat64(ctx, &height, argv[1]) < 0) return JS_EXCEPTION;
    auto manifold = std::make_shared<manifold::Manifold>(
        manifold::Manifold::Extrude(polys, height));
    return WrapManifold(ctx, std::move(manifold));
  }
  if (!JS_IsObject(argv[1])) {
    return JS_ThrowTypeError(ctx, "extrude second arg must be a number or options object");
  }
  JSValue opts = argv[1];
  double height = 1.0;
  int32_t divisions = 0;
  double twist = 0.0;
  manifold::vec2 scaleTop{1.0, 1.0};

  JSValue heightVal = JS_GetPropertyStr(ctx, opts, "height");
  if (!JS_IsUndefined(heightVal)) {
    if (JS_ToFloat64(ctx, &height, heightVal) < 0) {
      JS_FreeValue(ctx, heightVal);
      return JS_EXCEPTION;
    }
  }
  JS_FreeValue(ctx, heightVal);

  JSValue divVal = JS_GetPropertyStr(ctx, opts, "divisions");
  if (!JS_IsUndefined(divVal)) {
    if (JS_ToInt32(ctx, &divisions, divVal) < 0) {
      JS_FreeValue(ctx, divVal);
      return JS_EXCEPTION;
    }
  }
  JS_FreeValue(ctx, divVal);

  JSValue twistVal = JS_GetPropertyStr(ctx, opts, "twistDegrees");
  if (!JS_IsUndefined(twistVal)) {
    if (JS_ToFloat64(ctx, &twist, twistVal) < 0) {
      JS_FreeValue(ctx, twistVal);
      return JS_EXCEPTION;
    }
  }
  JS_FreeValue(ctx, twistVal);

  JSValue scaleVal = JS_GetPropertyStr(ctx, opts, "scaleTop");
  if (!JS_IsUndefined(scaleVal)) {
    if (JS_IsNumber(scaleVal)) {
      double s = 1.0;
      if (JS_ToFloat64(ctx, &s, scaleVal) < 0) {
        JS_FreeValue(ctx, scaleVal);
        return JS_EXCEPTION;
      }
      scaleTop = manifold::vec2{s, s};
    } else {
      std::array<double, 2> factors{};
      if (!GetVec2(ctx, scaleVal, factors)) {
        JS_FreeValue(ctx, scaleVal);
        return JS_EXCEPTION;
      }
      scaleTop = manifold::vec2{factors[0], factors[1]};
    }
  }
  JS_FreeValue(ctx, scaleVal);

  if (height <= 0.0)
    return JS_ThrowRangeError(ctx, "extrude height must be > 0");
  if (divisions < 0)
    return JS_ThrowRangeError(ctx, "extrude divisions must be >= 0");
  auto manifold = std::make_shared<manifold::Manifold>(
      manifold::Manifold::Extrude(polys, height, divisions, twist, scaleTop));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsRevolve(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "revolve expects (polygons, options?)");
  }
  manifold::Polygons polys;
  if (!JsValueToPolygons(ctx, argv[0], polys)) return JS_EXCEPTION;
  int32_t segments = 0;
  double degrees = 360.0;
  if (argc >= 2) {
    if (JS_IsNumber(argv[1])) {
      if (JS_ToInt32(ctx, &segments, argv[1]) < 0) return JS_EXCEPTION;
    } else if (JS_IsObject(argv[1])) {
      JSValue opts = argv[1];
      JSValue segVal = JS_GetPropertyStr(ctx, opts, "segments");
      if (!JS_IsUndefined(segVal)) {
        if (JS_ToInt32(ctx, &segments, segVal) < 0) {
          JS_FreeValue(ctx, segVal);
          return JS_EXCEPTION;
        }
      }
      JS_FreeValue(ctx, segVal);
      JSValue degVal = JS_GetPropertyStr(ctx, opts, "degrees");
      if (!JS_IsUndefined(degVal)) {
        if (JS_ToFloat64(ctx, &degrees, degVal) < 0) {
          JS_FreeValue(ctx, degVal);
          return JS_EXCEPTION;
        }
      }
      JS_FreeValue(ctx, degVal);
    }
  }
  if (segments < 0)
    return JS_ThrowRangeError(ctx, "revolve segments must be >= 0");
  if (degrees == 0.0)
    return JS_ThrowRangeError(ctx, "revolve degrees must be non-zero");
  auto manifold = std::make_shared<manifold::Manifold>(
      manifold::Manifold::Revolve(polys, segments, degrees));
  return WrapManifold(ctx, std::move(manifold));
}

// circle2D(radius, segments?) — returns a polygon array for a circle
JSValue JsCircle2D(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) return JS_ThrowTypeError(ctx, "circle2D expects (radius, segments?)");
  double radius = 10.0;
  int32_t segments = 32;
  if (JS_ToFloat64(ctx, &radius, argv[0]) < 0) return JS_EXCEPTION;
  if (argc >= 2 && JS_IsNumber(argv[1])) {
    if (JS_ToInt32(ctx, &segments, argv[1]) < 0) return JS_EXCEPTION;
  }
  if (segments < 3) segments = 3;

  JSValue poly = JS_NewArray(ctx);
  for (int i = 0; i < segments; i++) {
    double angle = 2.0 * M_PI * i / segments;
    JSValue pt = JS_NewArray(ctx);
    JS_SetPropertyUint32(ctx, pt, 0, JS_NewFloat64(ctx, radius * cos(angle)));
    JS_SetPropertyUint32(ctx, pt, 1, JS_NewFloat64(ctx, radius * sin(angle)));
    JS_SetPropertyUint32(ctx, poly, static_cast<uint32_t>(i), pt);
  }
  JSValue result = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, result, 0, poly);
  return result;
}

// rect2D(width, height, center?) — returns a polygon array for a rectangle
JSValue JsRect2D(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) return JS_ThrowTypeError(ctx, "rect2D expects (width, height, center?)");
  double w = 10.0, h = 10.0;
  bool center = false;
  if (JS_ToFloat64(ctx, &w, argv[0]) < 0) return JS_EXCEPTION;
  if (JS_ToFloat64(ctx, &h, argv[1]) < 0) return JS_EXCEPTION;
  if (argc >= 3) center = JS_ToBool(ctx, argv[2]);

  double x0 = center ? -w / 2.0 : 0.0;
  double y0 = center ? -h / 2.0 : 0.0;

  JSValue poly = JS_NewArray(ctx);
  double pts[4][2] = {{x0, y0}, {x0 + w, y0}, {x0 + w, y0 + h}, {x0, y0 + h}};
  for (int i = 0; i < 4; i++) {
    JSValue pt = JS_NewArray(ctx);
    JS_SetPropertyUint32(ctx, pt, 0, JS_NewFloat64(ctx, pts[i][0]));
    JS_SetPropertyUint32(ctx, pt, 1, JS_NewFloat64(ctx, pts[i][1]));
    JS_SetPropertyUint32(ctx, poly, static_cast<uint32_t>(i), pt);
  }
  JSValue result = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, result, 0, poly);
  return result;
}

// offset2D(polygon, delta) or offset2D(polygon, {delta, join, miterLimit, segments})
// Returns an offset polygon array (positive delta = outward, negative = inward)
JSValue JsOffset2D(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "offset2D expects (polygon, delta_or_options)");
  }
  manifold::Polygons polys;
  if (!JsValueToPolygons(ctx, argv[0], polys)) return JS_EXCEPTION;

  double delta = 0.0;
  auto joinType = manifold::CrossSection::JoinType::Round;
  double miterLimit = 2.0;
  int32_t circularSegments = 0;

  if (JS_IsNumber(argv[1])) {
    if (JS_ToFloat64(ctx, &delta, argv[1]) < 0) return JS_EXCEPTION;
  } else if (JS_IsObject(argv[1])) {
    JSValue v;
    v = JS_GetPropertyStr(ctx, argv[1], "delta");
    if (!JS_IsUndefined(v)) { if (JS_ToFloat64(ctx, &delta, v) < 0) { JS_FreeValue(ctx, v); return JS_EXCEPTION; } }
    JS_FreeValue(ctx, v);
    v = JS_GetPropertyStr(ctx, argv[1], "miterLimit");
    if (!JS_IsUndefined(v)) { if (JS_ToFloat64(ctx, &miterLimit, v) < 0) { JS_FreeValue(ctx, v); return JS_EXCEPTION; } }
    JS_FreeValue(ctx, v);
    v = JS_GetPropertyStr(ctx, argv[1], "segments");
    if (!JS_IsUndefined(v)) { if (JS_ToInt32(ctx, &circularSegments, v) < 0) { JS_FreeValue(ctx, v); return JS_EXCEPTION; } }
    JS_FreeValue(ctx, v);
    v = JS_GetPropertyStr(ctx, argv[1], "join");
    if (JS_IsString(v)) {
      const char* s = JS_ToCString(ctx, v);
      if (s) {
        std::string jt(s);
        if (jt == "square") joinType = manifold::CrossSection::JoinType::Square;
        else if (jt == "miter") joinType = manifold::CrossSection::JoinType::Miter;
        else if (jt == "bevel") joinType = manifold::CrossSection::JoinType::Bevel;
        JS_FreeCString(ctx, s);
      }
    }
    JS_FreeValue(ctx, v);
  } else {
    return JS_ThrowTypeError(ctx, "offset2D second arg must be a number or options object");
  }

  manifold::CrossSection cs(polys, manifold::CrossSection::FillRule::Positive);
  manifold::CrossSection offset = cs.Offset(delta, joinType, miterLimit, circularSegments);

  auto paths = offset.ToPolygons();
  JSValue result = JS_NewArray(ctx);
  for (size_t i = 0; i < paths.size(); i++) {
    JSValue poly = JS_NewArray(ctx);
    for (size_t j = 0; j < paths[i].size(); j++) {
      JSValue pt = JS_NewArray(ctx);
      JS_SetPropertyUint32(ctx, pt, 0, JS_NewFloat64(ctx, paths[i][j].x));
      JS_SetPropertyUint32(ctx, pt, 1, JS_NewFloat64(ctx, paths[i][j].y));
      JS_SetPropertyUint32(ctx, poly, static_cast<uint32_t>(j), pt);
    }
    JS_SetPropertyUint32(ctx, result, static_cast<uint32_t>(i), poly);
  }
  return result;
}

// torus(majorRadius, minorRadius) or torus({majorRadius, minorRadius, segments?, minorSegments?})
JSValue JsTorus(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  double majorR = 10.0;
  double minorR = 3.0;
  int32_t segments = 48;
  int32_t minorSegments = 24;
  if (argc >= 2 && JS_IsNumber(argv[0]) && JS_IsNumber(argv[1])) {
    if (JS_ToFloat64(ctx, &majorR, argv[0]) < 0) return JS_EXCEPTION;
    if (JS_ToFloat64(ctx, &minorR, argv[1]) < 0) return JS_EXCEPTION;
  } else if (argc >= 1 && JS_IsObject(argv[0])) {
    JSValue v;
    v = JS_GetPropertyStr(ctx, argv[0], "majorRadius");
    if (!JS_IsUndefined(v)) { if (JS_ToFloat64(ctx, &majorR, v) < 0) { JS_FreeValue(ctx, v); return JS_EXCEPTION; } }
    JS_FreeValue(ctx, v);
    v = JS_GetPropertyStr(ctx, argv[0], "minorRadius");
    if (!JS_IsUndefined(v)) { if (JS_ToFloat64(ctx, &minorR, v) < 0) { JS_FreeValue(ctx, v); return JS_EXCEPTION; } }
    JS_FreeValue(ctx, v);
    v = JS_GetPropertyStr(ctx, argv[0], "segments");
    if (!JS_IsUndefined(v)) { if (JS_ToInt32(ctx, &segments, v) < 0) { JS_FreeValue(ctx, v); return JS_EXCEPTION; } }
    JS_FreeValue(ctx, v);
    v = JS_GetPropertyStr(ctx, argv[0], "minorSegments");
    if (!JS_IsUndefined(v)) { if (JS_ToInt32(ctx, &minorSegments, v) < 0) { JS_FreeValue(ctx, v); return JS_EXCEPTION; } }
    JS_FreeValue(ctx, v);
  }
  if (majorR <= 0.0 || minorR <= 0.0)
    return JS_ThrowRangeError(ctx, "torus radii must be > 0");
  if (minorR >= majorR)
    return JS_ThrowRangeError(ctx, "minorRadius must be < majorRadius");

  manifold::Polygons polys(1);
  auto& ring = polys[0];
  ring.reserve(minorSegments);
  for (int i = 0; i < minorSegments; ++i) {
    double angle = 2.0 * M_PI * i / minorSegments;
    double x = majorR + minorR * std::cos(angle);
    double y = minorR * std::sin(angle);
    ring.push_back({x, y});
  }

  auto result = std::make_shared<manifold::Manifold>(
      manifold::Manifold::Revolve(polys, segments));
  return WrapManifold(ctx, std::move(result));
}

JSValue JsBatchBoolean(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "batchBoolean expects (op, manifolds)");
  }
  manifold::OpType op;
  if (!GetOpType(ctx, argv[0], op)) return JS_EXCEPTION;
  std::vector<manifold::Manifold> parts;
  if (JS_IsArray(argv[1])) {
    if (!CollectManifoldArgs(ctx, 1, &argv[1], parts)) return JS_EXCEPTION;
  } else {
    if (!CollectManifoldArgs(ctx, argc - 1, argv + 1, parts)) return JS_EXCEPTION;
  }
  if (parts.empty()) {
    JS_ThrowTypeError(ctx, "batchBoolean requires manifolds");
    return JS_EXCEPTION;
  }
  auto manifold = std::make_shared<manifold::Manifold>(
      manifold::Manifold::BatchBoolean(parts, op));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsBooleanOp(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "boolean expects (manifoldA, manifoldB, op)");
  }
  JsManifold *base = GetJsManifold(ctx, argv[0]);
  if (!base) return JS_EXCEPTION;
  JsManifold *other = GetJsManifold(ctx, argv[1]);
  if (!other) return JS_EXCEPTION;
  manifold::OpType op;
  if (!GetOpType(ctx, argv[2], op)) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(
      base->handle->Boolean(*other->handle, op));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsLoadMesh(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "loadMesh expects (path[, forceCleanup])");
  }
  const char *pathStr = JS_ToCString(ctx, argv[0]);
  if (!pathStr) return JS_EXCEPTION;
  std::string path(pathStr);
  JS_FreeCString(ctx, pathStr);

  std::filesystem::path fsPath;
  if (!path.empty() && path[0] == '~') {
    const char *home = std::getenv("HOME");
    if (!home) {
      const std::string msg = "loadMesh: HOME is not set; cannot resolve '~'";
      PrintLoadMeshError(msg);
      return JS_ThrowInternalError(ctx, "%s", msg.c_str());
    }
    std::filesystem::path homePath(home);
    if (path.size() == 1) {
      fsPath = homePath;
    } else if (path[1] == '/') {
      fsPath = homePath / path.substr(2);
    } else {
      fsPath = homePath / path.substr(1);
    }
  } else {
    fsPath = std::filesystem::path(path);
  }

  std::error_code ec;
  if (!fsPath.is_absolute()) {
    auto absPath = std::filesystem::absolute(fsPath, ec);
    if (ec) {
      const std::string msg = "loadMesh: unable to resolve path '" + path + "'";
      PrintLoadMeshError(msg);
      return JS_ThrowInternalError(ctx, "loadMesh: unable to resolve path '%s'", path.c_str());
    }
    fsPath = absPath;
  }
  const std::string resolvedPath = fsPath.string();

  if (!std::filesystem::exists(fsPath, ec) || ec) {
    const std::string msg = "loadMesh: file not found '" + resolvedPath + "' (expected in ~/Downloads/models)";
    PrintLoadMeshError(msg);
    return JS_ThrowInternalError(ctx, "loadMesh: file not found '%s'", resolvedPath.c_str());
  }
  if (!std::filesystem::is_regular_file(fsPath, ec) || ec) {
    const std::string msg = "loadMesh: not a regular file '" + resolvedPath + "'";
    PrintLoadMeshError(msg);
    return JS_ThrowInternalError(ctx, "loadMesh: not a regular file '%s'", resolvedPath.c_str());
  }

  bool forceCleanup = false;
  if (argc >= 2 && !JS_IsUndefined(argv[1])) {
    int flag = JS_ToBool(ctx, argv[1]);
    if (flag < 0) return JS_EXCEPTION;
    forceCleanup = flag == 1;
  }

  try {
    manifold::MeshGL mesh = manifold::ImportMesh(fsPath.string(), forceCleanup);
    if (mesh.NumTri() == 0 || mesh.NumVert() == 0) {
      const std::string msg = "loadMesh: imported mesh is empty for '" + resolvedPath + "'";
      PrintLoadMeshError(msg);
      return JS_ThrowInternalError(ctx, "loadMesh: imported mesh is empty");
    }
    manifold::Manifold manifold(mesh);
    auto handle = std::make_shared<manifold::Manifold>(std::move(manifold));
    return WrapManifold(ctx, std::move(handle));
  } catch (const std::exception &e) {
    const std::string msg = std::string("loadMesh failed: ") + e.what();
    PrintLoadMeshError(msg);
    return JS_ThrowInternalError(ctx, "loadMesh failed: %s", e.what());
  }
}




JSValue JsLevelSet(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1 || !JS_IsObject(argv[0])) {
    return JS_ThrowTypeError(ctx, "levelSet expects options object");
  }
  JSValue opts = argv[0];
  JSValue sdfVal = JS_GetPropertyStr(ctx, opts, "sdf");
  if (!JS_IsFunction(ctx, sdfVal)) {
    JS_FreeValue(ctx, sdfVal);
    return JS_ThrowTypeError(ctx, "levelSet requires sdf function");
  }
  JSValue boundsVal = JS_GetPropertyStr(ctx, opts, "bounds");
  if (JS_IsUndefined(boundsVal)) {
    JS_FreeValue(ctx, sdfVal);
    return JS_ThrowTypeError(ctx, "levelSet requires bounds");
  }
  manifold::Box bounds;
  if (!GetBox(ctx, boundsVal, bounds)) {
    JS_FreeValue(ctx, sdfVal);
    JS_FreeValue(ctx, boundsVal);
    return JS_EXCEPTION;
  }
  JS_FreeValue(ctx, boundsVal);

  JSValue edgeVal = JS_GetPropertyStr(ctx, opts, "edgeLength");
  if (JS_IsUndefined(edgeVal)) {
    JS_FreeValue(ctx, sdfVal);
    return JS_ThrowTypeError(ctx, "levelSet requires edgeLength");
  }
  double edgeLength = 0.0;
  if (JS_ToFloat64(ctx, &edgeLength, edgeVal) < 0) {
    JS_FreeValue(ctx, sdfVal);
    JS_FreeValue(ctx, edgeVal);
    return JS_EXCEPTION;
  }
  JS_FreeValue(ctx, edgeVal);

  double level = 0.0;
  double tolerance = -1.0;
  bool canParallel = false;

  JSValue levelVal = JS_GetPropertyStr(ctx, opts, "level");
  if (!JS_IsUndefined(levelVal)) {
    if (JS_ToFloat64(ctx, &level, levelVal) < 0) {
      JS_FreeValue(ctx, sdfVal);
      JS_FreeValue(ctx, levelVal);
      return JS_EXCEPTION;
    }
  }
  JS_FreeValue(ctx, levelVal);

  JSValue tolVal = JS_GetPropertyStr(ctx, opts, "tolerance");
  if (!JS_IsUndefined(tolVal)) {
    if (JS_ToFloat64(ctx, &tolerance, tolVal) < 0) {
      JS_FreeValue(ctx, sdfVal);
      JS_FreeValue(ctx, tolVal);
      return JS_EXCEPTION;
    }
  }
  JS_FreeValue(ctx, tolVal);

  JSValue parallelVal = JS_GetPropertyStr(ctx, opts, "canParallel");
  if (!JS_IsUndefined(parallelVal)) {
    int p = JS_ToBool(ctx, parallelVal);
    if (p < 0) {
      JS_FreeValue(ctx, sdfVal);
      JS_FreeValue(ctx, parallelVal);
      return JS_EXCEPTION;
    }
    canParallel = p == 1;
  }
  JS_FreeValue(ctx, parallelVal);

  if (canParallel) {
    JS_FreeValue(ctx, sdfVal);
    return JS_ThrowTypeError(ctx,
                             "levelSet canParallel must be false when using JS SDF");
  }

  JSValue sdfFunc = JS_DupValue(ctx, sdfVal);
  JS_FreeValue(ctx, sdfVal);

  bool errorOccurred = false;
  std::string errorMessage;
  auto sdf = [ctx, sdfFunc, &errorOccurred, &errorMessage](manifold::vec3 p) {
    if (errorOccurred) return 0.0;
    JSValue point = JS_NewArray(ctx);
    JS_SetPropertyUint32(ctx, point, 0, JS_NewFloat64(ctx, p.x));
    JS_SetPropertyUint32(ctx, point, 1, JS_NewFloat64(ctx, p.y));
    JS_SetPropertyUint32(ctx, point, 2, JS_NewFloat64(ctx, p.z));
    JSValueConst args[1] = {point};
    JSValue result = JS_Call(ctx, sdfFunc, JS_UNDEFINED, 1, args);
    JS_FreeValue(ctx, point);
    if (JS_IsException(result)) {
      JSValue exc = JS_GetException(ctx);
      JSValue stack = JS_GetPropertyStr(ctx, exc, "stack");
      const char *msg = JS_ToCString(ctx, JS_IsUndefined(stack) ? exc : stack);
      errorOccurred = true;
      errorMessage = msg ? msg : "levelSet SDF threw";
      if (msg) JS_FreeCString(ctx, msg);
      JS_FreeValue(ctx, stack);
      JS_FreeValue(ctx, exc);
      return 0.0;
    }
    double value = 0.0;
    if (JS_ToFloat64(ctx, &value, result) < 0) {
      errorOccurred = true;
      errorMessage = "levelSet SDF must return number";
      JS_FreeValue(ctx, result);
      return 0.0;
    }
    JS_FreeValue(ctx, result);
    return value;
  };

  auto manifoldPtr = std::make_shared<manifold::Manifold>(
      manifold::Manifold::LevelSet(sdf, bounds, edgeLength, level, tolerance,
                                   false));
  JS_FreeValue(ctx, sdfFunc);
  if (errorOccurred) {
    return JS_ThrowInternalError(ctx, "%s", errorMessage.c_str());
  }
  return WrapManifold(ctx, std::move(manifoldPtr));
}

JSValue JsWarp(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "warp expects (manifold, function)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  if (!JS_IsFunction(ctx, argv[1])) {
    return JS_ThrowTypeError(ctx, "warp second argument must be a function");
  }
  JSValue warpFunc = JS_DupValue(ctx, argv[1]);
  bool errorOccurred = false;
  std::string errorMessage;

  auto warpFn = [ctx, warpFunc, &errorOccurred, &errorMessage](manifold::vec3 &v) {
    if (errorOccurred) return;
    JSValue point = JS_NewArray(ctx);
    JS_SetPropertyUint32(ctx, point, 0, JS_NewFloat64(ctx, v.x));
    JS_SetPropertyUint32(ctx, point, 1, JS_NewFloat64(ctx, v.y));
    JS_SetPropertyUint32(ctx, point, 2, JS_NewFloat64(ctx, v.z));
    JSValueConst args[1] = {point};
    JSValue result = JS_Call(ctx, warpFunc, JS_UNDEFINED, 1, args);
    JS_FreeValue(ctx, point);
    if (JS_IsException(result)) {
      JSValue exc = JS_GetException(ctx);
      const char *msg = JS_ToCString(ctx, exc);
      errorOccurred = true;
      errorMessage = msg ? msg : "warp function threw";
      if (msg) JS_FreeCString(ctx, msg);
      JS_FreeValue(ctx, exc);
      return;
    }
    if (!JS_IsArray(result)) {
      errorOccurred = true;
      errorMessage = "warp function must return [x,y,z]";
      JS_FreeValue(ctx, result);
      return;
    }
    JSValue x = JS_GetPropertyUint32(ctx, result, 0);
    JSValue y = JS_GetPropertyUint32(ctx, result, 1);
    JSValue z = JS_GetPropertyUint32(ctx, result, 2);
    double vx, vy, vz;
    if (JS_ToFloat64(ctx, &vx, x) < 0 || JS_ToFloat64(ctx, &vy, y) < 0 ||
        JS_ToFloat64(ctx, &vz, z) < 0) {
      errorOccurred = true;
      errorMessage = "warp function must return [number, number, number]";
    } else {
      v.x = vx;
      v.y = vy;
      v.z = vz;
    }
    JS_FreeValue(ctx, x);
    JS_FreeValue(ctx, y);
    JS_FreeValue(ctx, z);
    JS_FreeValue(ctx, result);
  };

  auto manifold = std::make_shared<manifold::Manifold>(target->handle->Warp(warpFn));
  JS_FreeValue(ctx, warpFunc);
  if (errorOccurred) {
    return JS_ThrowInternalError(ctx, "%s", errorMessage.c_str());
  }
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsSplitByPlane(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "splitByPlane expects (manifold, [nx,ny,nz], offset)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  std::array<double, 3> normal{};
  if (!GetVec3(ctx, argv[1], normal)) return JS_EXCEPTION;
  double offset = 0.0;
  if (JS_ToFloat64(ctx, &offset, argv[2]) < 0) return JS_EXCEPTION;
  manifold::vec3 n{normal[0], normal[1], normal[2]};
  auto pair = target->handle->SplitByPlane(n, offset);
  JSValue result = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, result, 0,
                       WrapManifold(ctx, std::make_shared<manifold::Manifold>(std::move(pair.first))));
  JS_SetPropertyUint32(ctx, result, 1,
                       WrapManifold(ctx, std::make_shared<manifold::Manifold>(std::move(pair.second))));
  return result;
}

JSValue JsSplit(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "split expects (manifold, cutter)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  JsManifold *cutter = GetJsManifold(ctx, argv[1]);
  if (!cutter) return JS_EXCEPTION;
  auto pair = target->handle->Split(*cutter->handle);
  JSValue result = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, result, 0,
                       WrapManifold(ctx, std::make_shared<manifold::Manifold>(std::move(pair.first))));
  JS_SetPropertyUint32(ctx, result, 1,
                       WrapManifold(ctx, std::make_shared<manifold::Manifold>(std::move(pair.second))));
  return result;
}

JSValue JsAsOriginal(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "asOriginal expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(target->handle->AsOriginal());
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsOriginalId(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "originalId expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewUint32(ctx, target->handle->OriginalID());
}

JSValue JsReserveIds(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "reserveIds expects count");
  }
  uint32_t count = 0;
  if (JS_ToUint32(ctx, &count, argv[0]) < 0) return JS_EXCEPTION;
  uint32_t base = manifold::Manifold::ReserveIDs(count);
  return JS_NewUint32(ctx, base);
}

JSValue JsNumProperties(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "numProperties expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewInt64(ctx, static_cast<int64_t>(target->handle->NumProp()));
}

JSValue JsNumPropertyVertices(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "numPropertyVertices expects a manifold");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  return JS_NewInt64(ctx, static_cast<int64_t>(target->handle->NumPropVert()));
}

JSValue JsCalculateNormals(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "calculateNormals expects (manifold, normalIdx, minSharpAngle?)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  int32_t normalIdx = 0;
  if (JS_ToInt32(ctx, &normalIdx, argv[1]) < 0) return JS_EXCEPTION;
  double minSharp = 60.0;
  if (argc >= 3 && !JS_IsUndefined(argv[2])) {
    if (JS_ToFloat64(ctx, &minSharp, argv[2]) < 0) return JS_EXCEPTION;
  }
  auto manifold = std::make_shared<manifold::Manifold>(
      target->handle->CalculateNormals(normalIdx, minSharp));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsCalculateCurvature(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "calculateCurvature expects (manifold, gaussianIdx, meanIdx)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  int32_t gaussianIdx = 0;
  int32_t meanIdx = 0;
  if (JS_ToInt32(ctx, &gaussianIdx, argv[1]) < 0) return JS_EXCEPTION;
  if (JS_ToInt32(ctx, &meanIdx, argv[2]) < 0) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(
      target->handle->CalculateCurvature(gaussianIdx, meanIdx));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsSmoothByNormals(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "smoothByNormals expects (manifold, normalIdx)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  int32_t normalIdx = 0;
  if (JS_ToInt32(ctx, &normalIdx, argv[1]) < 0) return JS_EXCEPTION;
  auto manifold = std::make_shared<manifold::Manifold>(
      target->handle->SmoothByNormals(normalIdx));
  return WrapManifold(ctx, std::move(manifold));
}

JSValue JsSmoothOut(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "smoothOut expects (manifold, minSharpAngle?, minSmoothness?)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  double minSharp = 60.0;
  double minSmooth = 0.0;
  if (argc >= 2 && !JS_IsUndefined(argv[1])) {
    if (JS_ToFloat64(ctx, &minSharp, argv[1]) < 0) return JS_EXCEPTION;
  }
  if (argc >= 3 && !JS_IsUndefined(argv[2])) {
    if (JS_ToFloat64(ctx, &minSmooth, argv[2]) < 0) return JS_EXCEPTION;
  }
  auto manifold = std::make_shared<manifold::Manifold>(
      target->handle->SmoothOut(minSharp, minSmooth));
  return WrapManifold(ctx, std::move(manifold));
}

// smooth(manifold, tolerance?) — SmoothOut + RefineToTolerance in one call
JSValue JsSmooth(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "smooth expects (manifold, tolerance?)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  double tolerance = 0.5;
  if (argc >= 2 && !JS_IsUndefined(argv[1])) {
    if (JS_ToFloat64(ctx, &tolerance, argv[1]) < 0) return JS_EXCEPTION;
  }
  if (tolerance <= 0.0)
    return JS_ThrowRangeError(ctx, "smooth tolerance must be > 0");
  auto smoothed = target->handle->SmoothOut();
  auto refined = std::make_shared<manifold::Manifold>(smoothed.RefineToTolerance(tolerance));
  return WrapManifold(ctx, std::move(refined));
}

JSValue JsMinGap(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "minGap expects (manifoldA, manifoldB, searchLength)");
  }
  JsManifold *a = GetJsManifold(ctx, argv[0]);
  if (!a) return JS_EXCEPTION;
  JsManifold *b = GetJsManifold(ctx, argv[1]);
  if (!b) return JS_EXCEPTION;
  double searchLength = 0.0;
  if (JS_ToFloat64(ctx, &searchLength, argv[2]) < 0) return JS_EXCEPTION;
  return JS_NewFloat64(ctx, a->handle->MinGap(*b->handle, searchLength));
}

// linearPattern(geometry, count, [dx, dy, dz]) — union of count copies offset by [dx,dy,dz]
JSValue JsLinearPattern(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "linearPattern expects (manifold, count, [dx,dy,dz])");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  int32_t count = 1;
  if (JS_ToInt32(ctx, &count, argv[1]) < 0) return JS_EXCEPTION;
  if (count < 1) return JS_ThrowRangeError(ctx, "count must be >= 1");
  std::array<double, 3> offset{};
  if (!GetVec3(ctx, argv[2], offset)) return JS_EXCEPTION;

  std::vector<manifold::Manifold> parts;
  parts.reserve(count);
  for (int32_t i = 0; i < count; ++i) {
    parts.push_back(target->handle->Translate(
      {offset[0] * i, offset[1] * i, offset[2] * i}));
  }
  auto result = std::make_shared<manifold::Manifold>(
    manifold::Manifold::BatchBoolean(parts, manifold::OpType::Add));
  return WrapManifold(ctx, std::move(result));
}

// circularPattern(geometry, count) — count copies rotated around Z axis (height)
JSValue JsCircularPattern(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "circularPattern expects (manifold, count)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;
  int32_t count = 1;
  if (JS_ToInt32(ctx, &count, argv[1]) < 0) return JS_EXCEPTION;
  if (count < 1) return JS_ThrowRangeError(ctx, "count must be >= 1");

  std::vector<manifold::Manifold> parts;
  parts.reserve(count);
  double angleStep = 360.0 / count;
  for (int32_t i = 0; i < count; ++i) {
    parts.push_back(target->handle->Rotate(0.0, 0.0, angleStep * i));
  }
  auto result = std::make_shared<manifold::Manifold>(
    manifold::Manifold::BatchBoolean(parts, manifold::OpType::Add));
  return WrapManifold(ctx, std::move(result));
}

JSValue JsWithColor(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "withColor expects (manifold, [r,g,b])");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;

  std::array<double, 3> color{};
  if (!GetVec3(ctx, argv[1], color)) return JS_EXCEPTION;

  // Create a wrapper object with geometry and color properties
  JSValue obj = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, obj, "geometry", JS_DupValue(ctx, argv[0]));

  JSValue colorArray = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, colorArray, 0, JS_NewFloat64(ctx, color[0]));
  JS_SetPropertyUint32(ctx, colorArray, 1, JS_NewFloat64(ctx, color[1]));
  JS_SetPropertyUint32(ctx, colorArray, 2, JS_NewFloat64(ctx, color[2]));
  JS_SetPropertyStr(ctx, obj, "color", colorArray);

  return obj;
}

JSValue JsWithPBR(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2 || !JS_IsObject(argv[1])) {
    return JS_ThrowTypeError(ctx, "withPBR expects (manifold, {roughness?, metallic?, color?})");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;

  JSValue obj = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, obj, "geometry", JS_DupValue(ctx, argv[0]));

  JSValue opts = argv[1];
  JSValue roughnessVal = JS_GetPropertyStr(ctx, opts, "roughness");
  if (!JS_IsUndefined(roughnessVal)) {
    JS_SetPropertyStr(ctx, obj, "roughness", JS_DupValue(ctx, roughnessVal));
  }
  JS_FreeValue(ctx, roughnessVal);

  JSValue metallicVal = JS_GetPropertyStr(ctx, opts, "metallic");
  if (!JS_IsUndefined(metallicVal)) {
    JS_SetPropertyStr(ctx, obj, "metallic", JS_DupValue(ctx, metallicVal));
  }
  JS_FreeValue(ctx, metallicVal);

  JSValue colorVal = JS_GetPropertyStr(ctx, opts, "color");
  if (!JS_IsUndefined(colorVal) && JS_IsArray(colorVal)) {
    JS_SetPropertyStr(ctx, obj, "color", JS_DupValue(ctx, colorVal));
  }
  JS_FreeValue(ctx, colorVal);

  return obj;
}

JSValue JsWithMaterial(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "withMaterial expects (manifold, materialId)");
  }
  JsManifold *target = GetJsManifold(ctx, argv[0]);
  if (!target) return JS_EXCEPTION;

  const char *matId = JS_ToCString(ctx, argv[1]);
  if (!matId) return JS_EXCEPTION;

  JSValue obj = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, obj, "geometry", JS_DupValue(ctx, argv[0]));
  JS_SetPropertyStr(ctx, obj, "material", JS_NewString(ctx, matId));
  JS_FreeCString(ctx, matId);

  return obj;
}

std::string FormatConsoleArgs(JSContext *ctx, int argc, JSValueConst *argv) {
  std::string msg;
  for (int i = 0; i < argc; ++i) {
    if (i > 0) msg += ' ';
    const char *str = JS_ToCString(ctx, argv[i]);
    if (str) { msg += str; JS_FreeCString(ctx, str); }
  }
  return msg;
}

JSValue JsConsoleLog(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  std::fprintf(stderr, "[JS] %s\n", FormatConsoleArgs(ctx, argc, argv).c_str());
  return JS_UNDEFINED;
}

JSValue JsConsoleWarn(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  std::fprintf(stderr, "[JS WARN] %s\n", FormatConsoleArgs(ctx, argc, argv).c_str());
  return JS_UNDEFINED;
}

JSValue JsConsoleError(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv) {
  std::fprintf(stderr, "[JS ERROR] %s\n", FormatConsoleArgs(ctx, argc, argv).c_str());
  return JS_UNDEFINED;
}

void RegisterBindingsInternal(JSContext *ctx) {
  JSValue global = JS_GetGlobalObject(ctx);

  // console.log/warn/error
  JSValue console = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, console, "log", JS_NewCFunction(ctx, JsConsoleLog, "log", 1));
  JS_SetPropertyStr(ctx, console, "warn", JS_NewCFunction(ctx, JsConsoleWarn, "warn", 1));
  JS_SetPropertyStr(ctx, console, "error", JS_NewCFunction(ctx, JsConsoleError, "error", 1));
  JS_SetPropertyStr(ctx, global, "console", console);
  JS_SetPropertyStr(ctx, global, "cube", JS_NewCFunction(ctx, JsCube, "cube", 1));
  JS_SetPropertyStr(ctx, global, "sphere", JS_NewCFunction(ctx, JsSphere, "sphere", 1));
  JS_SetPropertyStr(ctx, global, "cylinder", JS_NewCFunction(ctx, JsCylinder, "cylinder", 1));
  JS_SetPropertyStr(ctx, global, "Wall", JS_NewCFunction(ctx, JsWall, "Wall", 1));
  JS_SetPropertyStr(ctx, global, "withColor", JS_NewCFunction(ctx, JsWithColor, "withColor", 2));
  JS_SetPropertyStr(ctx, global, "withPBR", JS_NewCFunction(ctx, JsWithPBR, "withPBR", 2));
  JS_SetPropertyStr(ctx, global, "withMaterial", JS_NewCFunction(ctx, JsWithMaterial, "withMaterial", 2));
  JS_SetPropertyStr(ctx, global, "linearPattern", JS_NewCFunction(ctx, JsLinearPattern, "linearPattern", 3));
  JS_SetPropertyStr(ctx, global, "circularPattern", JS_NewCFunction(ctx, JsCircularPattern, "circularPattern", 2));
  JS_SetPropertyStr(ctx, global, "union", JS_NewCFunction(ctx, JsUnion, "union", 1));
  JS_SetPropertyStr(ctx, global, "difference", JS_NewCFunction(ctx, JsDifference, "difference", 1));
  JS_SetPropertyStr(ctx, global, "intersection", JS_NewCFunction(ctx, JsIntersection, "intersection", 1));
  JS_SetPropertyStr(ctx, global, "translate", JS_NewCFunction(ctx, JsTranslate, "translate", 2));
  JS_SetPropertyStr(ctx, global, "scale", JS_NewCFunction(ctx, JsScale, "scale", 2));
  JS_SetPropertyStr(ctx, global, "rotate", JS_NewCFunction(ctx, JsRotate, "rotate", 2));
  JS_SetPropertyStr(ctx, global, "tetrahedron",
                    JS_NewCFunction(ctx, JsTetrahedron, "tetrahedron", 0));
  JS_SetPropertyStr(ctx, global, "compose",
                    JS_NewCFunction(ctx, JsCompose, "compose", 1));
  JS_SetPropertyStr(ctx, global, "decompose",
                    JS_NewCFunction(ctx, JsDecompose, "decompose", 1));
  JS_SetPropertyStr(ctx, global, "mirror",
                    JS_NewCFunction(ctx, JsMirror, "mirror", 2));
  JS_SetPropertyStr(ctx, global, "transform",
                    JS_NewCFunction(ctx, JsTransform, "transform", 2));
  JS_SetPropertyStr(ctx, global, "setTolerance",
                    JS_NewCFunction(ctx, JsSetTolerance, "setTolerance", 2));
  JS_SetPropertyStr(ctx, global, "simplify",
                    JS_NewCFunction(ctx, JsSimplify, "simplify", 2));
  JS_SetPropertyStr(ctx, global, "refine",
                    JS_NewCFunction(ctx, JsRefine, "refine", 2));
  JS_SetPropertyStr(ctx, global, "refineToLength",
                    JS_NewCFunction(ctx, JsRefineToLength, "refineToLength", 2));
  JS_SetPropertyStr(ctx, global, "refineToTolerance",
                    JS_NewCFunction(ctx, JsRefineToTolerance, "refineToTolerance", 2));
  JS_SetPropertyStr(ctx, global, "hull",
                    JS_NewCFunction(ctx, JsHull, "hull", 1));
  JS_SetPropertyStr(ctx, global, "hullPoints",
                    JS_NewCFunction(ctx, JsHullPoints, "hullPoints", 1));
  JS_SetPropertyStr(ctx, global, "trimByPlane",
                    JS_NewCFunction(ctx, JsTrimByPlane, "trimByPlane", 3));
  JS_SetPropertyStr(ctx, global, "surfaceArea",
                    JS_NewCFunction(ctx, JsSurfaceArea, "surfaceArea", 1));
  JS_SetPropertyStr(ctx, global, "volume",
                    JS_NewCFunction(ctx, JsVolume, "volume", 1));
  JS_SetPropertyStr(ctx, global, "boundingBox",
                    JS_NewCFunction(ctx, JsBoundingBox, "boundingBox", 1));
  JS_SetPropertyStr(ctx, global, "numTriangles",
                    JS_NewCFunction(ctx, JsNumTriangles, "numTriangles", 1));
  JS_SetPropertyStr(ctx, global, "numVertices",
                    JS_NewCFunction(ctx, JsNumVertices, "numVertices", 1));
  JS_SetPropertyStr(ctx, global, "numEdges",
                    JS_NewCFunction(ctx, JsNumEdges, "numEdges", 1));
  JS_SetPropertyStr(ctx, global, "genus",
                    JS_NewCFunction(ctx, JsGenus, "genus", 1));
  JS_SetPropertyStr(ctx, global, "getTolerance",
                    JS_NewCFunction(ctx, JsGetTolerance, "getTolerance", 1));
  JS_SetPropertyStr(ctx, global, "isEmpty",
                    JS_NewCFunction(ctx, JsIsEmpty, "isEmpty", 1));
  JS_SetPropertyStr(ctx, global, "status",
                    JS_NewCFunction(ctx, JsStatus, "status", 1));
  JS_SetPropertyStr(ctx, global, "slice",
                    JS_NewCFunction(ctx, JsSlice, "slice", 2));
  JS_SetPropertyStr(ctx, global, "project",
                    JS_NewCFunction(ctx, JsProject, "project", 1));
  JS_SetPropertyStr(ctx, global, "extrude",
                    JS_NewCFunction(ctx, JsExtrude, "extrude", 2));
  JS_SetPropertyStr(ctx, global, "revolve",
                    JS_NewCFunction(ctx, JsRevolve, "revolve", 2));
  JS_SetPropertyStr(ctx, global, "offset2D",
                    JS_NewCFunction(ctx, JsOffset2D, "offset2D", 2));
  JS_SetPropertyStr(ctx, global, "circle2D",
                    JS_NewCFunction(ctx, JsCircle2D, "circle2D", 2));
  JS_SetPropertyStr(ctx, global, "rect2D",
                    JS_NewCFunction(ctx, JsRect2D, "rect2D", 3));
  JS_SetPropertyStr(ctx, global, "torus",
                    JS_NewCFunction(ctx, JsTorus, "torus", 2));
  JS_SetPropertyStr(ctx, global, "boolean",
                    JS_NewCFunction(ctx, JsBooleanOp, "boolean", 3));
  JS_SetPropertyStr(ctx, global, "batchBoolean",
                    JS_NewCFunction(ctx, JsBatchBoolean, "batchBoolean", 2));
  JS_SetPropertyStr(ctx, global, "levelSet",
                    JS_NewCFunction(ctx, JsLevelSet, "levelSet", 1));
  JS_SetPropertyStr(ctx, global, "loadMesh",
                    JS_NewCFunction(ctx, JsLoadMesh, "loadMesh", 2));
  JS_SetPropertyStr(ctx, global, "asOriginal",
                    JS_NewCFunction(ctx, JsAsOriginal, "asOriginal", 1));
  JS_SetPropertyStr(ctx, global, "originalId",
                    JS_NewCFunction(ctx, JsOriginalId, "originalId", 1));
  JS_SetPropertyStr(ctx, global, "reserveIds",
                    JS_NewCFunction(ctx, JsReserveIds, "reserveIds", 1));
  JS_SetPropertyStr(ctx, global, "numProperties",
                    JS_NewCFunction(ctx, JsNumProperties, "numProperties", 1));
  JS_SetPropertyStr(ctx, global, "numPropertyVertices",
                    JS_NewCFunction(ctx, JsNumPropertyVertices,
                                     "numPropertyVertices", 1));
  JS_SetPropertyStr(ctx, global, "calculateNormals",
                    JS_NewCFunction(ctx, JsCalculateNormals,
                                     "calculateNormals", 3));
  JS_SetPropertyStr(ctx, global, "calculateCurvature",
                    JS_NewCFunction(ctx, JsCalculateCurvature,
                                     "calculateCurvature", 3));
  JS_SetPropertyStr(ctx, global, "smoothByNormals",
                    JS_NewCFunction(ctx, JsSmoothByNormals,
                                     "smoothByNormals", 2));
  JS_SetPropertyStr(ctx, global, "smoothOut",
                    JS_NewCFunction(ctx, JsSmoothOut, "smoothOut", 3));
  JS_SetPropertyStr(ctx, global, "smooth",
                    JS_NewCFunction(ctx, JsSmooth, "smooth", 2));
  JS_SetPropertyStr(ctx, global, "minGap",
                    JS_NewCFunction(ctx, JsMinGap, "minGap", 3));
  JS_SetPropertyStr(ctx, global, "warp",
                    JS_NewCFunction(ctx, JsWarp, "warp", 2));
  JS_SetPropertyStr(ctx, global, "splitByPlane",
                    JS_NewCFunction(ctx, JsSplitByPlane, "splitByPlane", 3));
  JS_SetPropertyStr(ctx, global, "split",
                    JS_NewCFunction(ctx, JsSplit, "split", 2));
  JS_FreeValue(ctx, global);
}

}  // namespace

void EnsureManifoldClass(JSRuntime *runtime) {
  EnsureManifoldClassInternal(runtime);
}

void RegisterBindings(JSContext *ctx) {
  RegisterBindingsInternal(ctx);
}

std::shared_ptr<manifold::Manifold> GetManifoldHandle(JSContext *ctx,
                                                      JSValueConst value) {
  return GetManifoldHandleInternal(ctx, value);
}