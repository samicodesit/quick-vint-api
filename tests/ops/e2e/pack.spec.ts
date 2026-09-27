import {expect,test} from "@playwright/test";
test("fixture packing requires scans and an associated PDF before handover",async({page})=>{
 const workspaceId="c0000000-0000-4000-8000-000000000001",orderId="b0000000-0000-4000-8000-000000001301",sessionId="b0000000-0000-4000-8000-000000001302",shipmentId="b0000000-0000-4000-8000-000000001303",labelId="b0000000-0000-4000-8000-000000001304";
 const user={id:"a0000000-0000-4000-8000-000000000001",aud:"authenticated",role:"authenticated",email:"fixture@example.test",app_metadata:{},user_metadata:{},created_at:"2026-09-26T00:00:00Z",updated_at:"2026-09-26T00:00:00Z"};
 let started=false,labelUploaded=false,attached=false,handed=false;const scans:string[]=[];
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript((fixtureUser)=>localStorage.setItem("sb-127-auth-token",JSON.stringify({access_token:"fixture.token.value",refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:fixtureUser})),user);
 await page.route("**/auth/v1/user",(route)=>route.fulfill({status:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify(user)}));
 await page.route("**/api/ops-label?**",async(route)=>{
  expect(route.request().method()).toBe("POST");
  expect(route.request().url()).toContain(`orderId=${orderId}`);
  labelUploaded=true;
  await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({labelId,orderId})});
 });
 await page.route("**/api/ops",async(route)=>{
  const body=route.request().postDataJSON() as {name:string;payload:Record<string,unknown>};let data:unknown;
  switch(body.name){
   case "workspace.list":data=[{workspaceId,role:"warehouse",name:"Fixture"}];break;
   case "order.list":data=handed?[]:[{id:orderId,status:"picking",ops_order_lines:[{id:"line-1"},{id:"line-2"}]}];break;
   case "pack.detail":data={session:started?{id:sessionId,shipment_id:shipmentId,status:attached?"ready":"open",label_id:attached?labelId:null}:null,
     lines:[{id:"line-1",item_code_snapshot:"SKU-1",title_snapshot:"First"},{id:"line-2",item_code_snapshot:"SKU-2",title_snapshot:"Second"}],
     scans:scans.map((code)=>({line_id:code==="SKU-1"?"line-1":"line-2"})),labels:labelUploaded?[{id:labelId,source:"manual_upload",created_at:new Date().toISOString()}]:[]};break;
   case "pack.start":expect(body.payload).toEqual({orderId});started=true;data={sessionId,shipmentId,status:"open"};break;
   case "pack.scan":expect(body.payload.sessionId).toBe(sessionId);scans.push(body.payload.itemCode as string);data={sessionId,scannedCount:scans.length};break;
   case "pack.label.attach":expect(body.payload).toEqual({sessionId,labelId});attached=true;data={sessionId,shipmentId,labelId,status:"ready"};break;
   case "shipment.handover":expect(body.payload).toEqual({shipmentId});handed=true;data={shipmentId,status:"handed_over"};break;
   default:throw new Error(`Unexpected fixture operation ${body.name}`);
  }
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,data,requestId:"fixture"})});
 });
 await page.goto("/app/pack");
 await page.getByRole("button",{name:/Order b0000000/}).click();
 await page.getByRole("button",{name:"Start pack"}).click();
 await expect(page.getByRole("button",{name:"Record physical handover"})).toBeDisabled();
 await page.getByLabel("Item code").fill("SKU-1");await page.getByRole("button",{name:"Scan into pack"}).click();
 await expect(page.getByText(/SKU-1: First Scanned/)).toBeVisible();
 await page.getByLabel("Item code").fill("SKU-2");await page.getByRole("button",{name:"Scan into pack"}).click();
 await expect(page.getByText(/SKU-2: Second Scanned/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Record physical handover"})).toBeDisabled();
 await page.getByLabel("Upload a PDF label for this order").setInputFiles({name:"label.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\nfixture")});
 await page.getByRole("button",{name:"Save PDF label"}).click();
 await page.getByRole("button",{name:"Attach to this pack"}).click();
 await expect(page.getByRole("button",{name:"Record physical handover"})).toBeEnabled();
 expect(handed).toBe(false);
 await page.getByRole("button",{name:"Record physical handover"}).click();
 await expect(page.getByText("Physical handover recorded.")).toBeVisible();
 expect(handed).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
