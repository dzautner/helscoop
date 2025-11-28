find_package(raylib 4.0 REQUIRED)

add_library(dingcad_quickjs STATIC
  ${PROJECT_SOURCE_DIR}/vendor/quickjs/quickjs.c
  ${PROJECT_SOURCE_DIR}/vendor/quickjs/quickjs-libc.c
  ${PROJECT_SOURCE_DIR}/vendor/quickjs/cutils.c
  ${PROJECT_SOURCE_DIR}/vendor/quickjs/libunicode.c
  ${PROJECT_SOURCE_DIR}/vendor/quickjs/libregexp.c
  ${PROJECT_SOURCE_DIR}/vendor/quickjs/dtoa.c
)
target_include_directories(dingcad_quickjs PUBLIC ${PROJECT_SOURCE_DIR}/vendor/quickjs)
set_target_properties(dingcad_quickjs PROPERTIES LINKER_LANGUAGE C)

add_executable(dingcad_viewer
  main.cpp
  js_bindings.cpp
  file_utils.cpp
  mesh_utils.cpp
  scene_loader.cpp
  material_loader.cpp
  ui_panels.cpp
  primitives/wall.cpp
)

target_include_directories(dingcad_viewer
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${PROJECT_SOURCE_DIR}/vendor/manifold/include
    ${PROJECT_SOURCE_DIR}/vendor/quickjs
    ${PROJECT_SOURCE_DIR}/vendor
)

target_link_libraries(dingcad_viewer
  PRIVATE
    manifold
    raylib
    dingcad_quickjs
)
