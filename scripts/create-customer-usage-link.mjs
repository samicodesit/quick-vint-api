#!/usr/bin/env node
/* global Buffer, URL, console, process */
import crypto from "node:crypto";

const email = process.argv[2]?.trim().toLowerCase();
const daysArgIndex = process.argv.indexOf("--days");
const days =
  daysArgIndex >= 0 ? Number.parseInt(process.argv[daysArgIndex + 1], 10) : 120;
const baseUrl = process.env.AUTOLISTER_SITE_URL || "https://autolister.app";
const secret =
  process.env.CUSTOMER_USAGE_TOKEN_SECRET ||
  process.env.PRICING_OFFER_TOKEN_SECRET ||
  process.env.ADMIN_SECRET;

if (!email || !email.includes("@")) {
  console.error(
    "Usage: node scripts/create-customer-usage-link.mjs email@example.com [--days 120]",
  );
  process.exit(1);
}

if (!secret) {
  console.error(
    "Missing CUSTOMER_USAGE_TOKEN_SECRET, PRICING_OFFER_TOKEN_SECRET, or ADMIN_SECRET.",
  );
  process.exit(1);
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const expiresAt = new Date(
  Date.now() + (Number.isFinite(days) && days > 0 ? days : 120) * 864e5,
).toISOString();
const payload = {
  v: 1,
  email,
  expiresAt,
  issuedAt: new Date().toISOString(),
  source: "customer_usage_link",
};
const encodedPayload = base64UrlEncode(JSON.stringify(payload));
const signature = base64UrlEncode(
  crypto.createHmac("sha256", secret).update(encodedPayload).digest(),
);
const url = new URL("/customer-usage", baseUrl);
url.searchParams.set("token", `${encodedPayload}.${signature}`);

console.log(url.toString());
