export {};

declare global {
  interface Window {
    dataLayer: any[];
    toggleMobileMenu?: () => void;
  }
}
