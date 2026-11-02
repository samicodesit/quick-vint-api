import { uiCatalogs } from "../../app/mobile-web/ui";
import { sharedWebSources } from "../../app/mobile-web/sharedUiBindings";

/** Static build artifact shared with the standalone phone uploader. */
export const prerender = true;
export const GET = () =>
  new Response(
    `window.AutoListerWebUiCatalogs=${JSON.stringify(uiCatalogs)};window.AutoListerWebUiSharedSources=${JSON.stringify(sharedWebSources)};`,
    { headers: { "Content-Type": "application/javascript; charset=utf-8" } },
  );
