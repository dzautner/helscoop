function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceSceneMaterialReferences(
  sceneJs: string,
  fromMaterialId: string,
  toMaterialId: string,
): { code: string; replacements: number } {
  if (!fromMaterialId || !toMaterialId || fromMaterialId === toMaterialId) {
    return { code: sceneJs, replacements: 0 };
  }

  const escapedFrom = escapeRegExp(fromMaterialId);
  let replacements = 0;
  let code = sceneJs;
  const replaceQuotedMaterial = (_match: string, prefix: string, quote: string) => {
    replacements += 1;
    return `${prefix}${quote}${toMaterialId}${quote}`;
  };

  code = code.replace(
    new RegExp(`(withMaterial\\([^\\n]*?,\\s*)(["'])${escapedFrom}\\2`, "g"),
    replaceQuotedMaterial,
  );
  code = code.replace(
    new RegExp(`(material\\s*:\\s*)(["'])${escapedFrom}\\2`, "g"),
    replaceQuotedMaterial,
  );

  return { code, replacements };
}
