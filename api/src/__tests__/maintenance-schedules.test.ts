import { describe, it, expect } from "vitest";
import {
  maintenanceSchedules,
  defaultSchedule,
  getScheduleForCategory,
  type MaintenanceSchedule,
} from "../maintenance-schedules";

describe("maintenanceSchedules data", () => {
  const categories = Object.keys(maintenanceSchedules);

  it("has at least 10 material categories", () => {
    expect(categories.length).toBeGreaterThanOrEqual(10);
  });

  it.each(categories)("%s has positive inspection interval", (cat) => {
    expect(maintenanceSchedules[cat].inspectionIntervalMonths).toBeGreaterThan(0);
  });

  it.each(categories)("%s has positive expected life", (cat) => {
    expect(maintenanceSchedules[cat].expectedLifeYears).toBeGreaterThan(0);
  });

  it.each(categories)("%s has non-empty Finnish notes", (cat) => {
    expect(maintenanceSchedules[cat].maintenanceNotes_fi.length).toBeGreaterThan(0);
  });

  it.each(categories)("%s has non-empty English notes", (cat) => {
    expect(maintenanceSchedules[cat].maintenanceNotes_en.length).toBeGreaterThan(0);
  });

  it("foundation has the longest expected life", () => {
    const lifetimes = categories.map((c) => maintenanceSchedules[c].expectedLifeYears);
    const maxLife = Math.max(...lifetimes);
    expect(maintenanceSchedules["foundation"].expectedLifeYears).toBe(maxLife);
  });

  it("paint has the shortest expected life", () => {
    const lifetimes = categories.map((c) => maintenanceSchedules[c].expectedLifeYears);
    const minLife = Math.min(...lifetimes);
    expect(maintenanceSchedules["paint"].expectedLifeYears).toBe(minLife);
  });

  it("inspection intervals are multiples of 12", () => {
    for (const cat of categories) {
      expect(maintenanceSchedules[cat].inspectionIntervalMonths % 12).toBe(0);
    }
  });
});

describe("defaultSchedule", () => {
  it("has 24-month inspection interval", () => {
    expect(defaultSchedule.inspectionIntervalMonths).toBe(24);
  });

  it("has 30-year expected life", () => {
    expect(defaultSchedule.expectedLifeYears).toBe(30);
  });

  it("has bilingual notes", () => {
    expect(defaultSchedule.maintenanceNotes_fi.length).toBeGreaterThan(0);
    expect(defaultSchedule.maintenanceNotes_en.length).toBeGreaterThan(0);
  });
});

describe("getScheduleForCategory", () => {
  it("returns the correct schedule for a known category", () => {
    const result = getScheduleForCategory("lumber");
    expect(result).toBe(maintenanceSchedules["lumber"]);
    expect(result.inspectionIntervalMonths).toBe(12);
  });

  it("returns the correct schedule for roofing", () => {
    const result = getScheduleForCategory("roofing");
    expect(result.expectedLifeYears).toBe(40);
  });

  it("returns default schedule for unknown category", () => {
    const result = getScheduleForCategory("unknown_material");
    expect(result).toBe(defaultSchedule);
  });

  it("returns default schedule for empty string", () => {
    expect(getScheduleForCategory("")).toBe(defaultSchedule);
  });

  it("is case-sensitive", () => {
    expect(getScheduleForCategory("Lumber")).toBe(defaultSchedule);
  });
});
