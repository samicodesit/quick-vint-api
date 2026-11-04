import { createHash } from "node:crypto";

export const MODEL_CATALOG_VERSION = 2;
export const MODEL_PROMPT_VERSION = 2;
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
    phoneCase: pick([
      "black",
      "charcoal",
      "dark_taupe",
      "navy",
      "muted_green",
      "burgundy",
    ]),
    hairStyle: pick([
      "short_textured",
      "soft_waves",
      "straight_layers",
      "natural_curls",
      "close_crop",
      "tied_back",
    ]),
    age: pick([26, 30, 35, 40]),
    accessory: pick(["none", "none", "small_watch", "stud_earrings"]),
    skinDetail: pick([
      "ordinary uneven skin texture and fine natural arm hair",
      "a few faint freckles on the arms and natural skin texture",
      "subtle variation in skin tone across hands and arms",
      "fine natural lines at wrists and knuckles, with normal skin texture",
    ]),
    baseOutfit: pick([
      "a soft washed grey T-shirt, straight dark blue jeans and everyday white trainers",
      "a plain navy long-sleeved top, beige straight trousers and everyday trainers",
      "a plain white T-shirt, straight black jeans and simple dark trainers",
      "a plain beige T-shirt, dark straight trousers and simple white trainers",
    ]),
    homeDetail: pick(
      {
        bedroom_edge: [
          "a plain wardrobe and the edge of an unmade bed",
          "a bedside table and a radiator under the window",
        ],
        living_corner: [
          "the edge of an everyday sofa and a small bookcase",
          "a practical side table and the edge of a fabric armchair",
        ],
        entryway: [
          "a simple coat hook and a narrow shoe rack",
          "a small hallway bench and a wall socket",
        ],
        dressing_corner: [
          "a wardrobe door and a basket of folded clothes",
          "a plain chest of drawers and a clothes rail",
        ],
      }[room],
    ),
  };
}
export type ModelScene = ReturnType<typeof resolveModelScene>;
export function sceneFingerprint(scene: ModelScene) {
  return createHash("sha256").update(JSON.stringify(scene)).digest("hex");
}
export function compileModelPrompt(
  p: ModelPreferences,
  s: ModelScene,
  version = MODEL_PROMPT_VERSION,
): string {
  const words = (value: string) => value.replace(/_/g, " ");
  const tones = {
    tone_1: "very fair",
    tone_2: "fair",
    tone_3: "medium tan",
    tone_4: "medium brown",
    tone_5: "dark brown",
    tone_6: "deep brown",
  };
  const hairstyles: Record<string, string> = {
    short_textured: "a short textured haircut",
    soft_waves:
      p.gender === "female"
        ? "loose shoulder-length waves"
        : "medium-length wavy hair",
    straight_layers:
      p.gender === "female"
        ? "a straight chin-length bob"
        : "medium-length straight layers",
    natural_curls:
      p.gender === "female"
        ? "shoulder-length natural curls"
        : "short natural curls",
    close_crop:
      p.gender === "female"
        ? "a cropped pixie haircut"
        : "a close cropped haircut",
    tied_back:
      p.gender === "female"
        ? "hair loosely tied in a low ponytail"
        : "longer hair tied in a low bun",
  };
  if (version === 2)
    return [
      "An unretouched phone mirror snapshot at home, like an ordinary second-hand seller photographing an outfit.",
      `A fictional adult aged ${s.age}, ${p.gender}, ${p.hair} hair with ${hairstyles[s.hairStyle]}, ${tones[p.skinTone]} skin, ${words(p.build)} build, about ${p.heightCm} cm tall. Wearing ${s.baseOutfit}. ${s.accessory === "small_watch" ? "A small plain watch on the free wrist." : s.accessory === "stud_earrings" ? "Small simple stud earrings." : "No accessories."}`,
      `Standing comfortably, ${words(s.position)}, weight slightly on one leg, one arm relaxed and the other naturally holding a normal-sized phone with a ${words(s.phoneCase)} case in front of the central face. Central features are hidden; forehead, cheek, jaw and small eye-edge fragments are acceptable. Full body, top of hair and BOTH complete shoes visible with a little floor below the feet.`,
      `An ordinary home ${words(s.room)} with ${words(s.wall)} walls and ${words(s.floor)} flooring. A simple ${words(s.mirror)} mirror with a ${words(s.frame)} frame. In the background, ${s.homeDetail}.`,
      s.accent === "plant"
        ? `A ${words(s.plant!)} at the side of the room.`
        : s.accent === "floor_lamp"
          ? "A simple floor lamp at the side of the room."
          : "",
      `Ordinary phone auto-exposure with slightly uneven ${words(s.lighting)} daylight from the ${s.lightDirection}. ${s.skinDetail}; keep the chosen skin tone. Natural body contours, loose hair strands and clothing creases. Modest practical home, casual framing. No beauty smoothing, studio lights, showroom staging or artificial blur. One adult, one mirror photo, no text or logos.`,
    ].join("\n");
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
