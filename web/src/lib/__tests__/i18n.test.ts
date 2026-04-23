import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTranslation, detectLocale, persistLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLocalStorage(data: Record<string, string> = {}) {
  const store: Record<string, string> = { ...data };
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
}

// ---------------------------------------------------------------------------
// 1. Locale detection
// ---------------------------------------------------------------------------

describe("detectLocale", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  it("returns 'fi' when running on the server (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(detectLocale()).toBe("fi");
  });

  it("returns stored locale 'en' from localStorage", () => {
    const ls = mockLocalStorage({ helscoop_locale: "en" });
    vi.stubGlobal("window", { localStorage: ls, navigator: { language: "fi-FI" } });
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { language: "fi-FI" });
    expect(detectLocale()).toBe("en");
  });

  it("returns stored locale 'fi' from localStorage", () => {
    const ls = mockLocalStorage({ helscoop_locale: "fi" });
    vi.stubGlobal("window", { localStorage: ls, navigator: { language: "en-US" } });
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(detectLocale()).toBe("fi");
  });

  it("ignores invalid stored locale and falls back to browser language", () => {
    const ls = mockLocalStorage({ helscoop_locale: "de" });
    vi.stubGlobal("window", { localStorage: ls, navigator: { language: "en-GB" } });
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { language: "en-GB" });
    expect(detectLocale()).toBe("en");
  });

  it("detects 'en' from browser language 'en-US'", () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: ls, navigator: { language: "en-US" } });
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(detectLocale()).toBe("en");
  });

  it("detects 'en' from browser language 'en'", () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: ls, navigator: { language: "en" } });
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { language: "en" });
    expect(detectLocale()).toBe("en");
  });

  it("defaults to 'fi' for non-English browser language", () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: ls, navigator: { language: "de-DE" } });
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { language: "de-DE" });
    expect(detectLocale()).toBe("fi");
  });

  it("defaults to 'fi' for Finnish browser language", () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("window", { localStorage: ls, navigator: { language: "fi-FI" } });
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("navigator", { language: "fi-FI" });
    expect(detectLocale()).toBe("fi");
  });
});

// ---------------------------------------------------------------------------
// 2. persistLocale
// ---------------------------------------------------------------------------

describe("persistLocale", () => {
  it("stores locale in localStorage", () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("localStorage", ls);
    persistLocale("en");
    expect(ls.setItem).toHaveBeenCalledWith("helscoop_locale", "en");
  });

  it("overwrites previous locale", () => {
    const ls = mockLocalStorage({ helscoop_locale: "fi" });
    vi.stubGlobal("localStorage", ls);
    persistLocale("en");
    expect(ls.setItem).toHaveBeenCalledWith("helscoop_locale", "en");
  });
});

// ---------------------------------------------------------------------------
// 3. Key lookup — Finnish
// ---------------------------------------------------------------------------

describe("getTranslation — Finnish (fi)", () => {
  const t = getTranslation("fi");

  it("resolves a top-level namespace key", () => {
    expect(t("nav.projects")).toBe("Projektit");
  });

  it("resolves deeply nested keys", () => {
    expect(t("auth.login")).toBe("Kirjaudu");
    expect(t("auth.loginTitle")).toBe("Kirjaudu sisään");
  });

  it("resolves brand keys", () => {
    expect(t("brand.trustFree")).toBe("Ilmainen");
  });

  it("resolves editor keys", () => {
    expect(t("editor.save")).toBe("Tallenna");
    expect(t("editor.undo")).toBe("Kumoa");
  });

  it("resolves settings keys", () => {
    expect(t("settings.title")).toBe("Asetukset");
  });

  it("resolves unit keys", () => {
    expect(t("units.kpl")).toBe("kpl");
    expect(t("units.kplLong")).toBe("kappale");
  });
});

// ---------------------------------------------------------------------------
// 4. Key lookup — English
// ---------------------------------------------------------------------------

describe("getTranslation — English (en)", () => {
  const t = getTranslation("en");

  it("resolves navigation keys", () => {
    expect(t("nav.projects")).toBe("Projects");
    expect(t("nav.logout")).toBe("Sign out");
  });

  it("resolves auth keys", () => {
    expect(t("auth.login")).toBe("Sign in");
    expect(t("auth.register")).toBe("Create account");
  });

  it("resolves editor keys", () => {
    expect(t("editor.save")).toBe("Save");
    expect(t("editor.redo")).toBe("Redo");
  });

  it("resolves toast keys", () => {
    expect(t("toast.projectCreated")).toBe("Project created");
    expect(t("toast.saveFailed")).toBe("Save failed");
  });

  it("resolves pricing keys", () => {
    expect(t("pricing.compareTitle")).toBe("Price comparison");
    expect(t("pricing.cheapest")).toBe("Cheapest");
  });

  it("resolves unit keys", () => {
    expect(t("units.kpl")).toBe("pcs");
    expect(t("units.sakkiLong")).toBe("bag");
  });
});

// ---------------------------------------------------------------------------
// 5. Fallback behaviour
// ---------------------------------------------------------------------------

describe("fallback — missing keys return the key itself", () => {
  const tFi = getTranslation("fi");
  const tEn = getTranslation("en");

  it("returns the key for a completely nonexistent top-level namespace", () => {
    expect(tFi("nonexistent.key")).toBe("nonexistent.key");
    expect(tEn("nonexistent.key")).toBe("nonexistent.key");
  });

  it("returns the key for a valid namespace but missing leaf", () => {
    expect(tFi("nav.doesNotExist")).toBe("nav.doesNotExist");
    expect(tEn("nav.doesNotExist")).toBe("nav.doesNotExist");
  });

  it("returns the key for a deeply nested missing path", () => {
    expect(tFi("a.b.c.d.e")).toBe("a.b.c.d.e");
  });

  it("returns the key when the path resolves to an object (not a string)", () => {
    // 'nav' alone is an object, not a leaf string
    expect(tFi("nav")).toBe("nav");
    expect(tEn("nav")).toBe("nav");
  });

  it("returns the key for an empty string key", () => {
    expect(tFi("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 6. Template interpolation
// ---------------------------------------------------------------------------

describe("template interpolation", () => {
  const tFi = getTranslation("fi");
  const tEn = getTranslation("en");

  it("replaces a single {{count}} placeholder", () => {
    // editor.objectCount = '{{count}} objektia' (fi)
    expect(tFi("editor.objectCount", { count: 42 })).toBe("42 objektia");
  });

  it("replaces {{count}} in English", () => {
    // editor.objectCount = '{{count}} objects' (en)
    expect(tEn("editor.objectCount", { count: 7 })).toBe("7 objects");
  });

  it("replaces multiple placeholders", () => {
    // onboarding.stepOf = '{{current}} / {{total}}' (fi)
    expect(tFi("onboarding.stepOf", { current: 2, total: 5 })).toBe("2 / 5");
    expect(tEn("onboarding.stepOf", { current: 3, total: 5 })).toBe("3 / 5");
  });

  it("replaces string parameter values", () => {
    // project.projectCount = '{{count}} projekti{{suffix}}' (fi)
    expect(tFi("project.projectCount", { count: 1, suffix: "" })).toBe("1 projekti");
    expect(tFi("project.projectCount", { count: 3, suffix: "a" })).toBe("3 projektia");
  });

  it("replaces name in validation messages", () => {
    // validation.typoDetected = 'Mahdollinen kirjoitusvirhe — tarkoititko "{{name}}"?' (fi)
    expect(tFi("validation.typoDetected", { name: "cylinder" })).toBe(
      'Mahdollinen kirjoitusvirhe \u2014 tarkoititko "cylinder"?'
    );
  });

  it("replaces multiple distinct placeholders in validation", () => {
    // validation.unmatchedCloser = 'Unmatched closing {{char}} on line {{line}}' (en)
    expect(tEn("validation.unmatchedCloser", { char: "}", line: 42 })).toBe(
      "Unmatched closing } on line 42"
    );
  });

  it("leaves unreferenced placeholders untouched", () => {
    // If params don't cover all placeholders, the leftover {{...}} stays
    expect(tEn("editor.objectCount", {})).toBe("{{count}} objects");
  });

  it("ignores extra params that don't match any placeholder", () => {
    expect(tEn("nav.projects", { unused: "value" })).toBe("Projects");
  });

  it("handles numeric zero as a param value", () => {
    expect(tEn("editor.objectCount", { count: 0 })).toBe("0 objects");
  });
});

// ---------------------------------------------------------------------------
// 7. Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  const tFi = getTranslation("fi");
  const tEn = getTranslation("en");

  it("handles keys that contain dots correctly (deep nesting)", () => {
    // Three levels: 'auth.forgotPasswordTitle'
    expect(tFi("auth.forgotPasswordTitle")).toBe("Nollaa salasana");
  });

  it("handles keys with camelCase leaf names", () => {
    expect(tEn("editor.aiAssistant")).toBe("AI Assistant");
    expect(tEn("editor.bomRowCount", { count: 10, suffix: "s" })).toBe("10 rows");
  });

  it("returns key for single-segment key that is not a leaf", () => {
    expect(tFi("auth")).toBe("auth");
    expect(tFi("editor")).toBe("editor");
  });

  it("returns the key for a single-segment key that does not exist", () => {
    expect(tFi("zzz")).toBe("zzz");
  });

  it("both locales have the same set of top-level namespaces", () => {
    const fiT = getTranslation("fi");
    const enT = getTranslation("en");
    // Spot-check: every key that works in 'en' should also work in 'fi'
    const keys = [
      "nav.projects",
      "auth.login",
      "brand.tagline",
      "search.title",
      "project.myProjects",
      "toast.saved",
      "editor.save",
      "share.title",
      "shortcuts.title",
      "settings.title",
      "pricing.compareTitle",
      "units.kpl",
      "dialog.confirm",
      "admin.adminPanel",
      "onboarding.welcomeTitle",
      "legal.privacyPolicy",
      "screenshot.download",
      "validation.warningsTitle",
      "errors.notFoundTitle",
    ];
    for (const key of keys) {
      // Neither should fall back to returning the raw key
      expect(fiT(key)).not.toBe(key);
      expect(enT(key)).not.toBe(key);
    }
  });

  it("Finnish and English translations differ for the same key", () => {
    expect(tFi("nav.projects")).not.toBe(tEn("nav.projects"));
    expect(tFi("auth.login")).not.toBe(tEn("auth.login"));
    expect(tFi("editor.save")).not.toBe(tEn("editor.save"));
  });

  it("handles special characters in translation values", () => {
    // brand.tagline contains unicode middot \u00b7 and special chars
    expect(tEn("brand.tagline")).toContain("\u00b7");
    // units contain superscript characters
    expect(tEn("units.sqm")).toBe("m\u00B2");
    expect(tEn("units.m3")).toBe("m\u00B3");
  });

  it("handles interpolation with special characters in param values", () => {
    expect(
      tEn("validation.undefinedIdentifier", { name: "foo<bar>" })
    ).toBe('"foo<bar>" is not defined \u2014 check spelling');
  });
});

// ---------------------------------------------------------------------------
// 8. Exhaustive key parity — every fi key must have a corresponding en key
// ---------------------------------------------------------------------------

describe("exhaustive i18n key parity", () => {
  const tFi = getTranslation("fi");
  const tEn = getTranslation("en");

  // All top-level namespaces with all their leaf keys
  const allKeys = [
    // nav
    "nav.projects", "nav.admin", "nav.logout", "nav.back", "nav.settings",
    // auth
    "auth.login", "auth.loginTitle", "auth.loginSubtitle", "auth.loginSubtitleBuilding",
    "auth.register", "auth.registerTitle", "auth.registerSubtitle",
    "auth.email", "auth.emailPlaceholder", "auth.password", "auth.passwordPlaceholder",
    "auth.name", "auth.namePlaceholder", "auth.noAccount", "auth.hasAccount",
    "auth.loading", "auth.loginFailed",
    "auth.forgotPassword", "auth.forgotPasswordTitle", "auth.forgotPasswordSubtitle",
    "auth.forgotPasswordSend", "auth.forgotPasswordSent", "auth.forgotPasswordBack",
    "auth.resetPasswordTitle", "auth.resetPasswordSubtitle", "auth.resetPasswordNew",
    "auth.resetPasswordNewPlaceholder", "auth.resetPasswordConfirm",
    "auth.resetPasswordConfirmPlaceholder", "auth.resetPasswordSubmit",
    "auth.resetPasswordSuccess", "auth.resetPasswordMismatch", "auth.resetPasswordInvalid",
    "auth.passwordWeak", "auth.passwordMedium", "auth.passwordStrong",
    // brand
    "brand.tagline", "brand.trustProducts", "brand.trustSuppliers", "brand.trustFree",
    "brand.description", "brand.featureMaterials", "brand.featureMaterialsDesc",
    "brand.featureSuppliers", "brand.featureSuppliersDesc",
    "brand.featureAI", "brand.featureAIDesc",
    // search
    "search.sectionLabel", "search.title", "search.subtitle", "search.placeholder",
    "search.searching", "search.searchButton", "search.createFromBuilding",
    "search.creatingProject", "search.createError", "search.notFound",
    "search.type", "search.yearBuilt", "search.area", "search.floors", "search.material",
    "search.heating", "search.roofType", "search.bomRows", "search.editHint",
    "search.updatingBuilding", "search.updateError", "search.verified", "search.estimated",
    "search.dataSources",
    // project
    "project.myProjects", "project.projectCount", "project.startFirst",
    "project.loadingProjects", "project.newProjectPlaceholder", "project.nameField", "project.create",
    "project.open", "project.copy", "project.delete", "project.deleteConfirm",
    "project.noProjects", "project.noProjectsDesc", "project.emptyDescription",
    "project.descriptionPlaceholder", "project.orStartFromTemplate",
    "project.searchPlaceholder", "project.sortByName", "project.sortByModified",
    "project.sortByCreated", "project.sortByCost", "project.noSearchResults",
    "project.noSearchResultsDesc", "project.emptyTitle", "project.emptyHint",
    "project.emptyCta", "project.noSearchResultsCta", "project.useTemplate",
    "project.openAriaLabel", "project.copyAriaLabel", "project.deleteAriaLabel",
    "project.viewCount",
    // BOM aggregate
    "bomAggregate.eyebrow", "bomAggregate.title", "bomAggregate.subtitle",
    "bomAggregate.selectProject", "bomAggregate.selectShort",
    "bomAggregate.selectedCount", "bomAggregate.combine", "bomAggregate.clear",
    "bomAggregate.selectHint", "bomAggregate.error", "bomAggregate.projects",
    "bomAggregate.mergedRows", "bomAggregate.totalCost", "bomAggregate.bulkCandidates",
    "bomAggregate.tableHint", "bomAggregate.empty", "bomAggregate.exportCsv",
    "bomAggregate.exported", "bomAggregate.material", "bomAggregate.quantity",
    "bomAggregate.cost", "bomAggregate.bulk", "bomAggregate.projectBreakdown",
    "bomAggregate.bulkCandidate", "bomAggregate.compareTitle",
    "bomAggregate.compareSubtitle", "bomAggregate.compareLimit",
    "bomAggregate.costPerM2", "bomAggregate.costPerM2Missing",
    "bomAggregate.sharedMaterials", "bomAggregate.noSharedMaterials",
    "bomAggregate.uncategorized", "bomAggregate.noBulk",
    // photo estimate
    "photoEstimate.eyebrow", "photoEstimate.title", "photoEstimate.subtitle",
    "photoEstimate.creditCost", "photoEstimate.creditTooltip",
    "photoEstimate.dropHint", "photoEstimate.fileInput", "photoEstimate.selected",
    "photoEstimate.analyze", "photoEstimate.analyzing", "photoEstimate.error",
    "photoEstimate.insufficientCredits", "photoEstimate.rangeLabel",
    "photoEstimate.context", "photoEstimate.confidence", "photoEstimate.subsidyFlag",
    "photoEstimate.addToBom", "photoEstimate.imported", "photoEstimate.importedShort",
    "photoEstimate.scope.roof", "photoEstimate.scope.facade", "photoEstimate.scope.windows",
    "photoEstimate.scope.insulation", "photoEstimate.scope.heating", "photoEstimate.scope.terrace",
    // toast
    "toast.projectCreated", "toast.projectDeleted", "toast.projectDuplicated",
    "toast.templateCreated", "toast.saved", "toast.bomExported", "toast.exportingBom",
    "toast.loadProjectsFailed", "toast.createProjectFailed", "toast.templateFailed",
    "toast.deleteFailed", "toast.duplicateFailed", "toast.loadProjectFailed",
    "toast.saveFailed", "toast.bomExportFailed", "toast.aiError",
    "toast.shareFailed", "toast.unshareFailed", "toast.linkCopied",
    "toast.projectUnshared", "toast.loadMaterialsFailed", "toast.loadSuppliersFailed",
    "toast.loadPricingFailed", "toast.materialRemoved", "toast.undo",
    "toast.overflowMore", "toast.dismiss",
    "toast.copyFailed",
    // credits
    "credits.shortLabel", "credits.balanceAria", "credits.eyebrow",
    "credits.title", "credits.subtitle", "credits.currentBalance",
    "credits.credits", "credits.unitPrice", "credits.savings",
    "credits.lowBadge", "credits.lowToast", "credits.neverExpire",
    "credits.insufficient", "credits.checkoutFailed", "credits.purchaseSimulated",
    // editor
    "editor.scene", "editor.materialList", "editor.save", "editor.saved",
    "editor.saving", "editor.unsaved", "editor.export", "editor.exportPdf",
    "editor.undo", "editor.redo", "editor.undoShortcut", "editor.redoShortcut",
    "editor.assistant", "editor.aiAssistant", "editor.describeChange",
    "editor.continueConversation", "editor.describePrompt",
    "editor.exampleRoof", "editor.exampleWindow",
    "editor.suggestionRoof", "editor.suggestionWindow", "editor.suggestionGarage",
    "editor.applyToScene", "editor.thinking",
    "editor.message", "editor.messages",
    "editor.objectSingular", "editor.objectPlural",
    "editor.bomItemSingular", "editor.bomItemPlural",
    "editor.bomTotalAnnouncement",
    "editor.sceneChangeAnnouncement", "editor.sceneAppliedFromChat",
    "editor.sceneUpdatedFromEditor", "editor.sceneParameterChanged",
    "editor.sceneDraftRestored", "editor.sceneResetAnnounced",
    "editor.sceneMaterialChanged", "editor.sceneUndoAnnounced",
    "editor.sceneRedoAnnounced", "editor.sceneVersionRestored",
    "editor.sceneSnippetInserted",
    "editor.chatMinimize", "editor.chatExpand", "editor.chatInputLabel", "editor.chatSendLabel",
    "editor.addMaterial", "editor.add",
    "editor.noMaterials", "editor.noMaterialsHint", "editor.noMaterialsCta",
    "editor.error", "editor.errorLoadProject", "editor.backToProjects",
    "editor.loadingProject", "editor.chatError",
    "editor.viewportA11yLabel", "editor.viewportA11yDescription", "editor.viewportA11yKeyboardHelp",
    "editor.viewportCrashTitle", "editor.viewportCrashMessage", "editor.resetScene",
    "editor.loading3D", "editor.showCode", "editor.hideCode", "editor.wireframe",
    "editor.params", "editor.resetCamera",
    "editor.cameraFront", "editor.cameraSide", "editor.cameraTop", "editor.cameraIso",
    "editor.screenshot", "editor.screenshotAriaLabel",
    "editor.ruler", "editor.rulerTooltip",
    "editor.measurePickFirst", "editor.measurePickSecond",
    "editor.measureClear", "editor.measureClearShort", "editor.measureUnit",
    "editor.dimensions", "editor.gridScale",
    "editor.measureWidth", "editor.measureHeight", "editor.measureDepth",
    "editor.measureRadius", "editor.measureDiameter",
    "editor.sceneErrorPrefix", "editor.objectCount", "editor.bomRowCount",
    "editor.estimatedTotal", "editor.inclVat", "editor.costBreakdown",
    "editor.confirmApplyTitle", "editor.confirmApplyMessage", "editor.confirmApplyUndo",
    "editor.cancel", "editor.dontAskAgain",
    "editor.docs", "editor.share", "editor.duplicateProject", "editor.parameters",
    "editor.unsavedWarning", "editor.quantityFor",
    "editor.removeMaterial", "editor.confirmRemoveItem", "editor.bomItemRow",
    "editor.sceneMaterialsDetected", "editor.syncFromScene", "editor.materialConfiguratorHint",
    // share
    "share.title", "share.description", "share.generating", "share.copyLink",
    "share.linkLabel", "share.copied", "share.unshare", "share.unshareConfirm", "share.poweredBy",
    "share.viewerTitle", "share.notFound", "share.notFoundDesc", "share.readOnly",
    "share.signUpCta", "share.materials", "share.total", "share.viewCount",
    // presentation
    "presentation.eyebrow", "presentation.title", "presentation.description",
    "presentation.estimate", "presentation.cameraPresets", "presentation.front",
    "presentation.frontDesc", "presentation.side", "presentation.sideDesc",
    "presentation.aerial", "presentation.aerialDesc", "presentation.iso",
    "presentation.isoDesc", "presentation.copyPresentation", "presentation.copied",
    "presentation.downloadWatermarked", "presentation.rendering", "presentation.assetViewer",
    "presentation.assetBom", "presentation.viewerBadge", "presentation.pitchMode",
    "presentation.pitchModeDesc",
    // shortcuts
    "shortcuts.title", "shortcuts.close", "shortcuts.save", "shortcuts.toggleBom", "shortcuts.applyCode",
    "shortcuts.closePanel", "shortcuts.showShortcuts", "shortcuts.undo", "shortcuts.redo",
    "shortcuts.commandPalette", "shortcuts.escToClose",
    // settings
    "settings.title", "settings.profile", "settings.profileDesc", "settings.name",
    "settings.email", "settings.saveProfile", "settings.security", "settings.securityDesc",
    "settings.currentPassword", "settings.newPassword", "settings.confirmPassword",
    "settings.changePassword", "settings.passwordMismatch", "settings.passwordTooShort",
    "settings.account", "settings.accountDesc", "settings.exportData",
    "settings.exportDataDesc", "settings.deleteAccount", "settings.deleteAccountWarning",
    "settings.deleteAccountConfirm", "settings.profileUpdated", "settings.profileUpdateFailed",
    "settings.passwordChanged", "settings.passwordChangeFailed",
    "settings.accountDeleted", "settings.accountDeleteFailed",
    "settings.dataExported", "settings.dataExportFailed", "settings.backToProjects",
    "settings.notifications", "settings.notificationsDesc", "settings.weeklyDigest",
    "settings.notificationsSaved", "settings.notificationsSaveFailed",
    // pricing
    "pricing.compareTitle", "pricing.supplier", "pricing.unitPrice", "pricing.buyLink",
    "pricing.cheapest", "pricing.primary", "pricing.noSuppliers", "pricing.loading",
    "pricing.savingsLabel", "pricing.savingsTooltip", "pricing.perUnit", "pricing.close",
    "pricing.lastChecked", "pricing.viewProduct", "pricing.searchMaterials",
    "pricing.allCategories", "pricing.noResults", "pricing.browseMaterials",
    "pricing.setQuantity", "pricing.showHistory", "pricing.hideHistory",
    "pricing.showTrend", "pricing.limitedHistory",
    // material picker
    "materialPicker.eyebrow", "materialPicker.title", "materialPicker.subtitle",
    "materialPicker.current", "materialPicker.openFor", "materialPicker.search",
    "materialPicker.searchPlaceholder", "materialPicker.sort", "materialPicker.sortPriceAsc",
    "materialPicker.sortPriceDesc", "materialPicker.sortThermal", "materialPicker.sortAvailability",
    "materialPicker.maxPrice", "materialPicker.maxConductivity", "materialPicker.any",
    "materialPicker.category", "materialPicker.allMaterials", "materialPicker.reset",
    "materialPicker.noResults", "materialPicker.unknownSupplier", "materialPicker.quantityNeeded",
    "materialPicker.thermal", "materialPicker.fireRating", "materialPicker.supplier",
    "materialPicker.deltaEach", "materialPicker.deltaTotal", "materialPicker.compare",
    "materialPicker.comparing", "materialPicker.compareLimit", "materialPicker.compareHint",
    "materialPicker.comparisonTitle", "materialPicker.feature", "materialPicker.bestValue",
    "materialPicker.totalCost", "materialPicker.viewAtRetailer", "materialPicker.noRetailerLink",
    "materialPicker.affiliateDisclosure", "materialPicker.surfaceApplied", "materialPicker.surfaceNoMatch",
    "materialPicker.select", "materialPicker.currentSelected", "materialPicker.alreadyInBom",
    // units
    "units.jm", "units.sqm", "units.m2", "units.m3", "units.kpl",
    "units.sheet", "units.box", "units.liter", "units.sakki",
    "units.jmLong", "units.sqmLong", "units.m2Long", "units.m3Long",
    "units.kplLong", "units.sheetLong", "units.boxLong", "units.literLong", "units.sakkiLong",
    // dialog
    "dialog.confirm", "dialog.cancel", "dialog.close", "dialog.deleteProjectTitle",
    "dialog.deleteProjectMessage", "dialog.deleteAccountTitle", "dialog.deleteAccountMessage",
    "dialog.deleteBomItemTitle", "dialog.deleteBomItemMessage",
    // admin
    "admin.adminPanel", "admin.adminDesc", "admin.dashboard", "admin.materials", "admin.suppliers",
    "admin.pricing", "admin.search", "admin.name", "admin.category",
    "admin.wasteFactor", "admin.price", "admin.supplier", "admin.others",
    "admin.noPrice", "admin.stalePrices", "admin.staleThreshold", "admin.allUpToDate",
    "admin.website", "admin.products", "admin.oldestPrice", "admin.material",
    "admin.lastUpdated", "admin.age", "admin.action", "admin.never",
    "admin.markRescrape", "admin.rescrapeQueued", "admin.rescrapeFailed",
    "admin.queueing", "admin.apiUptime", "admin.healthChecked",
    "admin.activeUsers", "admin.activeUsersWindow", "admin.totalProjects",
    "admin.totalUsers", "admin.totalBomValue", "admin.newUsers30d",
    "admin.priceFreshness", "admin.primaryPricesTracked", "admin.staleAlert",
    "admin.staleHealthy", "admin.fresh", "admin.aging", "admin.stale",
    "admin.staleShare", "admin.mostStalePrices", "admin.recentProjects",
    "admin.projectSourceAddress", "admin.projectSourceTemplate", "admin.projectSourceBlank",
    "admin.recentRegistrations", "admin.noRecentActivity", "admin.userRegistered",
    "admin.checkingAccess",
    // onboarding
    "onboarding.welcomeTitle", "onboarding.welcomeBody", "onboarding.welcomeStart",
    "onboarding.welcomeSkip", "onboarding.stepAddress", "onboarding.stepViewport",
    "onboarding.stepChat", "onboarding.stepMaterials", "onboarding.stepExport",
    "onboarding.next", "onboarding.skip", "onboarding.done", "onboarding.stepOf",
    "onboarding.restartTour", "onboarding.restartTourDesc", "onboarding.tourRestarted",
    // legal
    "legal.privacyPolicy", "legal.termsOfService", "legal.acceptTerms",
    "legal.acceptTermsRequired", "legal.and", "legal.lastUpdated",
    "legal.privacyTitle", "legal.privacyIntro", "legal.privacyDataCollected",
    "legal.privacyDataCollectedBody", "legal.privacyHowUsed", "legal.privacyHowUsedBody",
    "legal.privacyStorage", "legal.privacyStorageBody", "legal.privacyThirdParty",
    "legal.privacyThirdPartyBody", "legal.privacyRights", "legal.privacyRightsBody",
    "legal.privacyCookies", "legal.privacyCookiesBody", "legal.privacyContact",
    "legal.privacyContactBody", "legal.termsTitle", "legal.termsIntro",
    "legal.termsUse", "legal.termsUseBody", "legal.termsIP", "legal.termsIPBody",
    "legal.termsAI", "legal.termsAIBody", "legal.termsPrices", "legal.termsPricesBody",
    "legal.termsLiability", "legal.termsLiabilityBody", "legal.termsChanges",
    "legal.termsChangesBody",
    // screenshot
    "screenshot.dialogTitle", "screenshot.popoverLabel", "screenshot.download", "screenshot.copy", "screenshot.copied",
    // commandPalette
    "commandPalette.title", "commandPalette.placeholder", "commandPalette.noResults",
    "commandPalette.navigate", "commandPalette.execute", "commandPalette.close",
    "commandPalette.toggleWireframe", "commandPalette.toggleWireframeEn",
    "commandPalette.resetCamera", "commandPalette.resetCameraEn",
    "commandPalette.toggleRuler", "commandPalette.toggleRulerEn",
    "commandPalette.toggleCodeEditor", "commandPalette.toggleCodeEditorEn",
    "commandPalette.toggleBom", "commandPalette.toggleBomEn",
    "commandPalette.exportPdf", "commandPalette.exportPdfEn",
    "commandPalette.exportAraGrant", "commandPalette.exportAraGrantEn",
    "commandPalette.shareProject", "commandPalette.shareProjectEn",
    "commandPalette.toggleTheme", "commandPalette.toggleThemeEn",
    "commandPalette.showShortcuts", "commandPalette.showShortcutsEn",
    "commandPalette.save", "commandPalette.saveEn",
    "commandPalette.showDocs", "commandPalette.showDocsEn",
    "commandPalette.stateOn", "commandPalette.stateOff",
    // validation
    "validation.unmatchedCloser", "validation.unmatchedOpener", "validation.typoDetected",
    "validation.undefinedIdentifier", "validation.emptyScene", "validation.tooManyObjects",
    "validation.farFromOrigin", "validation.invalidDimension", "validation.warningsTitle",
    // aria
    "aria.switchLanguage", "aria.themeDark", "aria.themeLight", "aria.themeAuto",
    // errors
    "errors.notFoundTitle", "errors.notFoundMessage", "errors.backToProjects",
    "errors.searchAddress", "errors.serverErrorTitle", "errors.serverErrorMessage",
    "errors.tryAgain", "errors.backToDashboard", "errors.showDetails", "errors.hideDetails",
    "errors.projectNotFoundTitle", "errors.projectNotFoundMessage",
    "errors.connectionLost", "errors.reconnected", "errors.retryNow",
    // landing
    "landing.footerDescription", "landing.dataSources", "landing.dataSourceDvv",
    "landing.dataSourceMml", "landing.dataSourceBuildingMaterials",
    "landing.dataSourceTimber", "landing.dataSourceRoofing",
    "landing.links", "landing.privacyPolicy", "landing.termsOfService",
    "landing.dataInEu", "landing.featuresHeading", "landing.featuresLabel",
    "landing.featuresTitle", "landing.feature1Title", "landing.feature1Desc",
    "landing.feature2Title", "landing.feature2Desc",
    "landing.feature3Title", "landing.feature3Desc",
    // building
    "building.omakotitalo", "building.rivitalo", "building.kerrostalo", "building.paritalo",
    "building.roofGable", "building.roofFlat", "building.roofMansard", "building.roofShed",
    // bom
    "bom.donutChartAriaLabel", "bom.exportCsv", "bom.importBom",
    "bom.importNoRows", "bom.importFailed", "bom.importDrop",
    "bom.importPreview", "bom.importMatched", "bom.importMerge",
    "bom.importReplace", "bom.importUnmatched", "bom.importedRow",
    "bom.quantity", "bom.matchedMaterial", "bom.confidence", "bom.row",
    "bom.chooseMaterial", "bom.unmatched", "bom.importApply", "bom.importSuccess",
    "bom.csvMaterial", "bom.csvQuantity", "bom.csvUnit",
    "bom.csvUnitPrice", "bom.csvTotal", "bom.csvSupplier", "bom.csvCategory",
    "bom.inStock", "bom.lowStock", "bom.outOfStock", "bom.stockUnknown",
    "bom.stockSummary", "bom.outOfStockCount", "bom.stockWarning",
    "bom.alternativeAvailable", "bom.substituteAvailable", "bom.swapMaterial",
    "bom.dismiss", "bom.savingsWithSwap", "bom.priceIncreased", "bom.lastChecked",
    "bom.packageSwitcher", "bom.packageSwitcherDesc", "bom.packageNoAlternatives",
    "bom.packageBasic", "bom.packageStandard", "bom.packagePremium",
    "bom.packageCurrent", "bom.packageChanges", "bom.packageLocked",
    "bom.packageLock", "bom.packageUnlock",
    // BOM trends
    "bomTrends.eyebrow", "bomTrends.title", "bomTrends.loading",
    "bomTrends.noAverage", "bomTrends.aboveAverage", "bomTrends.belowAverage",
    "bomTrends.nearAverage", "bomTrends.waitSavings", "bomTrends.bestMonth",
    "bomTrends.nowVs12m", "bomTrends.buyNowCount", "bomTrends.waitCount",
    "bomTrends.watchCount", "bomTrends.modelNote",
    "bomTrends.source.retailer_history", "bomTrends.source.seasonal_model",
    "bomTrends.recommendation.buy_now", "bomTrends.recommendation.wait",
    "bomTrends.recommendation.watch",
    // Versions
    "versions.eyebrow", "versions.title", "versions.subtitle",
    "versions.branches", "versions.branchPlaceholder", "versions.createBranch",
    "versions.defaultBranchName", "versions.checkpointPlaceholder",
    "versions.saveCheckpoint", "versions.saving", "versions.loading",
    "versions.empty", "versions.compareTitle", "versions.costDelta",
    "versions.compare", "versions.uncompare", "versions.restore",
    "versions.restoring", "versions.restoreConfirm", "versions.restoreSuccess",
    "versions.fieldName", "versions.fieldDescription", "versions.fieldScene",
    "versions.initialSnapshot", "versions.bomChanges", "versions.noMaterialChanges",
    "versions.event.auto", "versions.event.named", "versions.event.restore",
    "versions.event.branch",
    // quote request
    "quoteRequest.eyebrow", "quoteRequest.title", "quoteRequest.subtitle",
    "quoteRequest.open", "quoteRequest.emptyDisabled", "quoteRequest.summaryProject",
    "quoteRequest.summaryAddress", "quoteRequest.summaryNoAddress", "quoteRequest.summaryRows",
    "quoteRequest.summaryTotal", "quoteRequest.workScope", "quoteRequest.workScopePlaceholder",
    "quoteRequest.contactName", "quoteRequest.contactEmail", "quoteRequest.contactPhone",
    "quoteRequest.postcode", "quoteRequest.partnerNote", "quoteRequest.submit",
    "quoteRequest.submittedToast", "quoteRequest.submitFailed", "quoteRequest.successTitle",
    "quoteRequest.successDesc", "quoteRequest.done",
    // household deduction
    "householdDeduction.eyebrow", "householdDeduction.title", "householdDeduction.coupleMode",
    "householdDeduction.labourBasis", "householdDeduction.credit", "householdDeduction.netCost",
    "householdDeduction.capNote", "householdDeduction.thresholdNote",
    "householdDeduction.registerWarning", "householdDeduction.veroLink", "householdDeduction.proCta",
    // renovation ROI
    "renovationRoi.eyebrow", "renovationRoi.title", "renovationRoi.grossCost",
    "renovationRoi.netCost", "renovationRoi.materialCost", "renovationRoi.labourCost",
    "renovationRoi.bestSubsidy", "renovationRoi.valueImpact",
    "renovationRoi.energyPayback", "renovationRoi.tenYearRoi", "renovationRoi.assumptionNote",
    "renovationRoi.category.energy", "renovationRoi.category.roof", "renovationRoi.category.kitchen",
    "renovationRoi.category.bathroom", "renovationRoi.category.facade", "renovationRoi.category.windows",
    "renovationRoi.category.outdoor", "renovationRoi.category.general",
    // renovation cost index
    "renovationCostIndex.eyebrow", "renovationCostIndex.title", "renovationCostIndex.loading",
    "renovationCostIndex.loadFailed", "renovationCostIndex.summary",
    "renovationCostIndex.updated", "renovationCostIndex.fallback",
    // BOM savings
    "bomSavings.eyebrow", "bomSavings.title", "bomSavings.totalAvailable",
    "bomSavings.noSavings", "bomSavings.supplier_switch", "bomSavings.material_substitution",
    "bomSavings.bulk_discount", "bomSavings.seasonal_stock", "bomSavings.supplier_switchEmpty",
    "bomSavings.material_substitutionEmpty", "bomSavings.bulk_discountEmpty", "bomSavings.seasonal_stockEmpty",
    "bomSavings.supplierSwitchText", "bomSavings.substitutionText", "bomSavings.bulkText",
    "bomSavings.stockText", "bomSavings.stockOnly", "bomSavings.applySupplier",
    "bomSavings.applySwap", "bomSavings.applyBulk", "bomSavings.seeAlternatives",
    "bomSavings.compare", "bomSavings.priceApplied", "bomSavings.swapApplied",
    // subsidy
    "subsidy.sectionLabel", "subsidy.opportunityLabel", "subsidy.sceneTriggeredTitle",
    "subsidy.sceneTriggeredBody", "subsidy.eligibleTitle", "subsidy.maybeTitle",
    "subsidy.checkTitle", "subsidy.deadlineCountdown", "subsidy.applicationDeadlineCountdown",
    "subsidy.deadlineTooltip",
    "subsidy.currentHeating", "subsidy.targetHeating", "subsidy.household",
    "subsidy.householdUnder65", "subsidy.household65Plus", "subsidy.householdDisabled",
    "subsidy.systemCondition", "subsidy.conditionUnknown", "subsidy.conditionOk",
    "subsidy.conditionBroken", "subsidy.conditionHard", "subsidy.yearRoundResidential",
    "subsidy.netCost", "subsidy.elyDeduction", "subsidy.notEligible",
    "subsidy.araMaybe", "subsidy.deadlineDatesWithApplication", "subsidy.deadlineDates",
    "subsidy.mutualExclusion", "subsidy.applyEly", "subsidy.readAra",
    "subsidy.loading", "subsidy.error", "subsidy.heating.unknown",
    "subsidy.heating.oil", "subsidy.heating.naturalGas",
    "subsidy.heating.directElectric", "subsidy.heating.wood",
    "subsidy.heating.districtHeat", "subsidy.heating.airWater",
    "subsidy.heating.groundSource", "subsidy.heating.otherNonFossil",
    "subsidy.heating.fossil",
    // waste
    "waste.title", "waste.subtitle", "waste.totalWeight", "waste.totalVolume",
    "waste.totalDisposalCost", "waste.recyclingRate", "waste.categories",
    "waste.wasteType", "waste.weight", "waste.volume", "waste.recyclable",
    "waste.notRecyclable", "waste.disposalCost", "waste.containerRecommendation",
    "waste.containerSize", "waste.containerCount", "waste.containerCost",
    "waste.sortingGuide", "waste.sortingInstruction", "waste.acceptedAt",
    "waste.noWaste", "waste.noWasteDesc", "waste.puujate", "waste.metallijate",
    "waste.kivijate", "waste.sekajate", "waste.vaarallinen_jate",
    "waste.muovijate", "waste.lasijate", "waste.eristejate",
    "waste.estimateLoading", "waste.estimateFailed", "waste.asbestosWarning",
    // viewport
    "viewport.contextMenuLabel",
  ];

  it("every Finnish key has a corresponding English translation", () => {
    const missingInEn: string[] = [];
    for (const key of allKeys) {
      const fiVal = tFi(key);
      const enVal = tEn(key);
      // If fi resolves but en falls back to the key itself, it is missing
      if (fiVal !== key && enVal === key) {
        missingInEn.push(key);
      }
    }
    expect(missingInEn).toEqual([]);
  });

  it("every English key has a corresponding Finnish translation", () => {
    const missingInFi: string[] = [];
    for (const key of allKeys) {
      const fiVal = tFi(key);
      const enVal = tEn(key);
      // If en resolves but fi falls back to the key itself, it is missing
      if (enVal !== key && fiVal === key) {
        missingInFi.push(key);
      }
    }
    expect(missingInFi).toEqual([]);
  });

  it("no key resolves to fallback in both locales (i.e., all keys exist)", () => {
    const missingInBoth: string[] = [];
    for (const key of allKeys) {
      if (tFi(key) === key && tEn(key) === key) {
        missingInBoth.push(key);
      }
    }
    expect(missingInBoth).toEqual([]);
  });
});
