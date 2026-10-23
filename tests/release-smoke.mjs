import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const origin=process.env.RELEASE_SMOKE_ORIGIN || 'http://127.0.0.1:3196';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Use a local production server');
const output=process.env.RELEASE_SMOKE_OUTPUT;
const report={environment:'Local production build; synthetic public configuration; no hosted access',routes:[],sprites:0,browser:[],errors:[],failedResources:[]};
for(const route of ['/','/sign-in','/register','/forgot-password','/reset-password','/auth/error','/demo']){
 const response=await fetch(origin+route);assert.equal(response.status,200,route);
 assert.match(response.headers.get('content-type'),/text\/html/);
 const text=await response.text();assert.ok(!text.includes('/Users/'),route);report.routes.push(route);
}
const protectedRoute=await fetch(origin+'/home',{redirect:'manual'});
assert.match(protectedRoute.headers.get('location')||await protectedRoute.text(),/\/sign-in\?next=/);report.routes.push('/home → sign-in');
for(const route of ['/auth/callback','/auth/confirm']){
 const response=await fetch(origin+route,{redirect:'manual'});assert.equal(response.status,307);
 assert.equal(new URL(response.headers.get('location'),origin).pathname,'/auth/error');report.routes.push(route+' → safe error');
}
const hashes=JSON.parse(await readFile(new URL('../scripts/lib/room-runtime-hashes.json',import.meta.url)));
for(const [asset,hash] of Object.entries(hashes)){
 const response=await fetch(origin+asset);assert.equal(response.status,200,asset);
 assert.match(response.headers.get('content-type'),/image\/png/);
 assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),hash,asset);report.sprites++;
}
assert.equal(report.sprites,67);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext();
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===origin)report.failedResources.push(new URL(r.url()).pathname+':'+r.status());});
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  let composition;
  for(const route of ['/','/sign-in','/register']){
   await page.goto(origin+route);await expect(page.locator('.example-room figcaption')).toHaveText('Make a space of your own');
   const images=page.locator('.example-room svg image');await expect(images).toHaveCount(16);
   const hrefs=await images.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')).sort());
   if(composition)assert.deepEqual(hrefs,composition);else composition=hrefs;
   await expect(page.locator('.example-room [data-room-id]')).toHaveCount(0);
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.example-room svg image')).length===16);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(route!=='/')await expect(page.getByLabel('Email address')).toBeVisible();
   if(output){await mkdir(output,{recursive:true});await page.screenshot({path:output+'/'+(route==='/'?'landing':route.slice(1))+'-'+width+'.png',fullPage:true});}
   report.browser.push(route+' '+width+': shared 16-object read-only example, forms, scripts/styles, no overflow');
  }
 }
 await page.goto(origin);await page.getByRole('link',{name:'Sign In',exact:true}).click();await expect(page).toHaveURL(origin+'/sign-in');
 await page.getByRole('link',{name:'Create an account',exact:true}).click();await expect(page).toHaveURL(origin+'/register');
 await page.goBack();await expect(page).toHaveURL(origin+'/sign-in');await page.reload();await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
 report.browser.push('Public → Sign In → Register, Back and refresh');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedResources,[]);
}finally{await browser.close();if(output)await writeFile(output+'/smoke-report.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
