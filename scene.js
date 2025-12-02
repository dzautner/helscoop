// scene.js - Entry point for DingCAD viewer
// Re-exports the Helscoop (Nordic Chicken Coop) project

import {
  scene,
  materials,
  displayScale,
  heatingInfo
} from './examples/helscoop/main.js';

// Define assembly directly to avoid module TDZ issues
const buildInstructions = {
  projectName: "HELSCOOP - Nordic Chicken Coop",
  steps: [
    {
      title: "1. Site Preparation & Foundation",
      description: "Prepare a level building site and install concrete paver foundation. The pavers support pressure-treated wooden skids that distribute the coop's weight.",
      showMaterials: ["concrete_block", "pressure_treated_148x148"],
      timeMinutes: 120,
      subSteps: [
        { instruction: "Mark out a 4m x 4m area for the coop footprint using stakes and string", timeMinutes: 15 },
        { instruction: "Clear all vegetation, roots, and debris from the marked area", timeMinutes: 20 },
        { instruction: "Excavate 100mm deep holes at each paver location (8 total in grid pattern)", timeMinutes: 25, tip: "Space pavers max 1200mm apart for proper support" },
        { instruction: "Pour 50mm of builder's sand into each excavation and compact firmly", timeMinutes: 15 },
        { instruction: "Place concrete pavers on sand, checking level in both X and Y directions", timeMinutes: 20, tip: "Use a long spirit level across multiple pavers" },
        { instruction: "Position pressure-treated 148x148mm skids across the pavers", timeMinutes: 10 },
        { instruction: "Verify skids are level and parallel - shim with sand if needed", timeMinutes: 15 }
      ],
      parts: [
        { name: "Concrete Paver 400x400x50mm", materialId: "concrete_block", quantity: "8" },
        { name: "Pressure Treated Skid 148x148mm", materialId: "pressure_treated_148x148", quantity: "3", note: "Cut to 3201mm length" },
        { name: "Builder's Sand", materialId: "builders_sand", quantity: "2", note: "For leveling bed" },
        { name: "String Line & Stakes", quantity: "1 set", note: "For layout" },
        { name: "Spirit Level 1200mm", quantity: "1" }
      ]
    },
    {
      title: "2. Floor Frame Construction",
      description: "Build the floor frame using joist hangers for secure connections. The frame sits on the foundation skids and provides a solid base for the floor sheathing.",
      showMaterials: ["concrete_block", "pressure_treated_148x148", "osb_18mm", "joist_hanger"],
      timeMinutes: 180,
      subSteps: [
        { instruction: "Cut two rim joists to 3201mm length from 48x148 C24 lumber", timeMinutes: 10 },
        { instruction: "Cut floor joists to 3000mm length (you'll need 9 joists)", timeMinutes: 25 },
        { instruction: "Mark joist positions on rim joists at 400mm centers starting from one end", timeMinutes: 10 },
        { instruction: "Attach joist hangers at each marked position using 4x40mm screws", timeMinutes: 30, tip: "Pre-drill to prevent splitting near edges" },
        { instruction: "Position rim joists on the skids, check for square by measuring diagonals", timeMinutes: 15, tip: "Diagonals should be equal - adjust until square" },
        { instruction: "Drop floor joists into hangers and secure with joist hanger nails", timeMinutes: 25 },
        { instruction: "Cut OSB panels to fit, leaving 3mm expansion gaps between sheets", timeMinutes: 20 },
        { instruction: "Install OSB subfloor, staggering panel joints for structural rigidity", timeMinutes: 25, tip: "Crown side up, screw at 150mm spacing on edges" }
      ],
      parts: [
        { name: "48x148 Floor Joist C24", materialId: "pine_48x148_c24", quantity: "9", note: "Cut to 3000mm" },
        { name: "48x148 Rim Joist C24", materialId: "pine_48x148_c24", quantity: "2", note: "Cut to 3201mm" },
        { name: "Joist Hanger 48mm", materialId: "joist_hanger", quantity: "18" },
        { name: "OSB 18mm Panel", materialId: "osb_18mm", quantity: "4", note: "2440x1220mm" },
        { name: "Structural Screws 5x70mm", quantity: "100" },
        { name: "Flooring Screws 4x50mm", quantity: "200" }
      ]
    },
    {
      title: "3. Cut Wall Lumber",
      description: "Cut all studs and plates to length. Work on sawhorses with a circular saw and speed square. Use a stop block for consistent stud lengths.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "lumber_pile"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Set up sawhorses and cutting station with stop blocks", timeMinutes: 10 },
        { instruction: "Cut 36 studs to 2071mm (wall height minus two 48mm plates)", timeMinutes: 25, tip: "Use stop block clamped to saw guide for identical cuts" },
        { instruction: "Cut 4 bottom plates: 2x 3201mm (front/back) + 2x 2904mm (sides)", timeMinutes: 8 },
        { instruction: "Cut 8 top plates (same lengths - you need two layers)", timeMinutes: 8 },
        { instruction: "Cut door header pieces: 2x 1096mm for door span", timeMinutes: 5 },
        { instruction: "Mark stud positions on ALL plates at 400mm centers", timeMinutes: 4, tip: "Use combination square for accurate marks on both sides" }
      ],
      parts: [
        { name: "48x98 Wall Stud C24", materialId: "pine_48x98_c24", quantity: "36", note: "Cut to 2071mm" },
        { name: "48x98 Plate Stock", materialId: "pine_48x98_c24", quantity: "12", note: "Cut to length" },
        { name: "Circular Saw", quantity: "1" },
        { name: "Speed Square", quantity: "1" },
        { name: "Pencil", quantity: "2" }
      ]
    },
    {
      title: "4. Lay Out Bottom Plate",
      description: "Position the bottom plate flat on the floor deck. This is where you'll mark stud positions and begin wall assembly.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_bottom_plate"],
      timeMinutes: 10,
      subSteps: [
        { instruction: "Select a straight, unwarped 48x98 plate for the bottom", timeMinutes: 2 },
        { instruction: "Lay the plate flat on the deck surface in front of the building footprint", timeMinutes: 2 },
        { instruction: "Mark stud positions at 400mm centers starting from one end", timeMinutes: 4, tip: "Use a combination square for accurate perpendicular marks" },
        { instruction: "Mark 'X' on the side where each stud will stand", timeMinutes: 2 }
      ],
      parts: [
        { name: "48x98 Bottom Plate", materialId: "pine_48x98_c24", quantity: "1", note: "3201mm for front wall" },
        { name: "Tape Measure", quantity: "1" },
        { name: "Pencil", quantity: "1" },
        { name: "Combination Square", quantity: "1" }
      ]
    },
    {
      title: "5. Position Top Plate Parallel",
      description: "Lay the top plate parallel to the bottom plate, spaced exactly stud-height apart. This creates your wall frame layout.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_bottom_plate", "front_top_plate"],
      timeMinutes: 8,
      subSteps: [
        { instruction: "Measure the stud length (2071mm) from bottom plate edge", timeMinutes: 2 },
        { instruction: "Position top plate parallel to bottom plate at measured distance", timeMinutes: 3 },
        { instruction: "Transfer stud marks from bottom plate to top plate", timeMinutes: 3, tip: "Use a chalk line or long straight edge" }
      ],
      parts: [
        { name: "48x98 Top Plate", materialId: "pine_48x98_c24", quantity: "1", note: "3201mm for front wall" },
        { name: "Tape Measure", quantity: "1" }
      ]
    },
    {
      title: "6. Place Studs Between Plates",
      description: "Position each cut stud between the marked locations on the bottom and top plates. Keep everything flat on the deck surface.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_bottom_plate", "front_top_plate", "front_studs_flat"],
      timeMinutes: 15,
      subSteps: [
        { instruction: "Carry studs from lumber pile to assembly area", timeMinutes: 3 },
        { instruction: "Place each stud flat, aligning ends with the 'X' marks on plates", timeMinutes: 8, tip: "Crown side up - check each stud for bow direction" },
        { instruction: "Leave gap at door opening location (skip 3 stud positions)", timeMinutes: 2 },
        { instruction: "Check all studs are square to plates", timeMinutes: 2 }
      ],
      parts: [
        { name: "48x98 Studs", materialId: "pine_48x98_c24", quantity: "7", note: "Regular studs for front wall" }
      ]
    },
    {
      title: "7. Frame Door Opening",
      description: "Install the door framing: king studs (full height) on each side, jack studs (trimmer) to support header, and the header beam across top.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_bottom_plate", "front_top_plate", "front_studs_flat", "front_door_framing"],
      timeMinutes: 20,
      subSteps: [
        { instruction: "Position king studs at door rough opening edges (full height)", timeMinutes: 3 },
        { instruction: "Cut jack studs to door height minus plate thickness (1652mm)", timeMinutes: 4, tip: "Jack studs support the header weight" },
        { instruction: "Position jack studs inside king studs, bottoms aligned", timeMinutes: 3 },
        { instruction: "Build header: nail two 48x98s together with 12mm plywood spacer", timeMinutes: 5 },
        { instruction: "Rest header on top of jack studs, between king studs", timeMinutes: 3 },
        { instruction: "Add cripple studs from header to top plate", timeMinutes: 2 }
      ],
      parts: [
        { name: "48x98 King Studs", materialId: "pine_48x98_c24", quantity: "2", note: "Full height 2071mm" },
        { name: "48x98 Jack Studs", materialId: "pine_48x98_c24", quantity: "2", note: "Cut to 1652mm" },
        { name: "48x98 Header Stock", materialId: "pine_48x98_c24", quantity: "2", note: "1096mm each" },
        { name: "12mm Plywood Spacer", quantity: "1", note: "For header sandwich" }
      ]
    },
    {
      title: "8. Nail Wall Frame Together",
      description: "With all pieces positioned correctly, nail through the plates into each stud end. Work systematically from one end to the other.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall_flat"],
      timeMinutes: 25,
      subSteps: [
        { instruction: "Start at one end, drive 2 nails through bottom plate into first stud", timeMinutes: 1 },
        { instruction: "Continue along bottom plate, 2 nails per stud", timeMinutes: 8, tip: "Angle nails slightly for better grip" },
        { instruction: "Repeat for top plate connections", timeMinutes: 8 },
        { instruction: "Nail jack studs to king studs (3 nails each)", timeMinutes: 3 },
        { instruction: "Nail header to jack studs and king studs", timeMinutes: 3 },
        { instruction: "Measure diagonals - adjust until equal (frame is square)", timeMinutes: 2 }
      ],
      parts: [
        { name: "90mm Framing Nails", quantity: "1 kg" },
        { name: "Framing Hammer", quantity: "1" },
        { name: "Tape Measure", quantity: "1" }
      ]
    },
    {
      title: "9. Raise Front Wall",
      description: "With a helper, tip the front wall up onto the floor deck. Nail through bottom plate into floor joists. Add temporary bracing.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall"],
      timeMinutes: 20,
      subSteps: [
        { instruction: "Snap chalk line on deck where bottom plate will sit", timeMinutes: 2 },
        { instruction: "With helper, walk wall up from flat position", timeMinutes: 3, tip: "Lift from top plate end while helper holds bottom" },
        { instruction: "Align bottom plate with chalk line", timeMinutes: 2 },
        { instruction: "Nail bottom plate to floor deck (into joists below)", timeMinutes: 5 },
        { instruction: "Check wall is plumb with 4ft level", timeMinutes: 2 },
        { instruction: "Install 2x4 diagonal braces from wall to floor - 2 braces min", timeMinutes: 6, tip: "Angle braces ~45° for best support" }
      ],
      parts: [
        { name: "Temporary 2x4 Braces", quantity: "2", note: "Reusable" },
        { name: "16d Nails", quantity: "20" },
        { name: "4ft Level", quantity: "1" },
        { name: "Chalk Line", quantity: "1" }
      ]
    },
    {
      title: "10. Build & Raise Back Wall",
      description: "Assemble the back wall flat, then raise it parallel to the front wall. This wall has a vent opening but no door.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall"],
      timeMinutes: 40,
      subSteps: [
        { instruction: "Lay out back wall plates and studs on deck", timeMinutes: 3 },
        { instruction: "Nail studs to plates as before", timeMinutes: 12 },
        { instruction: "Frame vent opening with header and cripple studs", timeMinutes: 8 },
        { instruction: "Check square with diagonal measurement", timeMinutes: 2 },
        { instruction: "Walk wall up with helper", timeMinutes: 3 },
        { instruction: "Nail bottom plate to floor joists", timeMinutes: 5 },
        { instruction: "Check plumb and install diagonal braces", timeMinutes: 7 }
      ],
      parts: [
        { name: "48x98 Studs (back wall)", materialId: "pine_48x98_c24", quantity: "9" },
        { name: "48x98 Plates (back)", materialId: "pine_48x98_c24", quantity: "2", note: "3201mm" },
        { name: "Temporary Braces", quantity: "2" }
      ]
    },
    {
      title: "11. Build & Raise Side Walls",
      description: "Build both side walls (shorter span). Raise them and nail into corner studs of front/back walls to tie structure together.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Assemble left side wall on deck (shorter - fits between front/back)", timeMinutes: 10 },
        { instruction: "Check square, walk up, nail bottom plate", timeMinutes: 8 },
        { instruction: "Nail corner studs into front and back wall end studs", timeMinutes: 5, tip: "Use 3 nails per corner connection" },
        { instruction: "Repeat for right side wall", timeMinutes: 18 },
        { instruction: "Check all corners are plumb and square", timeMinutes: 5 },
        { instruction: "Adjust bracing as needed", timeMinutes: 4 }
      ],
      parts: [
        { name: "48x98 Studs (side walls)", materialId: "pine_48x98_c24", quantity: "16" },
        { name: "48x98 Plates (sides)", materialId: "pine_48x98_c24", quantity: "4", note: "2904mm" },
        { name: "Framing Nails 90mm", quantity: "0.5 kg" }
      ]
    },
    {
      title: "12. Install Double Top Plate",
      description: "The double top plate (cap plate) ties all four walls together at corners. It overlaps the joints below for structural integrity.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall"],
      timeMinutes: 30,
      subSteps: [
        { instruction: "Cut second layer of top plates to same lengths as first", timeMinutes: 5 },
        { instruction: "Position plates so joints OVERLAP the corners below", timeMinutes: 3, tip: "Front/back plates run long, side plates butt into them" },
        { instruction: "Nail through double plate into single plate below - 16d nails at 400mm", timeMinutes: 12 },
        { instruction: "At each corner, add 2 extra nails through overlapping plates", timeMinutes: 5 },
        { instruction: "Remove all temporary diagonal braces - walls are now rigid", timeMinutes: 5 }
      ],
      parts: [
        { name: "48x98 Top Plates (2nd layer)", materialId: "pine_48x98_c24", quantity: "4" },
        { name: "16d Nails", quantity: "50" }
      ]
    },
    {
      title: "13. Roof Framing",
      description: "Install the ridge board and rafters to create the pitched roof structure. The 28-degree pitch sheds snow effectively in Nordic climates.",
      showMaterials: ["concrete_block", "pressure_treated_148x148", "osb_18mm", "pine_48x98_c24", "galvanized_roofing"],
      timeMinutes: 200,
      subSteps: [
        { instruction: "Cut rafters with 28-degree angle at ridge and birdsmouth at wall plate", timeMinutes: 40, tip: "Make a template rafter first and test fit" },
        { instruction: "Set up temporary posts to support ridge board at correct height", timeMinutes: 15 },
        { instruction: "Install ridge board (3201mm length) on temporary supports", timeMinutes: 10 },
        { instruction: "Install first pair of rafters at one end, checking for plumb", timeMinutes: 15 },
        { instruction: "Work along ridge, installing rafter pairs at 600mm spacing", timeMinutes: 45, tip: "Use hurricane clips at wall plate connection" },
        { instruction: "Install collar ties at every third rafter pair for rigidity", timeMinutes: 20 },
        { instruction: "Cut and install roof sheathing panels, starting from eaves", timeMinutes: 35, tip: "Leave 3mm gaps for expansion" },
        { instruction: "Install drip edge along all roof edges", timeMinutes: 20 }
      ],
      parts: [
        { name: "48x98 Rafter C24", materialId: "pine_48x98_c24", quantity: "18", note: "Cut at 28 deg" },
        { name: "48x98 Ridge Board", materialId: "pine_48x98_c24", quantity: "1", note: "3201mm" },
        { name: "48x148 Collar Tie", materialId: "pine_48x148_c24", quantity: "5" },
        { name: "12mm Roof Sheathing", materialId: "galvanized_roofing", quantity: "4", note: "2440x1220mm" },
        { name: "Hurricane Clips", quantity: "18" },
        { name: "Roofing Nails 40mm", quantity: "1 kg" }
      ]
    },
    {
      title: "14. Roofing Installation",
      description: "Apply waterproof roofing layers to protect the structure. The metal roofing is durable and low-maintenance.",
      showMaterials: ["concrete_block", "pressure_treated_148x148", "osb_18mm", "pine_48x98_c24", "galvanized_roofing"],
      timeMinutes: 150,
      subSteps: [
        { instruction: "Roll out roofing felt horizontally, starting at eaves, overlapping 100mm", timeMinutes: 25 },
        { instruction: "Secure felt with roofing tacks, keeping it taut and smooth", timeMinutes: 20 },
        { instruction: "Install metal roofing panels from bottom up, overlapping by one rib", timeMinutes: 45, tip: "Use color-matched screws with rubber washers" },
        { instruction: "Install ridge cap along the peak, sealing with roofing sealant", timeMinutes: 20 },
        { instruction: "Apply sealant around all penetrations and edges", timeMinutes: 15 },
        { instruction: "Check all fasteners are tight and properly sealed", timeMinutes: 10 }
      ],
      parts: [
        { name: "Roofing Felt 15sqm roll", materialId: "galvanized_roofing", quantity: "2" },
        { name: "Ridge Cap 2m", materialId: "galvanized_roofing", quantity: "2" },
        { name: "Drip Edge 2m", quantity: "10" },
        { name: "Roofing Screws w/ Washer", quantity: "100" },
        { name: "Roofing Sealant", quantity: "1 tube" }
      ]
    },
    {
      title: "15. Insulation",
      description: "Install mineral wool insulation in walls, roof, and floor for thermal performance. Critical for maintaining warmth in Nordic winter.",
      showMaterials: ["concrete_block", "pressure_treated_148x148", "osb_18mm", "pine_48x98_c24", "galvanized_roofing", "insulation_100mm"],
      timeMinutes: 180,
      subSteps: [
        { instruction: "Measure and cut mineral wool batts to fit between studs (565mm wide)", timeMinutes: 20 },
        { instruction: "Press wall insulation into stud cavities - friction fit, no gaps", timeMinutes: 45, tip: "Wear gloves and dust mask when handling" },
        { instruction: "Install ceiling insulation between rafters from inside", timeMinutes: 40 },
        { instruction: "Install floor insulation between joists from below", timeMinutes: 30 },
        { instruction: "Apply vapor barrier on warm side of insulation (interior)", timeMinutes: 25 },
        { instruction: "Seal all vapor barrier seams with acoustic sealant", timeMinutes: 15, tip: "Pay extra attention around electrical boxes" }
      ],
      parts: [
        { name: "Mineral Wool 100mm", materialId: "insulation_100mm", quantity: "28 sqm", note: "565mm wide batts" },
        { name: "Vapor Barrier PE-foil", quantity: "1 roll", note: "50 sqm" },
        { name: "Acoustic Sealant", quantity: "2 tubes" },
        { name: "Staples 10mm", quantity: "1 box" }
      ]
    },
    {
      title: "16. Exterior Cladding",
      description: "Install exterior panels and trim to weatherproof the structure. Work from bottom up to ensure proper water shedding.",
      showMaterials: ["concrete_block", "pressure_treated_148x148", "osb_18mm", "pine_48x98_c24", "galvanized_roofing", "insulation_100mm", "exterior_board_yellow", "exterior_paint_white"],
      timeMinutes: 240,
      subSteps: [
        { instruction: "Install horizontal furring strips over vapor barrier for ventilation gap", timeMinutes: 30 },
        { instruction: "Start cladding from bottom, leaving 20mm gap above ground", timeMinutes: 15 },
        { instruction: "Work upward, overlapping panels or using shiplap joints", timeMinutes: 60, tip: "Pre-drill near edges to prevent splitting" },
        { instruction: "Install corner trim boards to cover panel edges", timeMinutes: 30 },
        { instruction: "Install window and door trim with drip edge at top", timeMinutes: 25 },
        { instruction: "Fill any gaps or nail holes with exterior wood filler", timeMinutes: 15 },
        { instruction: "Sand smooth when dry and inspect for missed areas", timeMinutes: 15 }
      ],
      parts: [
        { name: "Exterior Panel 21mm", materialId: "exterior_board_yellow", quantity: "12", note: "2440x1220mm" },
        { name: "Corner Trim 45x45mm", materialId: "exterior_paint_white", quantity: "8", note: "Cut to wall height" },
        { name: "Window/Door Trim 20x95mm", quantity: "8m" },
        { name: "Stainless Screws 4x40mm", quantity: "500" },
        { name: "Exterior Wood Filler", quantity: "1 tub" }
      ]
    },
    {
      title: "17. Door Installation",
      description: "Hang the access door with predator-proof hardware. Weather stripping is essential for thermal performance.",
      showMaterials: ["concrete_block", "pressure_treated_148x148", "osb_18mm", "pine_48x98_c24", "galvanized_roofing", "insulation_100mm", "exterior_board_yellow", "exterior_paint_white", "door_thermal_bridge"],
      timeMinutes: 90,
      subSteps: [
        { instruction: "Check door opening is square and sized correctly (allow 3mm clearance)", timeMinutes: 10 },
        { instruction: "Install door frame with shims to ensure plumb and level", timeMinutes: 20 },
        { instruction: "Mount heavy-duty hinges to door frame first", timeMinutes: 15 },
        { instruction: "Hang door on hinges and check swing clearance", timeMinutes: 10 },
        { instruction: "Install predator-proof latches at top and bottom", timeMinutes: 15, tip: "Raccoons can open simple latches" },
        { instruction: "Apply weather stripping around door perimeter", timeMinutes: 10 },
        { instruction: "Install door sweep at bottom to seal gap", timeMinutes: 10 }
      ],
      parts: [
        { name: "Access Door 600x1800mm", materialId: "door_thermal_bridge", quantity: "1", note: "Insulated recommended" },
        { name: "Heavy Duty Hinges", quantity: "3 pairs" },
        { name: "Predator-Proof Latches", quantity: "2", note: "Top and bottom" },
        { name: "Weather Stripping 5m", quantity: "1" },
        { name: "Door Sweep", quantity: "1" }
      ]
    },
    {
      title: "18. Interior Fittings",
      description: "Install nesting boxes and roost poles. Position roosts higher than nests - chickens prefer to sleep at the highest point.",
      showMaterials: ["concrete_block", "pressure_treated_148x148", "osb_18mm", "pine_48x98_c24", "galvanized_roofing", "insulation_100mm", "exterior_board_yellow", "exterior_paint_white", "door_thermal_bridge", "nest_box_plywood"],
      timeMinutes: 120,
      subSteps: [
        { instruction: "Mount nest box support brackets at 400mm height on back wall", timeMinutes: 15 },
        { instruction: "Install nesting boxes with slight forward tilt for egg rolling", timeMinutes: 20, tip: "One box per 4 hens is sufficient" },
        { instruction: "Install droppings board support brackets below roost area", timeMinutes: 15 },
        { instruction: "Mount droppings board (makes cleaning much easier)", timeMinutes: 10 },
        { instruction: "Install roost pole brackets at graduated heights (lowest 600mm)", timeMinutes: 15 },
        { instruction: "Mount 50mm round roost poles - smooth to prevent foot injuries", timeMinutes: 20, tip: "40-50mm diameter is ideal for chicken feet" },
        { instruction: "Sand any rough edges and round corners for bird safety", timeMinutes: 15 }
      ],
      parts: [
        { name: "Nesting Box 300x300x300mm", materialId: "nest_box_plywood", quantity: "3" },
        { name: "Roost Pole 50mm diameter", materialId: "pine_48x98_c24", quantity: "3", note: "Full coop width" },
        { name: "Roost Brackets", quantity: "6" },
        { name: "Droppings Board 12mm Plywood", quantity: "1" },
        { name: "Screws 4x50mm", quantity: "50" },
        { name: "Nest Box Bedding (straw)", quantity: "1 bale" }
      ]
    },
    {
      title: "19. Ventilation & Finishing",
      description: "Install ventilation and apply protective paint finish. Good ventilation prevents moisture buildup which causes respiratory issues in chickens.",
      showMaterials: ["concrete_block", "pressure_treated_148x148", "osb_18mm", "pine_48x98_c24", "galvanized_roofing", "insulation_100mm", "exterior_board_yellow", "exterior_paint_white", "door_thermal_bridge", "nest_box_plywood", "hardware_cloth"],
      timeMinutes: 240,
      subSteps: [
        { instruction: "Cut ventilation openings near ridge on gable ends", timeMinutes: 20 },
        { instruction: "Cover vent openings with hardware cloth to exclude predators", timeMinutes: 25, tip: "Use 12mm mesh - smaller than a rat's head" },
        { instruction: "Install soffit vents for cross-ventilation", timeMinutes: 20 },
        { instruction: "Apply wood primer to all exterior surfaces", timeMinutes: 40 },
        { instruction: "Allow primer to cure for 24 hours", timeMinutes: 5, tip: "Check weather forecast - need 2 dry days" },
        { instruction: "Apply first coat of exterior paint with brush and roller", timeMinutes: 50 },
        { instruction: "Allow 24 hours cure time between coats", timeMinutes: 5 },
        { instruction: "Apply second coat of paint for durability", timeMinutes: 50 },
        { instruction: "Final inspection and touch-up any missed spots", timeMinutes: 20 }
      ],
      parts: [
        { name: "Soffit Vent 150x300mm", quantity: "4" },
        { name: "Hardware Cloth 12mm mesh", materialId: "hardware_cloth", quantity: "0.5 sqm" },
        { name: "Exterior Paint", quantity: "10 L", note: "Tikkurila or similar" },
        { name: "Wood Primer", quantity: "5 L" },
        { name: "Paint Brush 100mm", quantity: "2" },
        { name: "Paint Roller + Tray", quantity: "1 set" }
      ]
    },
    {
      title: "20. Mark Run Layout",
      description: "Mark the outdoor run area attached to the coop. The run is 4m x 3m, providing ample outdoor space for 4-6 hens.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof"],
      timeMinutes: 30,
      subSteps: [
        { instruction: "Measure 4m out from tunnel exit along the X axis", timeMinutes: 5 },
        { instruction: "Mark corners with stakes: 4 corners at 4m x 3m rectangle", timeMinutes: 10 },
        { instruction: "Run string line between stakes to visualize run boundary", timeMinutes: 5 },
        { instruction: "Check corners are square using 3-4-5 triangle method", timeMinutes: 5, tip: "Measure 3m on one side, 4m on other - diagonal should be 5m" },
        { instruction: "Mark gate opening position - 900mm wide on front left", timeMinutes: 5 }
      ],
      parts: [
        { name: "Wooden Stakes", quantity: "6" },
        { name: "String Line 20m", quantity: "1" },
        { name: "Tape Measure 8m", quantity: "1" },
        { name: "Spray Paint", quantity: "1 can", note: "For marking ground" }
      ]
    },
    {
      title: "21. Dig Post Holes",
      description: "Dig holes for corner posts and gate post. In Nordic climate, posts must go below the frost line to prevent heaving.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof"],
      timeMinutes: 90,
      subSteps: [
        { instruction: "Dig first corner hole at back-left position - 600mm deep, 250mm diameter", timeMinutes: 15, tip: "Below 500mm frost line for Southern Finland" },
        { instruction: "Dig second corner hole at back-right position", timeMinutes: 15 },
        { instruction: "Dig third corner hole at front-right position", timeMinutes: 15 },
        { instruction: "Dig fourth corner hole at front-left position", timeMinutes: 15 },
        { instruction: "Dig gate post hole - 900mm from front-left corner", timeMinutes: 15 },
        { instruction: "Add 50mm gravel to bottom of each hole for drainage", timeMinutes: 10 },
        { instruction: "Check all holes are at consistent depth with level and straight edge", timeMinutes: 5 }
      ],
      parts: [
        { name: "Post Hole Digger", quantity: "1" },
        { name: "Gravel 20mm", quantity: "25 kg" },
        { name: "Wheelbarrow", quantity: "1", note: "For spoil removal" }
      ]
    },
    {
      title: "22. Set Corner Posts",
      description: "Install the four corner posts in concrete. These form the main structure of the run frame.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Cut 4 posts to 2.6m length (2m above ground + 0.6m buried)", timeMinutes: 15 },
        { instruction: "Set first post in back-left hole, check plumb on two faces", timeMinutes: 8 },
        { instruction: "Brace first post temporarily with diagonal stakes", timeMinutes: 3 },
        { instruction: "Repeat for remaining three corner posts", timeMinutes: 25, tip: "Use string line to ensure posts are aligned" },
        { instruction: "Re-check all posts are plumb and aligned before concrete", timeMinutes: 5 },
        { instruction: "Stakes remain until concrete cures", timeMinutes: 4 }
      ],
      parts: [
        { name: "Pressure Treated Post 98x98mm", materialId: "cedar_post_98x98", quantity: "4", note: "Cut to 2.6m" },
        { name: "Temporary Bracing Stakes", quantity: "8" },
        { name: "Post Level", quantity: "1" },
        { name: "Screws for Bracing", quantity: "16" }
      ]
    },
    {
      title: "23. Set Gate Post",
      description: "Install the gate post which creates the door frame. This post takes extra stress from gate operation.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post"],
      timeMinutes: 20,
      subSteps: [
        { instruction: "Cut gate post to same length as corner posts (2.6m)", timeMinutes: 5 },
        { instruction: "Set gate post in hole, 900mm from front-left corner", timeMinutes: 5 },
        { instruction: "Check post is plumb and aligned with corner posts", timeMinutes: 3 },
        { instruction: "Brace temporarily like corner posts", timeMinutes: 3 },
        { instruction: "Verify gate opening width is 900mm clear", timeMinutes: 4 }
      ],
      parts: [
        { name: "Pressure Treated Post 98x98mm", materialId: "cedar_post_98x98", quantity: "1", note: "Cut to 2.6m" },
        { name: "Temporary Bracing Stakes", quantity: "2" }
      ]
    },
    {
      title: "24. Concrete Posts",
      description: "Fill post holes with concrete and let cure. This is a critical step - posts must be solid before adding rails.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post"],
      timeMinutes: 45,
      subSteps: [
        { instruction: "Mix concrete to thick but pourable consistency", timeMinutes: 10, tip: "1:2:3 ratio cement:sand:gravel" },
        { instruction: "Fill first post hole, tamping to remove air pockets", timeMinutes: 5 },
        { instruction: "Re-check post is still plumb as concrete is added", timeMinutes: 2 },
        { instruction: "Repeat for all 5 posts", timeMinutes: 20 },
        { instruction: "Slope concrete surface away from post for water drainage", timeMinutes: 3 },
        { instruction: "Allow minimum 24 hours cure before removing braces", timeMinutes: 5, tip: "48 hours is better in cold weather" }
      ],
      parts: [
        { name: "Concrete Mix 25kg", quantity: "5", note: "One bag per post" },
        { name: "Mixing Tub", quantity: "1" },
        { name: "Water", quantity: "As needed" },
        { name: "Tamping Rod", quantity: "1" }
      ]
    },
    {
      title: "25. Install Top Rails",
      description: "Connect all posts at the top with horizontal rails. This creates the rigid frame structure.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Remove temporary bracing from posts", timeMinutes: 10 },
        { instruction: "Cut front rail to span between front-left and front-right posts", timeMinutes: 5 },
        { instruction: "Install front top rail with 2 lag bolts per post connection", timeMinutes: 10, tip: "Pre-drill to prevent splitting" },
        { instruction: "Cut and install back top rail same way", timeMinutes: 10 },
        { instruction: "Cut left side rail to fit between front and back posts", timeMinutes: 5 },
        { instruction: "Install left top rail", timeMinutes: 8 },
        { instruction: "Cut and install right top rail", timeMinutes: 8 },
        { instruction: "Check frame is square and level", timeMinutes: 4 }
      ],
      parts: [
        { name: "Rail 98x98 Treated", materialId: "cedar_post_98x98", quantity: "4", note: "Cut to fit" },
        { name: "Lag Bolts 10x100mm", quantity: "16" },
        { name: "Washers 10mm", quantity: "16" }
      ]
    },
    {
      title: "26. Install Gate Beam & Lower Rails",
      description: "Add the gate header beam and lower rails which will support the mesh and gate.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam"],
      timeMinutes: 45,
      subSteps: [
        { instruction: "Cut gate beam to span 900mm gate opening", timeMinutes: 5 },
        { instruction: "Install gate beam at top of gate opening between corner post and gate post", timeMinutes: 8 },
        { instruction: "Cut lower front rail - 100mm above ground level", timeMinutes: 5 },
        { instruction: "Install lower front rail", timeMinutes: 8 },
        { instruction: "Cut lower back rail to match", timeMinutes: 5 },
        { instruction: "Install lower back rail", timeMinutes: 8 },
        { instruction: "Check all rails are level and properly secured", timeMinutes: 6 }
      ],
      parts: [
        { name: "Gate Beam 98x98", materialId: "cedar_post_98x98", quantity: "1", note: "900mm" },
        { name: "Lower Rail 48x48", materialId: "cedar_post_98x98", quantity: "2", note: "Cut to length" },
        { name: "Lag Bolts 8x80mm", quantity: "8" }
      ]
    },
    {
      title: "27. Install Ridge Beam",
      description: "Install the ridge beam at the peak of the A-frame roof. This beam runs the full length of the run.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam"],
      timeMinutes: 40,
      subSteps: [
        { instruction: "Calculate ridge height: 2m post + 0.87m rise = 2.87m above ground", timeMinutes: 5 },
        { instruction: "Set up temporary support posts at each end", timeMinutes: 10 },
        { instruction: "Cut ridge beam to 4.05m (run length + 50mm overhang)", timeMinutes: 5 },
        { instruction: "Lift ridge beam onto temporary supports with helper", timeMinutes: 8 },
        { instruction: "Check ridge is level and centered over run width", timeMinutes: 4 },
        { instruction: "Secure ridge temporarily - rafters will lock it in place", timeMinutes: 8 }
      ],
      parts: [
        { name: "Ridge Beam 48x48", materialId: "cedar_post_98x98", quantity: "1", note: "4.05m length" },
        { name: "Temporary Support Posts", quantity: "2" },
        { name: "Temporary Clamps", quantity: "4" }
      ]
    },
    {
      title: "28. Install Roof Rafters",
      description: "Install the A-frame rafters at 1m spacing. These support the mesh roof and shed rain/snow.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters"],
      timeMinutes: 90,
      subSteps: [
        { instruction: "Calculate rafter length: 1.5m side / cos(30°) = ~1.73m", timeMinutes: 5 },
        { instruction: "Cut first rafter pair with 30° angle at top (ridge) end", timeMinutes: 8, tip: "Mark template on first rafter" },
        { instruction: "Install first rafter pair at one end - left rafter meets ridge, right mirrors it", timeMinutes: 10 },
        { instruction: "Cut remaining 4 rafter pairs using template", timeMinutes: 20 },
        { instruction: "Install rafter pairs at 1m spacing along ridge", timeMinutes: 35, tip: "Total 5 pairs = 10 rafters" },
        { instruction: "Secure each rafter to ridge with screws", timeMinutes: 8 },
        { instruction: "Remove temporary ridge supports", timeMinutes: 4 }
      ],
      parts: [
        { name: "Rafters 48x48", materialId: "cedar_post_98x98", quantity: "10", note: "Cut to ~1.73m with 30° angle" },
        { name: "Structural Screws 6x80mm", quantity: "30" },
        { name: "Speed Square", quantity: "1" }
      ]
    },
    {
      title: "29. Build & Hang Gate",
      description: "Build the access gate frame and hang it on the gate opening. The gate must be predator-proof.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters", "run_gate"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Measure gate opening exactly - should be 900mm wide x 2m tall", timeMinutes: 5 },
        { instruction: "Cut gate frame pieces: 2 uprights at 1950mm, 2 horizontals at 850mm", timeMinutes: 10 },
        { instruction: "Assemble rectangular frame with half-lap joints at corners", timeMinutes: 15 },
        { instruction: "Add diagonal brace from bottom-hinge corner to top-latch corner", timeMinutes: 8, tip: "Prevents gate sag" },
        { instruction: "Mount 3 heavy-duty hinges to gate frame", timeMinutes: 8 },
        { instruction: "Hang gate in opening, leaving 10mm clearance at bottom", timeMinutes: 8 },
        { instruction: "Install predator-proof latch at top and bottom", timeMinutes: 6, tip: "Raccoons can open simple latches" }
      ],
      parts: [
        { name: "Gate Frame 48x98", materialId: "cedar_post_98x98", quantity: "4", note: "Cut to size" },
        { name: "Diagonal Brace 48x48", quantity: "1" },
        { name: "Heavy-Duty Hinges", quantity: "3" },
        { name: "Predator-Proof Latches", quantity: "2", note: "Top and bottom" },
        { name: "Exterior Screws 5x50mm", quantity: "24" }
      ]
    },
    {
      title: "30. Install Side & Back Mesh",
      description: "Cover the sides and back of the run with hardware cloth. Start from bottom and work up.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters", "run_gate"],
      timeMinutes: 90,
      subSteps: [
        { instruction: "Unroll hardware cloth and cut panel for back wall - 4m x 2m", timeMinutes: 10 },
        { instruction: "Attach back panel starting at bottom rail with galvanized staples", timeMinutes: 20, tip: "Staple every 100mm" },
        { instruction: "Cut panel for right side wall - 3m x 2m", timeMinutes: 8 },
        { instruction: "Attach right side panel, overlapping corner by 50mm", timeMinutes: 15 },
        { instruction: "Cut panel for left side wall", timeMinutes: 8 },
        { instruction: "Attach left side panel", timeMinutes: 15 },
        { instruction: "Secure all edges with battens and washered screws", timeMinutes: 14, tip: "No gaps larger than 12mm" }
      ],
      parts: [
        { name: "Hardware Cloth 12mm 1m wide roll", materialId: "hardware_cloth", quantity: "18 jm", note: "For 3 sides" },
        { name: "Galvanized Staples 10mm", quantity: "0.5 kg" },
        { name: "Timber Battens 20x40mm", quantity: "12 jm" },
        { name: "Washered Screws 4x25mm", quantity: "100" }
      ]
    },
    {
      title: "31. Install Front Mesh & Gate Mesh",
      description: "Complete the front wall mesh and cover the gate frame with hardware cloth.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters", "run_gate"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Cut panel for front wall section beside gate", timeMinutes: 8 },
        { instruction: "Attach front panel from gate post to far corner", timeMinutes: 15 },
        { instruction: "Cut panel for above gate opening", timeMinutes: 5 },
        { instruction: "Attach panel above gate", timeMinutes: 10 },
        { instruction: "Cut mesh panel for gate frame - slightly smaller than frame", timeMinutes: 8 },
        { instruction: "Attach mesh to gate frame, ensuring no sharp edges protrude", timeMinutes: 10, tip: "Fold edges under" },
        { instruction: "Test gate opens and closes freely", timeMinutes: 4 }
      ],
      parts: [
        { name: "Hardware Cloth 12mm", materialId: "hardware_cloth", quantity: "5 jm" },
        { name: "Galvanized Staples 10mm", quantity: "0.2 kg" },
        { name: "Edge Trim", quantity: "3 jm", note: "For gate edges" }
      ]
    },
    {
      title: "32. Install Roof Mesh",
      description: "Cover the A-frame roof with hardware cloth. This prevents aerial predators (hawks, owls) from attacking.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters", "run_gate"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Cut mesh panel for left roof slope - 4m x 1.8m", timeMinutes: 8 },
        { instruction: "Drape over left rafters, secure at ridge first", timeMinutes: 15 },
        { instruction: "Work down to eaves, stapling to each rafter", timeMinutes: 10 },
        { instruction: "Cut panel for right roof slope", timeMinutes: 8 },
        { instruction: "Install right roof panel same way", timeMinutes: 15 },
        { instruction: "Overlap panels at ridge by 100mm", timeMinutes: 4, tip: "Water sheds over the overlap" }
      ],
      parts: [
        { name: "Hardware Cloth 12mm", materialId: "hardware_cloth", quantity: "15 jm" },
        { name: "Galvanized Staples 10mm", quantity: "0.3 kg" }
      ]
    },
    {
      title: "33. Dig & Install Mesh Apron",
      description: "Install buried mesh apron around the run perimeter. This prevents foxes, mink, and badgers from digging under.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters", "run_gate", "mesh_apron"],
      timeMinutes: 120,
      subSteps: [
        { instruction: "Dig trench 300mm deep x 500mm wide around entire run perimeter", timeMinutes: 45, tip: "L-shaped trench - vertical then horizontal" },
        { instruction: "Cut mesh apron panels - 600mm wide (300mm down + 500mm out)", timeMinutes: 15 },
        { instruction: "Lay mesh in trench with vertical edge against run frame", timeMinutes: 20 },
        { instruction: "Attach vertical edge to bottom of run with screws and battens", timeMinutes: 15 },
        { instruction: "Backfill trench, tamping soil firmly", timeMinutes: 20 },
        { instruction: "The horizontal mesh prevents dig-through even if predator digs deep", timeMinutes: 5, tip: "Grass will grow through mesh, hiding it" }
      ],
      parts: [
        { name: "Hardware Cloth 12mm 600mm wide", materialId: "hardware_cloth", quantity: "14 jm", note: "Run perimeter" },
        { name: "Battens 20x40mm", quantity: "14 jm" },
        { name: "Exterior Screws 4x30mm", quantity: "100" }
      ]
    },
    {
      title: "34. L-Extension Frame",
      description: "Add the L-shaped extension to increase run area. This provides extra space for dust bathing and foraging.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters", "run_gate", "mesh_apron", "l_extension"],
      timeMinutes: 90,
      subSteps: [
        { instruction: "Mark L-extension layout - 2m x 2m additional area", timeMinutes: 5 },
        { instruction: "Dig 2 additional post holes at new corners", timeMinutes: 20 },
        { instruction: "Set posts in concrete as before", timeMinutes: 20 },
        { instruction: "Allow concrete to cure overnight", timeMinutes: 5, tip: "Can continue next day" },
        { instruction: "Install top rails connecting to main run", timeMinutes: 15 },
        { instruction: "Install lower rails", timeMinutes: 10 },
        { instruction: "Cover with hardware cloth on all sides", timeMinutes: 15 }
      ],
      parts: [
        { name: "Posts 98x98", materialId: "cedar_post_98x98", quantity: "2", note: "2.6m length" },
        { name: "Rails 48x98", materialId: "cedar_post_98x98", quantity: "4" },
        { name: "Concrete Mix 25kg", quantity: "2" },
        { name: "Hardware Cloth", materialId: "hardware_cloth", quantity: "8 jm" }
      ]
    },
    {
      title: "35. Chicken Gym & Enrichment",
      description: "Install enrichment features inside the run. Happy chickens need things to do!",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters", "run_gate", "mesh_apron", "l_extension", "chicken_gym"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Install low perch at 300mm height", timeMinutes: 8 },
        { instruction: "Install mid perch at 500mm height", timeMinutes: 8 },
        { instruction: "Install high perch at 800mm height", timeMinutes: 8, tip: "Stagger heights so chickens can hop between" },
        { instruction: "Create dust bath corner - dig shallow depression", timeMinutes: 10 },
        { instruction: "Fill dust bath with sand and wood ash mix (4:1)", timeMinutes: 8 },
        { instruction: "Add platform/shelter for shade and rain protection", timeMinutes: 12 },
        { instruction: "Optional: hang cabbage or treat ball for pecking enrichment", timeMinutes: 6 }
      ],
      parts: [
        { name: "Natural Perch Branches 40-60mm", quantity: "3", note: "Apple or hazel wood ideal" },
        { name: "Perch Brackets", quantity: "6" },
        { name: "Play Sand 25kg", quantity: "2" },
        { name: "Wood Ash", quantity: "5 kg" },
        { name: "Plywood Platform 600x600mm", quantity: "1" }
      ]
    },
    {
      title: "36. Move In the Chickens! 🐔",
      description: "The moment you've been waiting for! Introduce your flock to their new Nordic home.",
      showObjects: ["foundation_pavers", "foundation_skids", "floor_deck", "floor_hangers", "front_wall", "back_wall", "left_wall", "right_wall", "roof", "run_corner_posts", "run_gate_post", "run_top_rails", "run_lower_rails", "run_gate_beam", "run_ridge_beam", "run_roof_rafters", "run_gate", "mesh_apron", "l_extension", "chicken_gym", "chickens"],
      timeMinutes: 60,
      subSteps: [
        { instruction: "Add 50-100mm bedding to coop floor (straw or wood shavings)", timeMinutes: 10 },
        { instruction: "Fill nesting boxes with straw bedding", timeMinutes: 5 },
        { instruction: "Set up feeder with layer feed in protected area", timeMinutes: 5 },
        { instruction: "Fill waterer with fresh water", timeMinutes: 5, tip: "Consider heated waterer for -20°C nights" },
        { instruction: "Release chickens INTO COOP FIRST - let them explore indoors", timeMinutes: 10, tip: "Introduce at dusk so they settle overnight" },
        { instruction: "Keep chickens in coop for 2-3 days so they know it's home", timeMinutes: 5 },
        { instruction: "Then open pop door to run - they'll return to coop at dusk", timeMinutes: 5 },
        { instruction: "Observe flock settling in and enjoy your kahvi! ☕", timeMinutes: 15 }
      ],
      parts: [
        { name: "Straw Bedding Bale", quantity: "2" },
        { name: "Layer Feed 25kg", quantity: "1" },
        { name: "Poultry Grit", quantity: "2 kg" },
        { name: "Laying Hens", quantity: "4-6", note: "Rhode Island Red or similar cold-hardy breed" },
        { name: "Mealworm Treats", quantity: "1 bag", note: "For taming" }
      ]
    }
  ]
};

export { scene, materials, displayScale, heatingInfo, buildInstructions as buildGuide };
