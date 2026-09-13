import type { AstroIntegration } from "@swup/astro";
import type * as ThemeColor from "./utils/theme-color";

/**
 * Shared handle on the sidebar music widget's `<audio>` element.
 *
 * The widget and the top-bar toggle are separate components rendered in
 * different parts of the page, so they rendezvous here. Whichever runs first
 * creates the object; the other attaches to it. `set` stays `null` until the
 * playlist has loaded and playback can actually be driven, so the toggle never
 * claims to control a player that does not exist yet.
 */
export interface FuwariMusicApi {
  set: { toggle: () => void; isPlaying: () => boolean } | null;
  toggle: () => void;
  isPlaying: () => boolean;
  /** Runs `callback(playing)` immediately and on every play/pause change. */
  subscribe: (callback: (playing: boolean) => void) => () => void;
  subscribers: Array<(playing: boolean) => void>;
  notify: () => void;
}

declare global {
  interface Window {
    // type from '@swup/astro' is incorrect
    swup: AstroIntegration;
    __fuwariMusic?: FuwariMusicApi;
    __fuwariOriginalHistory?: {
      pushState?: History["pushState"];
      replaceState?: History["replaceState"];
    };
    __fuwariSwupHandlersBound?: boolean;
    /**
     * Shared theme-colour maths, published by the bundled `Layout.astro` script
     * so the inline pre-paint script can reuse it instead of duplicating the
     * conversions. Optional because the inline script may run first.
     */
    __fuwariThemeColor?: Pick<
      typeof ThemeColor,
      | "parseThemeColor"
      | "parseThemeColorHue"
      | "normalizeThemeColor"
      | "hueToHex"
      | "hexToHsv"
      | "hexToRgb"
      | "rgbToHex"
      | "hsvToHex"
    >;
    i18nResources?: Record<string, string>;
    SearchWidget?: {
      open: () => void;
    };
  }
}
