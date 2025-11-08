#include "wall.h"
#include <cmath>
#include <vector>

namespace dingcad {
namespace primitives {

manifold::Manifold CreateSolidWall(const WallParams& params) {
  // Calculate wall length and angle
  const double dx = params.end[0] - params.start[0];
  const double dy = params.end[1] - params.start[1];
  const double length = std::sqrt(dx * dx + dy * dy);
  const double angleRad = std::atan2(dy, dx);
  const double angleDeg = angleRad * 180.0 / M_PI;

  // Create wall as a box aligned with X-axis
  manifold::Manifold wall = manifold::Manifold::Cube({length, params.thickness, params.height}, false);

  // Rotate around Z-axis to align with start->end direction
  wall = wall.Rotate(0.0, 0.0, angleDeg);

  // Calculate center position of the wall
  const double centerX = params.start[0] + dx / 2.0;
  const double centerY = params.start[1] + dy / 2.0;
  const double centerZ = params.height / 2.0;

  // Translate to position
  wall = wall.Translate({centerX, centerY, centerZ});

  return wall;
}

manifold::Manifold CreateStickFrameWall(const WallParams& params) {
  // Calculate wall length and angle
  const double dx = params.end[0] - params.start[0];
  const double dy = params.end[1] - params.start[1];
  const double length = std::sqrt(dx * dx + dy * dy);
  const double angleRad = std::atan2(dy, dx);
  const double angleDeg = angleRad * 180.0 / M_PI;

  std::vector<manifold::Manifold> components;

  const double studWidth = params.studSize[0];
  const double studDepth = params.studSize[1];

  // Bottom plate (runs full length)
  manifold::Manifold bottomPlate = manifold::Manifold::Cube(
    {length, studWidth, params.bottomPlateHeight}, false
  );
  bottomPlate = bottomPlate.Translate({length/2.0, studWidth/2.0, params.bottomPlateHeight/2.0});
  components.push_back(bottomPlate);

  // Top plate (runs full length)
  const double topPlateZ = params.height - params.topPlateHeight;
  manifold::Manifold topPlate = manifold::Manifold::Cube(
    {length, studWidth, params.topPlateHeight}, false
  );
  topPlate = topPlate.Translate({length/2.0, studWidth/2.0, topPlateZ + params.topPlateHeight/2.0});
  components.push_back(topPlate);

  // Calculate stud positions
  const double studHeight = params.height - params.bottomPlateHeight - params.topPlateHeight;
  const int numStuds = static_cast<int>(std::ceil(length / params.studSpacing)) + 1;

  for (int i = 0; i < numStuds; i++) {
    double studX = i * params.studSpacing;
    if (studX > length) studX = length - studWidth/2.0;

    // Create vertical stud
    manifold::Manifold stud = manifold::Manifold::Cube(
      {studWidth, studDepth, studHeight}, false
    );
    stud = stud.Translate({
      studX + studWidth/2.0,
      studDepth/2.0,
      params.bottomPlateHeight + studHeight/2.0
    });
    components.push_back(stud);
  }

  // Add sheathing if requested
  if (params.includeSheathing) {
    manifold::Manifold sheathing = manifold::Manifold::Cube(
      {length, params.sheathingThickness, params.height}, false
    );
    // Position sheathing on back side of studs
    sheathing = sheathing.Translate({
      length/2.0,
      studDepth + params.sheathingThickness/2.0,
      params.height/2.0
    });
    components.push_back(sheathing);
  }

  // Union all components
  manifold::Manifold frame = components[0];
  for (size_t i = 1; i < components.size(); i++) {
    frame = frame + components[i];
  }

  // Now rotate around origin to align with start->end direction
  frame = frame.Rotate(0.0, 0.0, angleDeg);

  // Translate to start position
  // The wall was built starting at origin along X-axis, so just translate to start
  frame = frame.Translate({params.start[0], params.start[1], 0.0});

  return frame;
}

manifold::Manifold CreateWall(const WallParams& params) {
  switch (params.constructionType) {
    case ConstructionType::STICK_FRAME:
      return CreateStickFrameWall(params);
    case ConstructionType::SOLID:
    default:
      return CreateSolidWall(params);
  }
}

}  // namespace primitives
}  // namespace dingcad
