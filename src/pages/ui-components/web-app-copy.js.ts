import { uiCatalogs } from "../../app/mobile-web/ui";

/** Static build artifact shared with the standalone phone uploader. */
export const prerender = true;
export const GET = () =>
  new Response(
    `window.AutoListerWebUiCatalogs=${JSON.stringify(uiCatalogs)};`,
    { headers: { "Content-Type": "application/javascript; charset=utf-8" } },
  );
