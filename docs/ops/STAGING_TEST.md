# AutoLister OS staging test

## Open and sign in

Open [the staging app](https://autolister-os-staging-git-ded8a3-ahmed-samis-projects-e6ef0336.vercel.app/app) on desktop Chrome. This is the feature branch Preview in a separate Vercel project, connected only to Supabase project `mchrnwwydjddqsdghqtl`.

Select **Sign in** and enter the email address on your **AutoLister Staging Supabase organization** account. Open the link in the email on the same desktop browser. The staging project uses Supabase's built-in mail delivery, which only sends to organization team addresses and has a low rate limit. No password is needed for the web app. After sign-in, choose **Create workspace** if none is listed. Use a clearly named personal test workspace and test garments.

If no email arrives, check spam once, wait for the rate limit, and report the exact on-screen error. Do not use a customer address. The phone pairing flow does not require a second email login.

## Main flow on desktop and phone

1. On desktop, open **Inventory**, then **Add new stock**. Save one test garment and note its SKU. You can also use **Import existing stock from CSV** with a test-only file.
2. Open that item's **Capture** page, choose **Start capture**, then **Pair phone**. A QR code appears for five minutes and is single-use.
3. On your phone, scan the QR code with the camera and open the `/app/phone` URL. Allow camera access, photograph the test garment, and wait for the upload to show as saved. Keep the desktop page open. Use **Finish capture** on desktop.
4. Open **Listings**, select the item, confirm its facts, prepare and approve a draft. Use the manual or assisted handoff preview only. Do not submit a real listing to a marketplace.
5. In **Orders**, create a clearly synthetic manual order for that item and reserve it. In **Pick**, create a wave, claim and verify the SKU. In **Pack**, start packing, scan or type the SKU, and use a test PDF for the label. A handover records a local workflow event, so mark it as a test only.
6. In **Returns**, record a test return against that synthetic order, inspect the item and choose restock if its condition allows. Check that the original garment remains in **Inventory**. **Today** and **Reports** should reflect the saved work.

The live staging API and private Storage paths for these operations passed with synthetic records. The physical camera, Chrome extension, printer and real seller workflow still need your device test. No payment, carrier or marketplace integration is enabled for this test.

## Staging extension on desktop Chrome

1. Open `chrome://extensions` in Chrome, enable **Developer mode**, choose **Load unpacked**, and select `C:\Users\Sami\Downloads\AutoLister Staging Extension`.
2. Confirm the extension is named **AutoLister Staging** and its ID is `olpodlemebcdiklhjfemgdongmidnajb`. Its ID is separate from the published extension.
3. Open the extension popup and enter the same staging organization email. The staging build requests an email sign-in link directly from staging Supabase. Follow its link or enter the six-digit code if the email supplies one. Return to the popup and confirm it shows your account.
4. In the staging app's listing review, use **Prepare handoff**. Confirm the preview contains only your test listing and images. The extension may fill supported fields on a marketplace page, but do not submit, publish or perform any real marketplace action.

If Chrome reports a different extension ID, stop before sign-in. The exact staging callback allowlist is `chrome-extension://olpodlemebcdiklhjfemgdongmidnajb/callback.html`.

## Boundaries

Staging has its own database, Auth users, private Storage buckets and Vercel project. Its cron jobs are disabled. A Vercel deployment labelled Production was auto-created inside this isolated staging project during setup; the existing customer production project and `main` were not deployed or migrated. AI extraction, official marketplace access, payments, real shipping and customer mail are outside this test.
