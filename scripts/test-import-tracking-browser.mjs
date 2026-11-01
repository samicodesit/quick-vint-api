import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
process.env.DRAFT_BROWSER_HARNESS_ONLY = '1';
const {reviewJourney:h} = await import('./test-local-browser-drafts.mjs');
const {page,context,browser,click,upload} = h;
const events=[];
context.on('request',request=>{
 if(new URL(request.url()).pathname==='/api/events/track') {
  const body=request.postDataJSON(); events.push(...(body.events||[body]));
 }
});
try {
 await page.goto((process.env.DRAFT_BROWSER_URL||'http://127.0.0.1:4331')+'/app');
 await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
 await click('new'); await upload(3);
 for(let i=0;i<100&&!events.some(e=>e.event==='upload_complete');i++) await page.waitForTimeout(50);
 const imports=events.filter(e=>e.event==='upload_complete');
 assert.equal(imports.length,1,'One event per selected import');
 assert.equal(imports[0].context.imageCount,3);
 assert.equal(imports[0].context.totalCount,3);
 assert.equal(imports[0].context.failedPhotoCount,0);
 assert.equal(imports[0].context.phase,'local_import');
 assert.equal(imports[0].context.resultStatus,'completed');
 assert.ok(imports[0].context.operationId);
 assert.equal(h.stats().uploadCount,0,'Adding local draft photos is not a network upload');
 await page.locator('[data-draft-input="item"]').first().setInputFiles([
  {name:'good.png',mimeType:'image/png',buffer:await readFile(new URL('../docs/qa/browser-drafts/sample-front.png',import.meta.url))},
  {name:'damaged.png',mimeType:'image/png',buffer:Buffer.from('invalid image')},
 ]);
 for(let i=0;i<100&&events.filter(e=>e.event==='upload_complete').length<2;i++) await page.waitForTimeout(50);
 const partial=events.filter(e=>e.event==='upload_complete')[1];
 assert.equal(partial.context.resultStatus,'partial');
 assert.equal(partial.context.imageCount,1);
 assert.equal(partial.context.failedPhotoCount,1);
 assert.equal(partial.context.totalCount,2);
 assert.notEqual(partial.context.operationId,imports[0].context.operationId);
 console.log('Three selected photos saved locally, one bounded import result, zero server uploads.');
 console.log('Mixed valid/corrupt selection reports one partial result with exact success/failure counts.');
} finally { await browser.close(); }
