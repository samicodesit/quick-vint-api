// Enhanced Vinted Country Detection
// This provides a more reliable way to detect user location for Vinted redirects

export class VintedCountryDetector {
  static VINTED_DOMAINS = {
    FR: "vinted.fr",
    DE: "vinted.de",
    GB: "vinted.co.uk",
    UK: "vinted.co.uk",
    ES: "vinted.es",
    IT: "vinted.it",
    BE: "vinted.be",
    NL: "vinted.nl",
    AT: "vinted.at",
    PL: "vinted.pl",
    CZ: "vinted.cz",
    LT: "vinted.lt",
    LV: "vinted.lv",
    LU: "vinted.lu",
    PT: "vinted.pt",
    US: "vinted.com",
    CA: "vinted.ca",
    DEFAULT: "vinted.com",
  };

  static TIMEZONE_TO_COUNTRY = {
    // European timezones (most reliable)
    "Europe/Paris": "FR",
    "Europe/Berlin": "DE",
    "Europe/London": "GB",
    "Europe/Madrid": "ES",
    "Europe/Rome": "IT",
    "Europe/Brussels": "BE",
    "Europe/Amsterdam": "NL",
    "Europe/Vienna": "AT",
    "Europe/Warsaw": "PL",
    "Europe/Prague": "CZ",
    "Europe/Vilnius": "LT",
    "Europe/Riga": "LV",
    "Europe/Luxembourg": "LU",
    "Europe/Lisbon": "PT",

    // North American timezones
    "America/New_York": "US",
    "America/Chicago": "US",
    "America/Denver": "US",
    "America/Los_Angeles": "US",
    "America/Phoenix": "US",
    "America/Anchorage": "US",
    "America/Toronto": "CA",
    "America/Vancouver": "CA",
    "America/Montreal": "CA",
    "America/Halifax": "CA",
    "America/Winnipeg": "CA",
  };

  /**
   * Primary detection method using timezone (most reliable)
   */
  static detectByTimezone() {
    try {
      if (typeof Intl === "undefined") return null;

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log("Detected timezone:", timezone);

      return this.TIMEZONE_TO_COUNTRY[timezone] || null;
    } catch (e) {
      console.warn("Timezone detection failed:", e);
      return null;
    }
  }

  /**
   * Secondary detection using browser language preferences
   * Only returns country if it's a valid Vinted market
   */
  static detectByLanguagePreferences() {
    try {
      // Check all language preferences, not just the first
      const languages = navigator.languages || [navigator.language];

      for (const lang of languages) {
        if (lang.includes("-")) {
          const countryCode = lang.split("-")[1].toUpperCase();
          if (this.VINTED_DOMAINS[countryCode]) {
            console.log(
              "Detected by language preference:",
              countryCode,
              "from",
              lang,
            );
            return countryCode;
          }
        }
      }

      return null;
    } catch (e) {
      console.warn("Language detection failed:", e);
      return null;
    }
  }

  /**
   * Fallback detection using IP geolocation (requires API call)
   */
  static async detectByIP() {
    try {
      // Using a free IP geolocation service
      const response = await fetch("https://ipapi.co/json/", {
        timeout: 3000, // 3 second timeout
      });

      if (!response.ok) throw new Error("IP detection API failed");

      const data = await response.json();
      const countryCode = data.country_code;

      if (countryCode && this.VINTED_DOMAINS[countryCode]) {
        console.log("Detected by IP:", countryCode);
        return countryCode;
      }

      return null;
    } catch (e) {
      console.warn("IP detection failed:", e);
      return null;
    }
  }

  /**
   * Main detection method that tries all approaches in order of reliability
   */
  static async detectCountry() {
    // Method 1: Timezone (most reliable for Europeans)
    let country = this.detectByTimezone();
    if (country) {
      console.log("Country detected by timezone:", country);
      return country;
    }

    // Method 2: Language preferences (good fallback)
    country = this.detectByLanguagePreferences();
    if (country) {
      console.log("Country detected by language:", country);
      return country;
    }

    // Method 3: IP geolocation (requires API call, use as last resort)
    try {
      country = await this.detectByIP();
      if (country) {
        console.log("Country detected by IP:", country);
        return country;
      }
    } catch (e) {
      console.warn("IP detection unavailable");
    }

    console.log("No country detected, using default");
    return "DEFAULT";
  }

  /**
   * Get the appropriate Vinted URL for a country
   */
  static getVintedUrl(countryCode) {
    const domain =
      this.VINTED_DOMAINS[countryCode] || this.VINTED_DOMAINS.DEFAULT;
    return `https://www.${domain}/items/new`;
  }

  /**
   * Main entry point: detect country and return Vinted URL
   */
  static async getVintedUrlForUser() {
    const country = await this.detectCountry();
    return this.getVintedUrl(country);
  }

  /**
   * Synchronous version (no IP detection)
   */
  static getVintedUrlForUserSync() {
    const country =
      this.detectByTimezone() ||
      this.detectByLanguagePreferences() ||
      "DEFAULT";
    return this.getVintedUrl(country);
  }
}
