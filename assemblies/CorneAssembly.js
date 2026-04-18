const ensureLoadMeshAvailable = () => {
  if (typeof loadMesh !== 'function') {
    throw new Error('loadMesh binding is not available; rebuild the viewer with mesh import support.');
  }
};

const centerOnFloor = (manifold) => {
  const bounds = boundingBox(manifold);
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cy = (bounds.min[1] + bounds.max[1]) / 2;
  return translate(manifold, [-cx, -cy, -bounds.min[2]]);
};

export const buildCorneAssembly = () => {
  ensureLoadMeshAvailable();
  const left = loadMesh('assemblies/library/models/corne/corne_chocolate_with_ble_L (1).stl', true);
  const right = loadMesh('assemblies/library/models/corne/corne_chocolate_with_ble_R (1).stl', true);
  const cover = loadMesh('assemblies/library/models/corne/corne_blecover.stl', true);
  const combined = union(left, right, cover);
  return centerOnFloor(combined);
};

export default buildCorneAssembly;
