import type { DesktopApi } from '../shared/library';

declare global {
  interface Window { commandNote?: DesktopApi }
  interface ImportMetaEnv { readonly VITE_DESKTOP?: string }
}

export {};
