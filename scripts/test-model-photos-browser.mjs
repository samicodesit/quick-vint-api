import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
process.env.DRAFT_BROWSER_HARNESS_ONLY = '1';
const { reviewJourney: h } = await import('./test-local-browser-drafts.mjs');
const { page, context, browser, click, upload, snapshot, bounds } = h;
await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='astro-dev-toolbar{display:none!important}';document.head.append(s);}));
const base = process.env.DRAFT_BROWSER_URL || 'http://127.0.0.1:4331';
const output = process.env.DRAFT_BROWSER_OUTPUT || '/tmp/autolister-model-photos';
await mkdir(output,{recursive:true});
const id = '11111111-2222-4333-8444-555555555555';
let state = 'preparing', retryCalls = 0, downloads = 0, generationInputs = [];
const primary = await readFile(process.env.MODEL_PHOTO_PRIMARY || new URL('../docs/qa/browser-drafts/sample-front.png',import.meta.url));
const secondary = await readFile(process.env.MODEL_PHOTO_SECONDARY || new URL('../docs/qa/browser-drafts/sample-detail.png',import.meta.url));
await context.route(`${base}/api/user/model`, route => route.fulfill({json:{enabled:true,listingPhotosAvailable:true,invitationState:'dismissed',model:{state:'ready',imageUrl:'/images/user-model-female.webp'}}}));
await context.route(`${base}/api/generate`,route=>{
 generationInputs.push(route.request().postDataJSON());
 return route.fulfill({json:{title:'Textured cropped jacket',description:'Textured jacket with a zip fastening. See original photos for condition.',modelPhotos:{jobId:id,status:'queued'}}});
});
await context.route(`${base}/api/listing-model-photos**`,route=>{
 if(route.request().method()==='POST'&&route.request().postDataJSON().action==='retry'){retryCalls++;state='generating';}
 return route.fulfill({json:{jobId:id,status:state,eligible:true,canRetry:state==='failed',...(state==='ready'?{photos:[{slot:'primary',url:'https://drafts-test.supabase.co/model/front.jpg'},{slot:'secondary',url:'https://drafts-test.supabase.co/model/back.jpg'}]}:{})}});
});
await context.route('https://drafts-test.supabase.co/model/**',async route=>{
 downloads++;await new Promise(resolve=>setTimeout(resolve,1800));
 return route.fulfill({contentType:'image/jpeg',body:route.request().url().includes('front')?primary:secondary});
});
async function screens(name){
 for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);await bounds(name+' '+device);
  await page.screenshot({path:`${output}/web-${name}-${device}.png`,fullPage:true});
 }
}
try{
 await page.goto(base+'/app');await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
 await click('new');
 if(process.env.MODEL_PHOTO_ORIGINAL){
  const original=await readFile(process.env.MODEL_PHOTO_ORIGINAL);
  await page.locator('[data-draft-input="item"]').first().setInputFiles([{name:'jacket-front.jpg',mimeType:'image/jpeg',buffer:original},{name:'jacket-detail.jpg',mimeType:'image/jpeg',buffer:original}]);
  await page.waitForFunction(()=>!document.querySelector('.draft-upload')&&!document.querySelector('[data-draft-action="generate"]').disabled);
 }else await upload(2);
 await screens('before');
 await click('generate');await page.getByText('Preparing your model…',{exact:true}).waitFor();
 await screens('preparing');
 assert.equal(await page.locator('[data-draft-action="copy-title"]').isEnabled(),true);
 state='generating';await page.getByText('Creating model photos…',{exact:true}).waitFor();await screens('generating');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.mp-placeholder').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 state='failed';await page.getByText('Couldn’t create model photos.',{exact:true}).waitFor();await screens('failure');
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await page.getByText('Creating model photos…',{exact:true}).waitFor();state='ready';
 await page.getByText('Adding model photos…',{exact:true}).waitFor();await screens('adding');
 await page.waitForFunction(()=>document.querySelectorAll('[data-draft-item-photos] .draft-photo').length===4);
 await screens('success');
 let stored=await snapshot();
 const ordered=stored.photos.sort((a,b)=>a.position-b.position);
 assert.deepEqual(ordered.map(p=>p.origin||'upload'),['model','model','upload','upload']);
 assert.equal(retryCalls,1);assert.equal(downloads,2);assert.equal(generationInputs[0].imageUrls.length,2);
 const generatedId=ordered[0].id;
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-draft-item-photos] .draft-photo').length===4);
 assert.equal(downloads,2,'reload uses local blobs');
 await page.locator('[data-model-compact]').click();await page.getByRole('dialog',{name:'Your model',exact:true}).waitFor();await screens('model-settings');
 assert.equal(h.stats().errors.length,0,h.stats().errors.join('\n'));
 await writeFile(`${output}/result.json`,JSON.stringify({local:true,checks:['text copy available during photos','localized preparation/generation/upload/failure','single explicit retry','two outputs ahead of originals','local blob reload','reduced motion','desktop/mobile layout'],downloads,retryCalls,generatedId},null,2));
 console.log('Model-photo browser journey passed. Screens: '+output);
}catch(error){await page.screenshot({path:`${output}/failure-debug.png`,fullPage:true});console.error(await page.locator('body').innerText());throw error;}
finally{await browser.close();}
