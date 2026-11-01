import { chromium } from "../../user-model-extension/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync } from "node:fs";
const phase = process.argv[2] || "after";
if (!["before", "after"].includes(phase)) throw Error("Invalid phase");
const dir = "../../reports/release-preparation-20261101";
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({headless:true});
try {
  for (const [name, width, height] of [["desktop",1280,960],["mobile",390,844]]) {
    const page = await browser.newPage({viewport:{width,height}});
    await page.goto("http://127.0.0.1:4332/privacy", {waitUntil:"networkidle"});
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({content:"html, body { scroll-behavior: auto !important; } astro-dev-toolbar { display:none !important; }"});
    const target = page.getByRole("heading", {name:phase === "after" ? "Your model and listing photos" : "Web app drafts and usage", exact:true});
    await target.evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 110));
    await page.waitForTimeout(300);
    await page.screenshot({path:dir + "/privacy-" + phase + "-" + name + ".png"});
    if (phase === "after") {
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({path:dir + "/privacy-after-top-" + name + ".png"});
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error("Horizontal overflow: " + name);
    await page.close();
  }
  if (phase === "after") {
    for (const [name,width] of [["desktop",1280],["mobile",390]]) {
      const page = await browser.newPage({viewport:{width:width*2+48,height:1040}});
      const src = file => "data:image/png;base64," + readFileSync(dir + "/" + file).toString("base64");
      await page.setContent('<html><style>body{margin:0;padding:16px;background:#eef0f3;font:16px system-ui;color:#18202a}main{display:flex;gap:16px}figure{margin:0}figcaption{font-weight:600;height:32px}img{display:block;width:'+width+'px}</style><main><figure><figcaption>Before</figcaption><img src="'+src("privacy-before-"+name+".png")+'"></figure><figure><figcaption>After, local candidate</figcaption><img src="'+src("privacy-after-top-"+name+".png")+'"></figure></main></html>');
      await page.screenshot({path:dir+"/privacy-comparison-"+name+".png",fullPage:true});
      await page.close();
    }
  }
} finally { await browser.close(); }
