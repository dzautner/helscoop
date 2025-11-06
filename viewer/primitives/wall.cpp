#include "wall.h"
#include <cmath>

namespace dingcad {
namespace primitives {

manifold::Manifold CreateWall(const WallParams& params) {
  // Calculate wall length and angle
  const double dx = params.end[0] - params.start[0];
  const double dy = params.end[1] - params.start[1];
  const double length = std::sqrt(dx * dx + dy * dy);
  const double angleRad = std::atan2(dy, dx);
  const double angleDeg = angleRad * 180.0 / M_PI;

  // Create wall as a box aligned with X-axis
  // In dingcad coordinate system: X is horizontal, Y is depth, Z is up
  manifold::Manifold wall = manifold::Manifold::Cube({length, params.thickness, params.height}, false);

  // The cube is created at origin, so we need to:
  // 1. Rotate around Z-axis to align with start->end direction
  // 2. Translate to start position (and lift to have bottom at Z=0)

  // Rotate around Z-axis
  wall = wall.Rotate(0.0, 0.0, angleDeg);

  // Calculate center position of the wall
  const double centerX = params.start[0] + dx / 2.0;
  const double centerY = params.start[1] + dy / 2.0;
  const double centerZ = params.height / 2.0;  // Lift so bottom is at Z=0

  // Translate to position
  wall = wall.Translate({centerX, centerY, centerZ});

  return wall;
}

}  // namespace primitives
}  // namespace dingcad
