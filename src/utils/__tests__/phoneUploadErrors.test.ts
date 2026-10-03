import { describe, expect, it } from "vitest";
import { classifyPhoneStorageError } from "../../../utils/phoneUploadErrors";
describe("phone storage error contract", () => {
  it("uses HTTP status separately from a named provider code", () => {
    expect(
      classifyPhoneStorageError({ status: 520, statusCode: "DatabaseError" }),
    ).toMatchObject({
      status: 503,
      code: "DatabaseError",
      retryable: true,
      missing: false,
    });
  });
  it("never treats missing buckets, tenants or generic HTTP 404 as missing sessions", () => {
    for (const statusCode of ["NoSuchBucket", "TenantNotFound", "404"])
      expect(
        classifyPhoneStorageError({ status: 404, statusCode }),
      ).toMatchObject({ missing: false, retryable: false });
  });
  it("requires object-missing evidence and a compatible HTTP response", () => {
    expect(
      classifyPhoneStorageError({ status: 404, statusCode: "NoSuchKey" })
        .missing,
    ).toBe(true);
    expect(
      classifyPhoneStorageError({
        status: 400,
        statusCode: "404",
        message: "Object not found",
      }).missing,
    ).toBe(true);
    expect(
      classifyPhoneStorageError({ status: 520, statusCode: "NoSuchKey" })
        .missing,
    ).toBe(false);
  });
  it("does not use a generic 409 as evidence of a creation conflict", () => {
    expect(
      classifyPhoneStorageError({ status: 409, statusCode: "OtherFailure" })
        .conflict,
    ).toBe(false);
    expect(
      classifyPhoneStorageError({
        status: 409,
        statusCode: "ResourceAlreadyExists",
      }).conflict,
    ).toBe(true);
  });
});
