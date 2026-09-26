import type { ConfirmedFacts } from "../../../src/ops/contracts/listings";

export type TemplateLabels = {
  brand: string;
  size: string;
  colour: string;
  material: string;
  condition: string;
  measurements: string;
  defects: string;
};

export const templates: Record<
  "en" | "nl" | "fr" | "de" | "pl" | "es" | "it",
  TemplateLabels
> = {
  en: {
    brand: "Brand",
    size: "Size",
    colour: "Colour",
    material: "Material",
    condition: "Condition",
    measurements: "Measurements",
    defects: "Defects",
  },
  nl: {
    brand: "Merk",
    size: "Maat",
    colour: "Kleur",
    material: "Materiaal",
    condition: "Staat",
    measurements: "Afmetingen",
    defects: "Gebreken",
  },
  fr: {
    brand: "Marque",
    size: "Taille",
    colour: "Couleur",
    material: "Matière",
    condition: "État",
    measurements: "Mesures",
    defects: "Défauts",
  },
  de: {
    brand: "Marke",
    size: "Größe",
    colour: "Farbe",
    material: "Material",
    condition: "Zustand",
    measurements: "Maße",
    defects: "Mängel",
  },
  pl: {
    brand: "Marka",
    size: "Rozmiar",
    colour: "Kolor",
    material: "Materiał",
    condition: "Stan",
    measurements: "Wymiary",
    defects: "Wady",
  },
  es: {
    brand: "Marca",
    size: "Talla",
    colour: "Color",
    material: "Material",
    condition: "Estado",
    measurements: "Medidas",
    defects: "Defectos",
  },
  it: {
    brand: "Marca",
    size: "Taglia",
    colour: "Colore",
    material: "Materiale",
    condition: "Condizione",
    measurements: "Misure",
    defects: "Difetti",
  },
};

export function relevantFacts(facts: ConfirmedFacts) {
  return Object.fromEntries(
    Object.entries(facts).filter(
      ([, value]) =>
        value !== null && (!Array.isArray(value) || value.length > 0),
    ),
  );
}
