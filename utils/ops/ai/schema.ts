export const responseFormat = {
  type: "json_schema",
  name: "ops_garment_proposals",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "field",
            "valueText",
            "valueNumber",
            "valueUnit",
            "reason",
            "evidenceAssetIds",
            "labelText",
            "crop",
          ],
          properties: {
            field: {
              type: "string",
              enum: [
                "brand",
                "category",
                "size",
                "colour",
                "material",
                "condition",
                "measurement",
              ],
            },
            valueText: { type: ["string", "null"] },
            valueNumber: { type: ["number", "null"] },
            valueUnit: { type: ["string", "null"] },
            reason: {
              type: "string",
              enum: ["visible", "unreadable", "conflicting", "not_observed"],
            },
            evidenceAssetIds: { type: "array", items: { type: "string" } },
            labelText: { type: ["string", "null"] },
            crop: {
              type: ["object", "null"],
              additionalProperties: false,
              required: ["x", "y", "width", "height"],
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
} as const;
