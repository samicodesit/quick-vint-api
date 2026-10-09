import type { Session } from "@supabase/supabase-js";

export type MobileWebSession = Session;

export interface MobileApiErrorShape {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
}

export interface MobileApiFetchOptions {
  retryOn401?: boolean;
}

export interface MobileWebRuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  draftsEnabled?: boolean;
}

declare global {
  interface Window {
    __AUTOLISTER_MOBILE_WEB_CONFIG__?: MobileWebRuntimeConfig;
  }
}
