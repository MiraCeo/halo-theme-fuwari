/**
 * Pure theme-colour maths shared by the pre-paint boot script, the runtime
 * settings helpers and the visitor colour picker.
 *
 * Everything here must stay side-effect free and free of imports so the same
 * functions can run in three very different places:
 *   - the inline `<head>` script (via `window.__fuwariThemeColor`)
 *   - bundled client script (`src/utils/setting-utils.ts`)
 *   - Svelte/Vue components (`DisplaySettings.svelte`)
 */

/** Saturation used when reconstructing a colour from a legacy numeric hue. */
export const DEFAULT_THEME_COLOR_SATURATION = 0.575;
/** Value (brightness) used when reconstructing a colour from a legacy hue. */
export const DEFAULT_THEME_COLOR_VALUE = 0.94;
/** Hue assumed when only an unusable legacy hue is configured. */
export const DEFAULT_HUE = 250;
/** Colour assumed when neither a configured colour nor a hue can be parsed. */
export const DEFAULT_THEME_COLOR = "#8066F0";

export interface ThemeColorInfo {
  /** Normalised sRGB channels, each 0-255. */
  channels: [number, number, number];
  /** Normalised uppercase `#RRGGBB`, used as the stored/displayed form. */
  hex: string;
}

export interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

/** Clamp `value` into the inclusive `[min, max]` range. */
export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function channelsToHex(channels: readonly number[]): string {
  return `#${channels
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

/**
 * Parse `#RGB`, `#RRGGBB`, `rgb(r, g, b)` or `rgb(r g, b)` into normalised
 * channels plus an uppercase hex form. Returns `null` for anything else, so
 * callers can fall back to a legacy hue or a default.
 */
export function parseThemeColor(
  value: string | undefined | null,
): ThemeColorInfo | null {
  if (!value) return null;

  const trimmed = value.trim();
  const hexMatch = trimmed.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  let channels: number[];

  if (hexMatch) {
    const hex =
      hexMatch[1].length === 3
        ? [...hexMatch[1]].map((part) => part + part).join("")
        : hexMatch[1];
    channels = [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    );
  } else {
    const rgbMatch = trimmed.match(
      /^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/i,
    );
    if (!rgbMatch) return null;
    channels = rgbMatch.slice(1).map(Number);
    if (channels.some((channel) => channel > 255)) return null;
  }

  return {
    channels: channels as [number, number, number],
    hex: channelsToHex(channels),
  };
}

/** Normalise any accepted colour notation, falling back when unparsable. */
export function normalizeThemeColor(
  value: string | undefined | null,
  fallback: string = DEFAULT_THEME_COLOR,
): string {
  return parseThemeColor(value)?.hex ?? fallback;
}

/** Extract the hue (0-359) of a colour, falling back for greys/invalid input. */
export function parseThemeColorHue(
  value: string | undefined | null,
  fallback: number = DEFAULT_HUE,
): number {
  const parsed = parseThemeColor(value);
  if (!parsed) return fallback;

  const [red, green, blue] = parsed.channels.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return fallback;

  let hue: number;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }
  return Math.round((hue * 60 + 360) % 360);
}

/** Decompose a `#RRGGBB` colour into HSV, matching CSS `hsl()` semantics. */
export function hexToHsv(hex: string): HsvColor {
  // HSV needs normalised channels; `hexToRgb` deliberately returns sRGB 0-255
  // because the visitor picker binds those values to its R/G/B number inputs.
  const parsed = parseThemeColor(hex);
  if (!parsed) return { hue: 0, saturation: 0, value: 0 };

  const [red, green, blue] = parsed.channels.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }

  return {
    hue: Math.round(hue),
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

/** Decompose a `#RRGGBB` colour into integer sRGB channels. */
export function hexToRgb(hex: string): RgbColor {
  const parsed = parseThemeColor(hex);
  if (!parsed) return { red: 0, green: 0, blue: 0 };
  const [red, green, blue] = parsed.channels;
  return { red, green, blue };
}

/** Build an uppercase `#RRGGBB` colour from sRGB channels. */
export function rgbToHex(red: number, green: number, blue: number): string {
  return channelsToHex([red, green, blue]);
}

/** Build an uppercase `#RRGGBB` colour from HSV components. */
export function hsvToHex(
  hue: number,
  saturation: number,
  value: number,
): string {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const section = normalizedHue / 60;
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
  const minimum = value - chroma;
  const [red, green, blue] =
    section < 1
      ? [chroma, intermediate, 0]
      : section < 2
        ? [intermediate, chroma, 0]
        : section < 3
          ? [0, chroma, intermediate]
          : section < 4
            ? [0, intermediate, chroma]
            : section < 5
              ? [intermediate, 0, chroma]
              : [chroma, 0, intermediate];

  return rgbToHex(
    (red + minimum) * 255,
    (green + minimum) * 255,
    (blue + minimum) * 255,
  );
}

/**
 * Rebuild a colour from a legacy numeric hue, using the saturation/value the
 * original hue-based palette was generated with.
 */
export function hueToHex(hue: number): string {
  return hsvToHex(
    hue,
    DEFAULT_THEME_COLOR_SATURATION,
    DEFAULT_THEME_COLOR_VALUE,
  );
}
