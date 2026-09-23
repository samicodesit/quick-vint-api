import { describe, expect, it } from "vitest";
import { getMobileWebBuildConfig } from "../config";

describe("mobile web build configuration", () => {
  it("accepts an enabled build with a root HTTPS Supabase origin", () => {
    expect(
      getMobileWebBuildConfig({
        PUBLIC_MOBILE_WEB_APP_ENABLED: "true",
        PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toEqual({
      enabled: true,
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "anon-key",
    });
  });

  it("keeps the private documents disabled unless the exact flag is true", () => {
    expect(
      getMobileWebBuildConfig({
        PUBLIC_MOBILE_WEB_APP_ENABLED: "1",
        PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toEqual({
      enabled: false,
      supabaseUrl: null,
      supabaseAnonKey: null,
    });
  });

  it("rejects a non-HTTPS Supabase URL without exposing configuration values", () => {
    expect(() =>
      getMobileWebBuildConfig({
        PUBLIC_MOBILE_WEB_APP_ENABLED: "true",
        PUBLIC_SUPABASE_URL: "http://project.supabase.co",
        PUBLIC_SUPABASE_ANON_KEY: "private-anon-key",
      }),
    ).toThrow("invalid_supabase_url");
  });

  it.each([
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/rest/v1",
    "https://project.supabase.co/?redirect=elsewhere",
  ])("rejects an unsafe Supabase origin: %s", (supabaseUrl) => {
    expect(() =>
      getMobileWebBuildConfig({
        PUBLIC_MOBILE_WEB_APP_ENABLED: "true",
        PUBLIC_SUPABASE_URL: supabaseUrl,
        PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow("invalid_supabase_url");
  });

  it("rejects missing enabled-build values with stable non-secret error codes", () => {
    expect(() =>
      getMobileWebBuildConfig({
        PUBLIC_MOBILE_WEB_APP_ENABLED: "true",
        PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow("missing_supabase_url");

    expect(() =>
      getMobileWebBuildConfig({
        PUBLIC_MOBILE_WEB_APP_ENABLED: "true",
        PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        PUBLIC_SUPABASE_ANON_KEY: "   ",
      }),
    ).toThrow("missing_supabase_anon_key");
  });
});
