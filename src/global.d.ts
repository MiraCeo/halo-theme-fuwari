import type { AstroIntegration } from "@swup/astro";
import type * as ThemeColor from "./utils/theme-color";

declare global {
  interface Window {
    // type from '@swup/astro' is incorrect
    swup: AstroIntegration;
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
