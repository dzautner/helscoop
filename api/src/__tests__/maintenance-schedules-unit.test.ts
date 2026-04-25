import { describe, it, expect } from "vitest";
import {
  maintenanceSchedules,
  defaultSchedule,
  getScheduleForCategory,
} from "../maintenance-schedules";

describe("maintenanceSchedules", () => {
  it("has entries for common categories", () => {
    const expected = [
      "lumber", "panels", "concrete", "steel", "insulation",
      "roofing", "windows", "doors", "plumbing", "electrical",
      "hvac", "foundation", "fasteners", "paint", "waterproofing",
    ];
    for (const cat of expected) {
      expect(maintenanceSchedules[cat]).toBeDefined();
    }
  });

  it("has 15 categories", () => {
    expect(Object.keys(maintenanceSchedules).length).toBe(15);
  });

  it("all entries have positive inspection intervals", () => {
    for (const [, schedule] of Object.entries(maintenanceSchedules)) {
      expect(schedule.inspectionIntervalMonths).toBeGreaterThan(0);
    }
  });

  it("all entries have positive expected life years", () => {
    for (const [, schedule] of Object.entries(maintenanceSchedules)) {
      expect(schedule.expectedLifeYears).toBeGreaterThan(0);
    }
  });

  it("all entries have Finnish instructions", () => {
    for (const [, schedule] of Object.entries(maintenanceSchedules)) {
      expect(schedule.maintenanceNotes_fi.length).toBeGreaterThan(0);
    }
  });

  it("all entries have English instructions", () => {
    for (const [, schedule] of Object.entries(maintenanceSchedules)) {
      expect(schedule.maintenanceNotes_en.length).toBeGreaterThan(0);
    }
  });

  it("foundation has longest expected life", () => {
    expect(maintenanceSchedules.foundation.expectedLifeYears).toBe(100);
  });

  it("paint has shortest expected life", () => {
    expect(maintenanceSchedules.paint.expectedLifeYears).toBe(10);
  });

  it("roofing requires annual inspection", () => {
    expect(maintenanceSchedules.roofing.inspectionIntervalMonths).toBe(12);
  });

  it("concrete has 5-year inspection interval", () => {
    expect(maintenanceSchedules.concrete.inspectionIntervalMonths).toBe(60);
  });
});

describe("defaultSchedule", () => {
  it("has 24-month inspection interval", () => {
    expect(defaultSchedule.inspectionIntervalMonths).toBe(24);
  });

  it("has 30-year expected life", () => {
    expect(defaultSchedule.expectedLifeYears).toBe(30);
  });

  it("has Finnish notes", () => {
    expect(defaultSchedule.maintenanceNotes_fi.length).toBeGreaterThan(0);
  });

  it("has English notes", () => {
    expect(defaultSchedule.maintenanceNotes_en.length).toBeGreaterThan(0);
  });
});

describe("getScheduleForCategory", () => {
  it("returns lumber schedule for lumber", () => {
    const result = getScheduleForCategory("lumber");
    expect(result).toBe(maintenanceSchedules.lumber);
  });

  it("returns roofing schedule for roofing", () => {
    const result = getScheduleForCategory("roofing");
    expect(result).toBe(maintenanceSchedules.roofing);
  });

  it("returns default for unknown category", () => {
    const result = getScheduleForCategory("unknown_material");
    expect(result).toBe(defaultSchedule);
  });

  it("returns default for empty string", () => {
    const result = getScheduleForCategory("");
    expect(result).toBe(defaultSchedule);
  });
});
