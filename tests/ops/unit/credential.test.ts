import { describe, expect, it } from "vitest";
import {
  decryptCredential,
  encryptCredential,
} from "../../../utils/ops/admin/team";
describe("credential encryption", () => {
  it("round trips with authenticated encryption and refuses tampering", () => {
    const previous = process.env.OPS_CREDENTIAL_KEY;
    process.env.OPS_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      const stored = encryptCredential("secret-token");
      expect(stored).not.toContain("secret-token");
      expect(decryptCredential(stored)).toBe("secret-token");
      expect(() => decryptCredential(stored.slice(0, -2) + "aa")).toThrow();
    } finally {
      if (previous === undefined) delete process.env.OPS_CREDENTIAL_KEY;
      else process.env.OPS_CREDENTIAL_KEY = previous;
    }
  });
});
