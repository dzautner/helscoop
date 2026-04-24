# Room Scan Import

Helscoop supports a Phase 1 LiDAR/as-built workflow for homeowners who scan an interior with RoomPlan-compatible tools such as MagicPlan, RoomScan Pro, or an iOS RoomPlan exporter.

## Supported Inputs

- `.usdz` archives that contain an ASCII `.usd`, `.usda`, or structured `.json` sidecar.
- `.usd` and `.usda` ASCII exports with named room, wall, door, and window primitives.
- `.json` exports with `rooms`, `walls`, and `openings` arrays.
- `.usdc` binary files are accepted as artifacts, but exact primitive extraction falls back to owner/building dimensions until a native parser is connected.

## Endpoint

`POST /room-scan/projects/:projectId/import`

The endpoint requires normal project authentication and uses the existing `quantityTakeoff` credit bucket.

```json
{
  "scans": [
    {
      "name": "ground-floor.usdz",
      "mime_type": "model/vnd.usdz+zip",
      "size": 3200000,
      "data_url": "data:model/vnd.usdz+zip;base64,..."
    }
  ],
  "building_info": {
    "area_m2": 120,
    "floors": 2
  },
  "options": {
    "floor_label": "Ground floor",
    "notes": "Sauna and utility room included",
    "width_m": 10,
    "depth_m": 8
  }
}
```

## Response

The response includes:

- `rooms`, `walls`, and `openings` with dimensions and confidence.
- `quality.coverage_percent`, parser mode, warnings, and detected feature count.
- `scene_js` that can be appended to the current 3D editor scene.
- `bom_suggestions` for wall framing, boards, subfloor sheets, membrane, trim, doors, and paint.
- `estimate` with material total and non-catalog allowance.

## Recommended Homeowner Workflow

1. Scan one floor at a time and keep the phone at chest height.
2. Walk the perimeter first, then sweep each room.
3. Open doors before scanning so RoomPlan can connect rooms.
4. Export USDZ/USD from the scan app and upload it in Helscoop.
5. Check the coverage indicator and warnings before importing BOM rows.
6. Append the scan to the existing address-generated shell, then delete or edit incorrect room/wall boxes.

This workflow is for planning and BOM generation. It is not a certified measurement, structural design, or permit-ready scan.
