# Localization System (i18n)

## Overview

This project uses a lightweight, client-side internationalization system for the static website. Currently supports **English (en)**, **French (fr)**, and **German (de)**.

## Architecture

### File Structure

```
public/
├── locales/
│   ├── en.json          # English translations (reference)
│   ├── fr.json          # French translations
│   └── de.json          # German translations
├── js/
│   └── i18n.js          # Translation engine
└── [html files]         # Use data-i18n attributes
```

### How It Works

1. **Auto-detection**: System detects user's language from:

   - URL parameter (`?lang=fr`)
   - localStorage (remembers previous choice)
   - Browser language
   - Falls back to English

2. **Translation Loading**: Fetches appropriate JSON file on page load

3. **DOM Updates**: Replaces content for elements with `data-i18n` attributes

4. **Language Switching**: Users can switch languages via UI buttons

## Usage in HTML Files

### 1. Include the i18n Script

Add this before closing `</body>` tag:

```html
<script src="/js/i18n.js"></script>
```

### 2. Add Translation Attributes

**For text content:**

```html
<h1 data-i18n="home.heroTitle">Turn Photos Into Perfect Vinted Listings</h1>
<p data-i18n="home.heroSubtitle">Stop wasting time...</p>
```

**For attributes (placeholder, title, aria-label):**

```html
<input
  type="email"
  data-i18n-attr="placeholder:common.email,aria-label:common.emailLabel"
/>

<button
  data-i18n="nav.getExtension"
  data-i18n-attr="aria-label:nav.getExtensionLabel"
>
  Get Extension
</button>
```

**For meta tags:**
Meta tags are automatically updated from translation keys:

- `home.metaTitle` → `<title>`
- `home.metaDescription` → `<meta name="description">`
- `home.ogTitle` → `<meta property="og:title">`
- etc.

### 3. Language Switcher

The system automatically creates a language switcher in the navigation. You can also add custom switchers:

```html
<div id="language-switcher">
  <button data-lang="en">EN</button>
  <button data-lang="fr">FR</button>
  <button data-lang="de">DE</button>
</div>
```

## Translation File Structure

Translations use nested JSON for organization:

```json
{
  "nav": {
    "features": "Features",
    "pricing": "Pricing"
  },
  "home": {
    "heroTitle": "Turn Photos Into Perfect Listings",
    "features": {
      "title": "Features Built For Real Sellers",
      "instant": {
        "title": "Instant Generation"
      }
    }
  }
}
```

Access nested keys with dot notation: `data-i18n="home.features.instant.title"`

## Development Workflow

### Adding New Translations

1. **Add to English** (`public/locales/en.json`):

   ```json
   {
     "new": {
       "section": "My New Section"
     }
   }
   ```

2. **Add to French** (`public/locales/fr.json`):

   ```json
   {
     "new": {
       "section": "Ma nouvelle section"
     }
   }
   ```

3. **Add to German** (`public/locales/de.json`):

   ```json
   {
     "new": {
       "section": "Mein neuer Bereich"
     }
   }
   ```

4. **Validate all files have matching keys**:

   ```bash
   pnpm run build:locales
   ```

5. **Use in HTML**:
   ```html
   <h2 data-i18n="new.section">My New Section</h2>
   ```

### Testing Different Languages

**Method 1: URL Parameter**

```
http://localhost:8000/?lang=fr
http://localhost:8000/?lang=de
```

**Method 2: Browser Console**

```javascript
i18n.switchLanguage("fr");
i18n.switchLanguage("de");
i18n.getCurrentLanguage(); // Check current language
```

**Method 3: Language Switcher Buttons**
Click the EN/FR/DE buttons in the navigation.

## Local Development

### Start Dev Server

```bash
# For API and static files together
pnpm run dev

# For static files only (faster)
pnpm run dev:public
```

Then open: `http://localhost:8000`

### Validate Translations

```bash
pnpm run build:locales
```

This checks that all language files have the same keys as English.

## API Integration

The i18n system is client-side only for the **website**. The API (Vercel functions) remains English-only. However:

- Language detection can inform API requests
- Future: Pass `Accept-Language` header to API for localized error messages

## Adding a New Language

1. **Create translation file**:

   ```bash
   cp public/locales/en.json public/locales/es.json
   ```

2. **Translate all strings** in `es.json`

3. **Update i18n.js**:

   ```javascript
   this.supportedLanguages = ["en", "fr", "de", "es"];
   ```

4. **Update validation script**:

   ```javascript
   const LANGUAGES = ["en", "fr", "de", "es"];
   ```

5. **Add language switcher button**:

   ```html
   <button data-lang="es">ES</button>
   ```

6. **Validate**:
   ```bash
   pnpm run build:locales
   ```

## Best Practices

1. **Always use English as reference**: Other languages should match English keys
2. **Keep keys semantic**: Use `home.heroTitle` not `h1Text1`
3. **Organize by page/section**: Group related translations
4. **Test all languages**: Check layout doesn't break with longer translations (German!)
5. **Validate regularly**: Run `pnpm run build:locales` before committing

## Troubleshooting

**Translations not showing:**

- Check browser console for errors
- Verify translation key exists in JSON file
- Check `data-i18n` attribute spelling
- Ensure i18n.js is loaded

**Language not switching:**

- Check `i18n.supportedLanguages` array
- Verify JSON file exists for that language
- Check browser console for fetch errors

**Layout breaks with translations:**

- Test with German (longest) and French (special characters)
- Use flexible CSS (avoid fixed widths)
- Check mobile responsiveness with all languages

## Future Enhancements

- [ ] Server-side rendering with language-specific URLs (`/fr/pricing`)
- [ ] RTL language support (Arabic, Hebrew)
- [ ] Lazy-load translations (only load when needed)
- [ ] Translation management UI for non-technical users
- [ ] Automated translation testing
- [ ] Currency localization for pricing (€ vs $)
- [ ] Date/number formatting per locale
