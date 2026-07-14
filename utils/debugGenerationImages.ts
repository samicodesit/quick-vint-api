export function shouldStoreDebugGenerationImages(
  value = process.env.DEBUG_GENERATION_IMAGES,
) {
  return value === "true";
}
