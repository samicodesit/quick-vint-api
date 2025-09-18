// Vinted Country URL mapping for create listing pages
// Based on Vinted's international domains and their create listing URLs

export const VINTED_DOMAINS = {
  // Main European markets
  'FR': 'vinted.fr',
  'DE': 'vinted.de', 
  'UK': 'vinted.co.uk',
  'ES': 'vinted.es',
  'IT': 'vinted.it',
  'BE': 'vinted.be',
  'NL': 'vinted.nl',
  'AT': 'vinted.at',
  'PL': 'vinted.pl',
  'CZ': 'vinted.cz',
  'LT': 'vinted.lt',
  'LV': 'vinted.lv',
  'LU': 'vinted.lu',
  'PT': 'vinted.pt',
  
  // North America
  'US': 'vinted.com',
  'CA': 'vinted.ca',
  
  // Default fallback
  'DEFAULT': 'vinted.com'
} as const;

export type VintedCountryCode = keyof typeof VINTED_DOMAINS;

/**
 * Get the appropriate Vinted create listing URL based on user's country
 * @param countryCode ISO 2-letter country code (e.g., 'FR', 'DE', 'US')
 * @returns Full URL to Vinted's create listing page for that country
 */
export function getVintedCreateListingUrl(countryCode?: string): string {
  const normalizedCountry = countryCode?.toUpperCase() as VintedCountryCode;
  const domain = VINTED_DOMAINS[normalizedCountry] || VINTED_DOMAINS.DEFAULT;
  
  // Vinted's create listing path is consistent across domains
  return `https://www.${domain}/items/new`;
}

/**
 * Detect user's country from various sources and redirect to appropriate Vinted
 * This can be used in the success page or as a utility function
 */
export function detectUserCountryAndGetVintedUrl(): string {
  // Try to detect country from browser/system
  let countryCode: string | undefined;
  
  // Method 1: Try navigator.language (e.g., 'fr-FR' -> 'FR')
  if (typeof navigator !== 'undefined' && navigator.language) {
    const parts = navigator.language.split('-');
    if (parts.length > 1) {
      countryCode = parts[1];
    }
  }
  
  // Method 2: Try Intl.DateTimeFormat (more reliable for country detection)
  if (!countryCode && typeof Intl !== 'undefined') {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Basic timezone to country mapping for major Vinted markets
      const timezoneToCountry: Record<string, string> = {
        'Europe/Paris': 'FR',
        'Europe/Berlin': 'DE',
        'Europe/London': 'UK',
        'Europe/Madrid': 'ES',
        'Europe/Rome': 'IT',
        'Europe/Brussels': 'BE',
        'Europe/Amsterdam': 'NL',
        'Europe/Vienna': 'AT',
        'Europe/Warsaw': 'PL',
        'Europe/Prague': 'CZ',
        'Europe/Vilnius': 'LT',
        'Europe/Riga': 'LV',
        'Europe/Luxembourg': 'LU',
        'Europe/Lisbon': 'PT',
        'America/New_York': 'US',
        'America/Los_Angeles': 'US',
        'America/Chicago': 'US',
        'America/Toronto': 'CA',
        'America/Vancouver': 'CA',
      };
      countryCode = timezoneToCountry[timezone];
    } catch (e) {
      // Fallback if Intl is not available
    }
  }
  
  return getVintedCreateListingUrl(countryCode);
}

/**
 * Create a smart redirect button that goes to the user's local Vinted
 * Can be used in success.html or other pages
 */
export function createVintedRedirectButton(): string {
  const vintedUrl = detectUserCountryAndGetVintedUrl();
  return `
    <a href="${vintedUrl}" target="_blank" class="btn btn-primary" id="vinted-redirect">
      Start Creating Listings on Vinted
    </a>
    <script>
      // Optional: Update button text based on detected country
      document.addEventListener('DOMContentLoaded', function() {
        const btn = document.getElementById('vinted-redirect');
        const url = '${vintedUrl}';
        if (url.includes('vinted.fr')) {
          btn.textContent = 'Créer des annonces sur Vinted';
        } else if (url.includes('vinted.de')) {
          btn.textContent = 'Erstelle Anzeigen auf Vinted';
        } else if (url.includes('vinted.es')) {
          btn.textContent = 'Crear anuncios en Vinted';
        } else if (url.includes('vinted.it')) {
          btn.textContent = 'Crea annunci su Vinted';
        }
        // Add more language localizations as needed
      });
    </script>
  `;
}