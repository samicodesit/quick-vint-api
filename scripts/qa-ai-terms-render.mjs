import { chromium } from "../../user-model-extension/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const phase = process.argv[2] || "after";
if (!["before", "after"].includes(phase)) throw Error("Invalid phase");
const dir = "../../reports/ai-terms-20261101";
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [device, width, height] of [["desktop", 1280, 960], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    for (const [route, section] of [["terms", phase === "after" ? "AI-generated text and photos" : "2. Service Description"], ["privacy", "9. Fair Use Policy and Abuse Prevention"], ["support", phase === "after" ? "What if the AI gets text or photos wrong?" : "How do I manage my subscription or change my plan?"]]) {
      await page.goto("http://127.0.0.1:4332/" + route, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: "html,body{scroll-behavior:auto!important}astro-dev-toolbar{display:none!important}" });
      await page.screenshot({ path: `${dir}/${route}-${phase}-top-${device}.png` });
      await page.getByRole("heading", { name: section, exact: true }).evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100));
      await page.screenshot({ path: `${dir}/${route}-${phase}-${device}.png` });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Horizontal overflow: ${route} ${device}`);
      if (route === "terms" && phase === "after") {
        for (const [id, name] of [["refunds", "5. Cancellation, complaints and refunds"], ["liability", "7. Responsibility and liability"]]) {
          await page.getByRole("heading", { name, exact: true }).evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100));
          await page.screenshot({ path: `${dir}/${route}-${phase}-${id}-${device}.png` });
        }
      }
      if (phase === "after" && route === "privacy") {
        await page.getByText("Termination and refunds:", { exact: true }).evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200));
        await page.screenshot({ path: `${dir}/privacy-after-refunds-${device}.png` });
      }
      if (phase === "after" && route === "support") {
        await page.getByRole("heading", { name: "How do I manage my subscription or change my plan?", exact: true }).evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100));
        await page.screenshot({ path: `${dir}/support-after-cancellation-${device}.png` });
      }
      const links = await page.locator('a[href^="/billing-terms"],a[href="/withdraw"],a[href="/terms#ai-output"],a[href="/terms#refunds"]').evaluateAll(els => els.map(el => el.getAttribute("href")));
      for (const link of new Set(links)) {
        const result = await page.request.get("http://127.0.0.1:4332" + link.split("#")[0]);
        if (!result.ok()) throw Error("Broken legal link: " + link);
        if (link.includes("#") && !(await result.text()).includes(`id="${link.split("#")[1]}"`)) throw Error("Missing legal anchor: " + link);
      }
    }
    await page.close();
  }
  console.log(`Legal ${phase} desktop/mobile screenshots and links passed.`);
} finally {
  await browser.close();
}
