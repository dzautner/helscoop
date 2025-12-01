#include "ifc_export.h"

#include <algorithm>
#include <chrono>
#include <ctime>
#include <fstream>
#include <random>
#include <sstream>

namespace dingcad {

IfcEntityType CategoryToIfcType(const std::string& category) {
  if (category == "lumber" || category == "sheathing") return IfcEntityType::Wall;
  if (category == "roofing") return IfcEntityType::Slab;
  if (category == "masonry") return IfcEntityType::BuildingElementProxy;
  if (category == "insulation") return IfcEntityType::BuildingElementProxy;
  return IfcEntityType::BuildingElementProxy;
}

std::string GenerateIfcGuid() {
  // IFC uses base64-encoded 128-bit GUIDs (22 characters)
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_int_distribution<uint64_t> dist;

  const char* chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  std::string guid;
  for (int i = 0; i < 22; ++i) {
    guid += chars[dist(gen) % 64];
  }
  return guid;
}

bool ExportToIFC(
    const SceneData& sceneData,
    const std::vector<MaterialItem>& materials,
    const MaterialLibrary& library,
    const std::filesystem::path& outputPath,
    std::string& errorMsg) {

  std::ofstream file(outputPath);
  if (!file.is_open()) {
    errorMsg = "Failed to open file: " + outputPath.string();
    return false;
  }

  // Get current timestamp
  auto now = std::chrono::system_clock::now();
  auto time = std::chrono::system_clock::to_time_t(now);
  std::tm* tm = std::localtime(&time);
  char timestamp[64];
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%S", tm);

  // IFC HEADER
  file << "ISO-10303-21;\n";
  file << "HEADER;\n";
  file << "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\n";
  file << "FILE_NAME('" << outputPath.filename().string() << "','" << timestamp << "',";
  file << "('DingCAD'),(''),''," << "'DingCAD','');\n";
  file << "FILE_SCHEMA(('IFC4'));\n";
  file << "ENDSEC;\n";
  file << "DATA;\n";

  int entityId = 1;

  // #1 = Organization
  file << "#" << entityId++ << " = IFCORGANIZATION($,'DingCAD',$,$,$);\n";
  // #2 = Person
  file << "#" << entityId++ << " = IFCPERSON($,$,$,$,$,$,$,$);\n";
  // #3 = PersonAndOrganization
  file << "#" << entityId++ << " = IFCPERSONANDORGANIZATION(#2,#1,$);\n";
  // #4 = Application
  file << "#" << entityId++ << " = IFCAPPLICATION(#1,'1.0','DingCAD','DingCAD');\n";
  // #5 = OwnerHistory
  file << "#" << entityId++ << " = IFCOWNERHISTORY(#3,#4,$,.NOCHANGE.,$,$,$," << time << ");\n";

  int ownerHistoryId = entityId - 1;

  // Geometric context
  // #6 = Direction (Z up)
  file << "#" << entityId++ << " = IFCDIRECTION((0.,0.,1.));\n";
  int zAxisId = entityId - 1;
  // #7 = Direction (X)
  file << "#" << entityId++ << " = IFCDIRECTION((1.,0.,0.));\n";
  int xAxisId = entityId - 1;
  // #8 = CartesianPoint (origin)
  file << "#" << entityId++ << " = IFCCARTESIANPOINT((0.,0.,0.));\n";
  int originId = entityId - 1;
  // #9 = Axis2Placement3D
  file << "#" << entityId++ << " = IFCAXIS2PLACEMENT3D(#" << originId << ",#" << zAxisId << ",#" << xAxisId << ");\n";
  int placementId = entityId - 1;
  // #10 = GeometricRepresentationContext
  file << "#" << entityId++ << " = IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#" << placementId << ",$);\n";
  int contextId = entityId - 1;

  // Project
  file << "#" << entityId++ << " = IFCPROJECT('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
  file << ",'DingCAD Export',$,$,$,$,(#" << contextId << "),$);\n";
  int projectId = entityId - 1;

  // Site
  file << "#" << entityId++ << " = IFCSITE('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
  file << ",'Site',$,$,#" << placementId << ",$,$,.ELEMENT.,$,$,$,$,$);\n";
  int siteId = entityId - 1;

  // Building
  file << "#" << entityId++ << " = IFCBUILDING('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
  file << ",'Building',$,$,#" << placementId << ",$,$,.ELEMENT.,$,$,$);\n";
  int buildingId = entityId - 1;

  // Building Storey (ground floor)
  file << "#" << entityId++ << " = IFCBUILDINGSTOREY('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
  file << ",'Ground Floor',$,$,#" << placementId << ",$,$,.ELEMENT.,0.);\n";
  int storeyId = entityId - 1;

  // Spatial hierarchy: Project -> Site -> Building -> Storey
  file << "#" << entityId++ << " = IFCRELAGGREGATES('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
  file << ",$,$,#" << projectId << ",(#" << siteId << "));\n";
  file << "#" << entityId++ << " = IFCRELAGGREGATES('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
  file << ",$,$,#" << siteId << ",(#" << buildingId << "));\n";
  file << "#" << entityId++ << " = IFCRELAGGREGATES('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
  file << ",$,$,#" << buildingId << ",(#" << storeyId << "));\n";

  // Export each object as building element
  std::vector<int> elementIds;

  for (size_t i = 0; i < sceneData.objects.size(); ++i) {
    const auto& obj = sceneData.objects[i];
    if (!obj.geometry) continue;

    // Get material info
    const PBRMaterial* mat = nullptr;
    if (!obj.materialId.empty()) {
      mat = library.get(obj.materialId);
    }

    std::string name = mat ? mat->name : ("Element_" + std::to_string(i));
    std::string category = mat ? mat->category : "unknown";
    IfcEntityType ifcType = CategoryToIfcType(category);

    // Get bounding box from geometry using Manifold's built-in method
    manifold::Box box = obj.geometry->BoundingBox();
    if (box.IsFinite() == false) continue;

    float minX = static_cast<float>(box.min.x);
    float minY = static_cast<float>(box.min.y);
    float minZ = static_cast<float>(box.min.z);
    float maxX = static_cast<float>(box.max.x);
    float maxY = static_cast<float>(box.max.y);
    float maxZ = static_cast<float>(box.max.z);

    // Convert from scene scale to real-world meters
    float sizeX = (maxX - minX) / kSceneScale;
    float sizeY = (maxY - minY) / kSceneScale;
    float sizeZ = (maxZ - minZ) / kSceneScale;
    float centerX = (minX + maxX) / 2.0f / kSceneScale;
    float centerY = (minY + maxY) / 2.0f / kSceneScale;
    float centerZ = (minZ + maxZ) / 2.0f / kSceneScale;

    // Create bounding box representation
    // Note: IFC uses X, Y (horizontal), Z (vertical)
    // Our scene uses X, Z (horizontal), Y (vertical), so we swap Y/Z
    file << "#" << entityId++ << " = IFCCARTESIANPOINT((" << centerX << "," << centerZ << "," << centerY << "));\n";
    int boxCenterId = entityId - 1;

    // Local placement
    file << "#" << entityId++ << " = IFCAXIS2PLACEMENT3D(#" << boxCenterId << ",$,$);\n";
    int localPlacementAxisId = entityId - 1;
    file << "#" << entityId++ << " = IFCLOCALPLACEMENT(#" << placementId << ",#" << localPlacementAxisId << ");\n";
    int localPlacementId = entityId - 1;

    // Bounding box (swap Y/Z for IFC coordinate system)
    file << "#" << entityId++ << " = IFCBOUNDINGBOX(#" << originId << "," << sizeX << "," << sizeZ << "," << sizeY << ");\n";
    int bboxId = entityId - 1;

    // Shape representation
    file << "#" << entityId++ << " = IFCSHAPEREPRESENTATION(#" << contextId << ",'Box','BoundingBox',(#" << bboxId << "));\n";
    int shapeRepId = entityId - 1;
    file << "#" << entityId++ << " = IFCPRODUCTDEFINITIONSHAPE($,$,(#" << shapeRepId << "));\n";
    int productShapeId = entityId - 1;

    // Building element based on type
    const char* ifcTypeName;
    switch (ifcType) {
      case IfcEntityType::Wall: ifcTypeName = "IFCWALL"; break;
      case IfcEntityType::Slab: ifcTypeName = "IFCSLAB"; break;
      case IfcEntityType::Column: ifcTypeName = "IFCCOLUMN"; break;
      case IfcEntityType::Beam: ifcTypeName = "IFCBEAM"; break;
      default: ifcTypeName = "IFCBUILDINGELEMENTPROXY"; break;
    }

    file << "#" << entityId++ << " = " << ifcTypeName << "('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
    file << ",'" << name << "',$,$,#" << localPlacementId << ",#" << productShapeId << ",$";
    if (ifcType == IfcEntityType::Slab) {
      file << ",.FLOOR.";  // Slab predefined type
    }
    file << ");\n";

    elementIds.push_back(entityId - 1);
  }

  // Relate elements to storey
  if (!elementIds.empty()) {
    file << "#" << entityId++ << " = IFCRELCONTAINEDINSPATIALSTRUCTURE('" << GenerateIfcGuid() << "',#" << ownerHistoryId;
    file << ",$,$,(";
    for (size_t i = 0; i < elementIds.size(); ++i) {
      if (i > 0) file << ",";
      file << "#" << elementIds[i];
    }
    file << "),#" << storeyId << ");\n";
  }

  file << "ENDSEC;\n";
  file << "END-ISO-10303-21;\n";

  file.close();
  return true;
}

}  // namespace dingcad
