import { describe, it, expect } from "vitest";
import {
  parseModelPreferences,
  resolveModelScene,
  compileModelPrompt,
} from "../../../utils/userModelCatalog";
const preferences = {
  gender: "female",
  hair: "brown",
  heightCm: 170,
  build: "average",
  skinTone: "tone_3",
};
describe("model preferences and seeded scenes", () => {
  it("keeps the old recipe available while new models vary their everyday clothes and room details", () => {
    const p = parseModelPreferences(preferences);
    const scenes = Array.from({ length: 100 }, (_, n) =>
      resolveModelScene(`realism-${n}`),
    );
    expect(
      new Set(scenes.map((s) => (s as any).baseOutfit)).size,
    ).toBeGreaterThan(2);
    expect(
      new Set(scenes.map((s) => (s as any).homeDetail)).size,
    ).toBeGreaterThan(3);
    const scene = scenes[0];
    for (const key of ["hairStyle", "accessory", "skinDetail"]) {
      expect(new Set(scenes.map((s) => (s as any)[key])).size).toBeGreaterThan(
        1,
      );
    }
    expect(compileModelPrompt(p, scene)).toContain(
      "unretouched phone mirror snapshot",
    );
    expect(compileModelPrompt(p, scene, 1)).toContain(
      "plain fitted off-white crewneck T-shirt",
    );
  });
  it("requires explicit bounded typed choices and rejects extra input", () => {
    expect(parseModelPreferences(preferences)).toEqual(preferences);
    for (const patch of [
      { heightCm: 211 },
      { heightCm: "170" },
      { hair: "purple" },
      { gender: null },
      { skinTone: "tone_7" },
      { build: "athletic" },
      { prompt: "anything" },
    ]) {
      expect(() =>
        parseModelPreferences({ ...preferences, ...patch }),
      ).toThrow();
    }
  });
  it("samples compatible scenes reproducibly across thousands of seeds", () => {
    const fingerprints = new Set();
    for (let n = 0; n < 3000; n++) {
      const scene = resolveModelScene(`seed-${n}`);
      expect(resolveModelScene(`seed-${n}`)).toEqual(scene);
      if (scene.floor === "light_stone_tile")
        expect(["entryway", "dressing_corner"]).toContain(scene.room);
      if (scene.accent === "table_lamp")
        expect([
          "low_chest",
          "bedside_table",
          "side_table",
          "console",
        ]).toContain(scene.furniture);
      if (scene.accent === "floor_lamp")
        expect(["bedroom_edge", "living_corner"]).toContain(scene.room);
      if (scene.accent !== "plant") expect(scene.plant).toBeNull();
      fingerprints.add(JSON.stringify(scene));
    }
    expect(fingerprints.size).toBeGreaterThan(2900);
  });
  it("asks for both complete shoes and natural central-face coverage", () => {
    const prompt = compileModelPrompt(
      parseModelPreferences(preferences),
      resolveModelScene("example"),
    );
    expect(prompt).toContain("BOTH complete shoes");
    expect(prompt).toContain("small eye-edge fragments are acceptable");
    expect(prompt).toContain("fictional adult");
    expect(prompt).not.toContain("100% face");
  });
});
