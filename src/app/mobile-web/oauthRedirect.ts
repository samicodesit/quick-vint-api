export function safeOAuthRedirect(
  value: string,
  registered: string[],
): string | null {
  try {
    const target = new URL(value);
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.hash
    )
      return null;
    const match = registered.some((entry) => {
      const expected = new URL(entry);
      return (
        expected.protocol === "https:" &&
        !expected.username &&
        !expected.password &&
        !expected.hash &&
        target.origin === expected.origin &&
        target.pathname === expected.pathname &&
        [...expected.searchParams].every(
          ([key, val]) => target.searchParams.get(key) === val,
        )
      );
    });
    return match ? target.href : null;
  } catch {
    return null;
  }
}
