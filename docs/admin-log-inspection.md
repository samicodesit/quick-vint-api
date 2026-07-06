# Admin Log Inspection

Use this workflow when investigating a user's generation quality, edits, offer
flow, or suspicious activity.

## Inspect a user's latest generation

```bash
ADMIN_SECRET="..." pnpm run ops:inspect-generation -- user@example.com
```

The script writes files under:

```text
/tmp/autolister-admin-log-inspection/user@example.com/
```

Important outputs:

- `summary.json`: safe summary of the selected generation, nearby edit events,
  and saved image files.
- `logs-list.json`: recent admin log rows returned by `view-logs`.
- `generation-log.json`: full generation log when `log-detail` is fast enough.
- `images/`: prompt images extracted from `api_logs.image_urls`. These are the
  exact images sent to the AI prompt.

If `log-detail` times out, use the list row plus saved prompt images first. The
detail route selects heavy JSON/image fields and can timeout on some rows.

## Choose an older generation

Successful generations are ordered newest first.

```bash
ADMIN_SECRET="..." pnpm run ops:inspect-generation -- user@example.com --index 1
```

## What to check

- `generation.image_count`
- `generation.generated_title`
- `generation.generated_description`
- `generation.openai_prompt_tokens`
- `generation.openai_completion_tokens`
- `saved_images[].filePath`
- nearby `generation_output_edited` events after the generation

Open the files in `images/` to inspect exactly what the model saw.

## Image metadata in new extension versions

Newer extension builds include `imageMetadata` in `full_request_body`.

Useful fields:

- `domNaturalWidth` / `domNaturalHeight`: dimensions of the image element Vinted
  rendered in the listing form.
- `renderedWidth` / `renderedHeight`: visible size on the page.
- `sourceSelection`: `current_src` or `srcset_best`.
- `sourceUrl`: remote image URL without query string, when available.
- `inputWidth` / `inputHeight`: dimensions loaded by AutoLister before canvas
  compression.
- `outputWidth` / `outputHeight`: dimensions sent to the AI prompt.
- `outputBytes`: approximate JPEG payload size.
- `resized`: whether AutoLister downscaled the source before sending.

If `domNaturalWidth` and `inputWidth` are already small, the limiting factor is
the image Vinted exposed to the extension, not AutoLister's 1280px resize cap.
