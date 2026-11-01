import { createHash } from "node:crypto";

export const MODEL_CATALOG_VERSION = 1;
export const MODEL_PROMPT_VERSION = 1;
export interface ModelPreferences {
  gender: "male" | "female";
  hair: "black" | "blonde" | "brown" | "red";
  heightCm: number;
  build: "slim" | "average" | "plus_size";
  skinTone: "tone_1" | "tone_2" | "tone_3" | "tone_4" | "tone_5" | "tone_6";
}
export function parseModelPreferences(raw: unknown): ModelPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Choose your model preferences.");
  const p = raw as Record<string, unknown>;
  const options: Record<string, readonly string[]> = {
    gender: ["male", "female"],
    hair: ["black", "blonde", "brown", "red"],
    build: ["slim", "average", "plus_size"],
    skinTone: ["tone_1", "tone_2", "tone_3", "tone_4", "tone_5", "tone_6"],
  };
  if (
    Object.keys(p).some(
      (k) => ![...Object.keys(options), "heightCm"].includes(k),
    )
  )
    throw new Error("Unknown model preference.");
  for (const [key, values] of Object.entries(options))
    if (!values.includes(p[key] as string))
      throw new Error("Choose every model preference.");
  if (
    typeof p.heightCm !== "number" ||
    !Number.isInteger(p.heightCm) ||
    p.heightCm < 130 ||
    p.heightCm > 210
  )
    throw new Error("Height must be between 130 and 210 cm.");
  return {
    gender: p.gender,
    hair: p.hair,
    build: p.build,
    heightCm: p.heightCm,
    skinTone: p.skinTone,
  } as ModelPreferences;
}
const furniture = {
  dressing_corner: ["stool", "low_chest", "none"],
  bedroom_edge: ["bedside_table", "low_chest", "none"],
  living_corner: ["chair", "side_table", "none"],
  entryway: ["console", "bench", "none"],
} as const;
export function resolveModelScene(seed: string) {
  let counter = 0;
  // Rejection sampling avoids modulo bias and is stable across runtimes.
  const pick = <T>(items: readonly T[]): T => {
    const bound = Math.floor(0x100000000 / items.length) * items.length;
    let value: number;
    do {
      value = createHash("sha256")
        .update(seed + ":" + counter++)
        .digest()
        .readUInt32BE();
    } while (value >= bound);
    return items[value % items.length];
  };
  const room = pick(Object.keys(furniture) as (keyof typeof furniture)[]);
  const item = pick<string>(furniture[room]);
  const accents = ["none", "plant"];
  if (["low_chest", "bedside_table", "side_table", "console"].includes(item))
    accents.push("table_lamp");
  if (["bedroom_edge", "living_corner"].includes(room))
    accents.push("floor_lamp");
  const accent = pick(accents);
  const window = pick(["outside_frame", "partial_left", "partial_right"]);
  return {
    room,
    wall: pick([
      "warm_white",
      "cream",
      "light_beige",
      "warm_grey",
      "pale_sage",
      "muted_greige",
    ]),
    floor: pick([
      "pale_oak",
      "medium_oak",
      "walnut",
      ...(["entryway", "dressing_corner"].includes(room)
        ? ["light_stone_tile"]
        : []),
    ]),
    mirror: pick(["rectangular", "soft_arch"]),
    frame: pick(["natural_oak", "dark_wood", "matte_black"]),
    furniture: item,
    accent,
    plant:
      accent === "plant"
        ? pick(["snake_plant", "zz_plant", "rubber_plant"])
        : null,
    window,
    lightDirection:
      window === "partial_left"
        ? "left"
        : window === "partial_right"
          ? "right"
          : pick(["left", "right"]),
    lighting: pick(["soft_overcast", "gentle_morning", "diffused_afternoon"]),
    arrangement: pick(["left", "right"]),
    position: pick(["centered", "slightly_offset"]),
    phoneCase: pick(["black", "charcoal", "dark_taupe"]),
  };
}
export type ModelScene = ReturnType<typeof resolveModelScene>;
export function sceneFingerprint(scene: ModelScene) {
  return createHash("sha256").update(JSON.stringify(scene)).digest("hex");
}
export function compileModelPrompt(p: ModelPreferences, s: ModelScene): string {
  const words = (value: string) => value.replace(/_/g, " ");
  const tones = {
    tone_1: "very fair",
    tone_2: "fair",
    tone_3: "medium tan",
    tone_4: "medium brown",
    tone_5: "dark brown",
    tone_6: "deep brown",
  };
  return [
    "Create one very realistic ordinary smartphone mirror selfie of a fictional adult around 30. Not a studio or fashion campaign.",
    `The adult is ${p.gender}, with ${p.hair} hair, ${tones[p.skinTone]} skin, ${words(p.build)} build and approximately ${p.heightCm} cm tall. Keep believable adult anatomy and proportions.`,
    "Portrait 2:3 composition. A full-length mirror shows the TOP OF HAIR, ENTIRE BODY and BOTH complete shoes, with clear floor margin beneath the shoes and headroom above the hair. Step far enough back to fit everything. Never crop feet, shoes or hair.",
    `Natural relaxed standing pose, ${words(s.position)}, one hand holding a phone with a ${words(s.phoneCase)} case in front of the central face, the other arm relaxed. Physically plausible grip, fingers and reflection. The phone naturally obscures central facial features so this is not a clear visible-face portrait. Forehead, ears, cheeks, jaw, chin, partial eyebrows and small eye-edge fragments are acceptable. Do not enlarge the phone unnaturally or force complete face concealment.`,
    "Wear a plain fitted off-white crewneck T-shirt, straight charcoal trousers and clean white trainers. Fully dressed, no logos, no jewelry, no text or watermark.",
    `Simple realistic home ${words(s.room)}. ${words(s.wall)} painted walls, ${words(s.floor)} floor. One ${words(s.mirror)} full-length mirror with a thin ${words(s.frame)} frame.`,
    s.furniture === "none"
      ? "No furniture in view."
      : `One modest ${words(s.furniture)} in the background to the ${s.arrangement}, away from the person's silhouette.`,
    s.accent === "none"
      ? "No decorative accents."
      : `Only one accent: ${words(s.plant || s.accent)}${s.accent === "table_lamp" ? " on the furniture" : ""}, beside the background furniture area, not overlapping the person.`,
    s.window === "outside_frame"
      ? "The window is outside the image."
      : `A small part of a window is visible on the ${s.lightDirection}, with plain off-white linen curtains.`,
    `Natural ${words(s.lighting)} window light from the ${s.lightDirection}; coherent soft shadows and mirror reflection. Subtle skin texture, realistic fabric and everyday imperfections. Calm modest lived-in room, uncluttered floor. No other mirrors or people, no showroom styling, no heavy blur, no exaggerated wide-angle distortion.`,
  ].join("\n");
}
