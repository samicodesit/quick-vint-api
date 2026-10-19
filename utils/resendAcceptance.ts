/** Resend returns provider failures as values, not only rejected promises. */
export function assertResendAccepted(
  result:
    | {
        data?: { id?: string } | null;
        error?: { message?: string } | null;
      }
    | undefined,
): void {
  if (result?.error || !result?.data?.id) {
    throw new Error(
      result?.error?.message || "Email provider did not accept the message",
    );
  }
}
