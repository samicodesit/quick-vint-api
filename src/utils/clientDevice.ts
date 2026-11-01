/** Shared phone/tablet detection, including iPadOS desktop browsing mode. */
export function isPhoneOrTablet(
  device: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">,
): boolean {
  return (
    /Android|iPhone|iPad|iPod/i.test(device.userAgent) ||
    (device.platform === "MacIntel" && device.maxTouchPoints > 1)
  );
}
