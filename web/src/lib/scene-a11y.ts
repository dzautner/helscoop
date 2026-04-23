export function countSceneAddCalls(sceneJs: string): number {
  return sceneJs.match(/\bscene\s*\.\s*add\s*\(/g)?.length ?? 0;
}
