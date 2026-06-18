/**
 * Aura KB role-clearance lattice tests.
 */

import { describe, expect, it } from "vitest";
import { clearedFloors, clears, AURA_FLOORS } from "../src/aura-rbac.js";

describe("clearedFloors", () => {
  it("ae clears transversal + comercial_kam only", () => {
    expect(clearedFloors("ae")).toEqual(["transversal", "comercial_kam"]);
  });

  it("gerente clears up through restringido_senior", () => {
    expect(clearedFloors("gerente")).toEqual([
      "transversal",
      "comercial_kam",
      "estrategia_research",
      "restringido_senior",
    ]);
  });

  it("director clears restringido_senior but not direccion_clevel", () => {
    expect(clearedFloors("director")).toContain("restringido_senior");
    expect(clearedFloors("director")).not.toContain("direccion_clevel");
  });

  it("vp clears every floor", () => {
    expect(clearedFloors("vp")).toEqual([...AURA_FLOORS]);
  });

  it("unknown role gets transversal only (fail-closed)", () => {
    expect(clearedFloors("intern")).toEqual(["transversal"]);
  });
});

describe("clears", () => {
  it("ae cannot read restringido_senior (war room)", () => {
    expect(clears("ae", "restringido_senior")).toBe(false);
  });

  it("gerente + director read estrategia_research and restringido_senior", () => {
    for (const role of ["gerente", "director"]) {
      expect(clears(role, "estrategia_research")).toBe(true);
      expect(clears(role, "restringido_senior")).toBe(true);
    }
  });

  it("ae reads comercial_kam and transversal", () => {
    expect(clears("ae", "comercial_kam")).toBe(true);
    expect(clears("ae", "transversal")).toBe(true);
  });

  it("an untagged asset (null floor) is unrestricted", () => {
    expect(clears("ae", null)).toBe(true);
    expect(clears("ae", undefined)).toBe(true);
  });

  it("an unrecognized floor is un-clearable even for vp (fail-closed)", () => {
    expect(clears("vp", "top_secret")).toBe(false);
  });
});
