# Shared web and extension translations

Edit translations once in quick-vint-api, then regenerate both consumers. The
browser extension bundles its copy and never downloads translation code at runtime.

## Sources of truth

| Source                       | Ownership                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `src/data/sharedUiCopy.json` | 24 shared messages with stable semantic IDs in all 18 locales                |
| `src/data/billingCopy.json`  | 21 existing billing messages in all 18 locales                               |
| `public/user-model-copy.js`  | Shared model-component copy; six common actions come from the common catalog |

`public/shared-ui-copy.js`, extension `lib/shared-ui-copy.js` and extension
`lib/user-model-copy.js` are synchronized artifacts. Do not edit the extension's
copies. Component-specific model copy belongs in the canonical model file.

The common messages cover actions, description length, title/description language,
seller note and its placeholder, and pause/support explanations. Consumers use
explicit mappings to semantic IDs. Do not deduplicate by English spelling alone.
The mappings use fixed consumer keys, so editing the canonical English wording
also reaches the web app and standalone uploader. Local English variants retain
their own wording.

Examples intentionally kept separate:

- Web `New` adds an item. Model `New` is a feature badge.
- The web generation action prepares a draft; the extension's action works in
  the marketplace. Each keeps its existing label.
- Compact web `Text`/`List` labels and extension `Paragraphs`/`Bullet points` can
  have different translations and space requirements.
- Tutorials, marketplace actions, saved-note scope, account recovery and listing
  examples retain their context-specific catalogs.

## One-edit workflow

From quick-vint-api, after editing a canonical source:

```sh
npm run translations:sync -- --extension-root /absolute/path/to/quick-vint
npm run translations:check -- --extension-root /absolute/path/to/quick-vint
```

The generator validates all 18 locales, nonempty strings and unchanged
placeholders before writing either bundle. It emits identical common/billing
bundles and mirrors the model-component file. `--check` never writes files.
The target checkout must already load the shared runtime before its consumers;
the generator refuses an older, unmigrated extension checkout.

From the extension checkout, the equivalent command is:

```sh
npm run translations:sync -- --source-root /absolute/path/to/quick-vint-api
```

For coordinated verification, set the paired checkout paths explicitly:

```sh
# In quick-vint-api:
AUTOLISTER_TRANSLATIONS_EXTENSION_ROOT=/absolute/path/to/quick-vint npm run verify:production
# In quick-vint:
AUTOLISTER_TRANSLATIONS_SOURCE_ROOT=/absolute/path/to/quick-vint-api AUTOLISTER_API_PATH=/absolute/path/to/quick-vint-api npm run verify:production
```

Web builds reject stale generated data. Extension production builds and packaging
verify the bundled data hash and the model-component hash. With the paired path,
they also compare against the current canonical source. A standalone checkout
can build offline against its checked-in snapshot; it cannot discover unpublished
changes in the other repository. Do not claim otherwise.

The locale adapters preserve each app's existing language-selection policy. Czech
`cs`, `cz` and regional variants resolve to the same common values. Unsupported
locales use English. User text, protocol enums, stored output preferences, prices
and usage limits are not translation inputs.

## Release behavior

Commit the source and generated changes together in each affected repository.
The web app receives them through its normal production deployment. Installed
extensions receive their bundled changes only after an extension update.
Changing the shared source does not remotely update installed extensions.

No extension version bump, package, store upload or production deployment is part
of the consolidation itself. Use each repository's normal approval and release
pipeline when shipping. The extension verification here uses Node 24 because
the installed Playwright runner fails to initialize with Node 22.17.1.
