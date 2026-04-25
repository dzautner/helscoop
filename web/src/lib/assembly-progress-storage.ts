export const ASSEMBLY_PROGRESS_STORAGE_PREFIX = "helscoop_assembly_progress_";

type AssemblyProgressStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function getAssemblyProgressStorageKey(projectId: string): string {
  return `${ASSEMBLY_PROGRESS_STORAGE_PREFIX}${projectId}`;
}

export function readAssemblyProgressFromStorage(
  storage: AssemblyProgressStorage,
  storageKey: string,
  validStepIds: Set<string>,
): Set<string> {
  let raw: string | null;

  try {
    raw = storage.getItem(storageKey);
  } catch {
    return new Set();
  }

  if (raw === null) return new Set();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeAssemblyProgress(storage, storageKey);
    return new Set();
  }

  if (!Array.isArray(parsed)) {
    removeAssemblyProgress(storage, storageKey);
    return new Set();
  }

  const normalized = Array.from(
    new Set(parsed.filter((stepId): stepId is string => typeof stepId === "string" && validStepIds.has(stepId))),
  );
  const normalizedJson = JSON.stringify(normalized);
  if (normalizedJson !== raw) {
    writeAssemblyProgressToStorage(storage, storageKey, new Set(normalized));
  }

  return new Set(normalized);
}

export function writeAssemblyProgressToStorage(
  storage: AssemblyProgressStorage,
  storageKey: string,
  completedStepIds: Set<string>,
): void {
  try {
    storage.setItem(storageKey, JSON.stringify(Array.from(completedStepIds)));
  } catch {
    // A full, disabled, or unavailable localStorage should not break the editor.
  }
}

function removeAssemblyProgress(storage: AssemblyProgressStorage, storageKey: string): void {
  try {
    storage.removeItem(storageKey);
  } catch {
    // Ignore cleanup failures for the same reason writes are best-effort.
  }
}
