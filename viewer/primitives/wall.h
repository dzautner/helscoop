#pragma once

#include <array>
#include "manifold/manifold.h"

namespace dingcad {
namespace primitives {

struct WallParams {
  std::array<double, 2> start;  // [x, y] start position
  std::array<double, 2> end;    // [x, y] end position
  double height;                // Wall height
  double thickness;             // Wall thickness (default: 98mm for 2x4 stud)

  // Constructor with defaults
  WallParams()
    : start{0.0, 0.0}
    , end{1000.0, 0.0}
    , height(2000.0)
    , thickness(98.0) {}
};

// Create a basic solid wall manifold
manifold::Manifold CreateWall(const WallParams& params);

}  // namespace primitives
}  // namespace dingcad
