import "../../../public/telemetry-registry.js";
import "../../../public/telemetry-core.js";
import "../../../public/telemetry-client.js";
import "../../../public/telemetry-website.js";
import { getBrowserSession } from "./auth";

/** Reuse the site's durable queue. Tokens stay in request headers. */
export function initializeMobileTelemetry(): void {
  const runtime = (globalThis as any).AutoListerWebsiteTelemetry;
  runtime?.setIdentityProvider(async () => {
    const session = await getBrowserSession().catch(() => null);
    return session
      ? { id: session.user.id, token: session.access_token }
      : null;
  });
}
