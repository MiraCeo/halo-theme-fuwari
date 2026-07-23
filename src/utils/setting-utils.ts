import {
  AUTO_MODE,
  DARK_MODE,
  DEFAULT_THEME,
  LIGHT_MODE,
} from "../constants/constants.ts";
import type { LIGHT_DARK_MODE } from "../types/config";

let restoreTransitionFrame = 0;
const DEFAULT_THEME_COLOR = "#8066F0";
const THEME_COLOR_STORAGE_KEY = "fuwari-miraceo-theme-color";

function withoutThemeTransition(applyTheme: () => void) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  if (restoreTransitionFrame) {
    cancelAnimationFrame(restoreTransitionFrame);
  }

  applyTheme();

  // Force style recalculation while transitions are disabled, then restore
  // transitions after the final theme colors are already committed.
  root.getBoundingClientRect();
  restoreTransitionFrame = requestAnimationFrame(() => {
    restoreTransitionFrame = requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
      restoreTransitionFrame = 0;
    });
  });
}

function parseThemeColorChannels(value: string | undefined): number[] | null {
  if (!value) {
    return null;
  }

  const hexMatch = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hexMatch) {
    const hex =
      hexMatch[1].length === 3
        ? [...hexMatch[1]].map((part) => part + part).join("")
        : hexMatch[1];
    return [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    );
  }

  const rgbMatch = value
    .trim()
    .match(/^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/i);
  if (!rgbMatch) {
    return null;
  }
  const channels = rgbMatch.slice(1).map(Number);
  return channels.some((channel) => channel > 255) ? null : channels;
}

export function normalizeThemeColor(
  value: string | undefined,
  fallback = DEFAULT_THEME_COLOR,
): string {
  const channels = parseThemeColorChannels(value);
  if (!channels) {
    return fallback;
  }
  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function parseThemeColorHue(
  value: string | undefined,
  fallback = 250,
): number {
  const channels = parseThemeColorChannels(value);
  if (!channels) {
    return fallback;
  }
  const [red, green, blue] = channels.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) {
    return fallback;
  }

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

export function getDefaultHue(): number {
  const fallback = 250;
  const configCarrier = document.getElementById("config-carrier");
  const legacyHue = Number.parseInt(
    configCarrier?.dataset.hue || String(fallback),
    10,
  );
  return parseThemeColorHue(
    configCarrier?.dataset.themeColor,
    Number.isNaN(legacyHue) ? fallback : legacyHue,
  );
}

function hueToHex(hue: number): string {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const saturation = 0.575;
  const value = 0.94;
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

  return normalizeThemeColor(
    `rgb(${Math.round((red + minimum) * 255)}, ${Math.round(
      (green + minimum) * 255,
    )}, ${Math.round((blue + minimum) * 255)})`,
  );
}

export function getDefaultThemeColor(): string {
  const configCarrier = document.getElementById("config-carrier");
  const configuredColor = configCarrier?.dataset.themeColor;
  if (parseThemeColorChannels(configuredColor)) {
    return normalizeThemeColor(configuredColor);
  }
  return hueToHex(getDefaultHue());
}

export function isHueFixed(): boolean {
  const configCarrier = document.getElementById("config-carrier");
  return (
    configCarrier?.dataset.hueFixed === "true" ||
    document.documentElement.dataset.hueFixed === "true"
  );
}

export function getThemeColor(): string {
  if (isHueFixed()) {
    return getDefaultThemeColor();
  }
  const stored = localStorage.getItem(THEME_COLOR_STORAGE_KEY) || undefined;
  return normalizeThemeColor(stored, getDefaultThemeColor());
}

export function applyThemeColor(color: string): void {
  const hue = parseThemeColorHue(color, getDefaultHue());
  document.documentElement.style.setProperty("--hue", String(hue));
}

export function setThemeColor(color: string): void {
  const nextColor = isHueFixed()
    ? getDefaultThemeColor()
    : normalizeThemeColor(color, getDefaultThemeColor());
  if (!isHueFixed()) {
    localStorage.setItem(THEME_COLOR_STORAGE_KEY, nextColor);
  }
  applyThemeColor(nextColor);
}

export function resetThemeColor(): string {
  localStorage.removeItem(THEME_COLOR_STORAGE_KEY);
  const defaultColor = getDefaultThemeColor();
  applyThemeColor(defaultColor);
  return defaultColor;
}

export function applyThemeToDocument(theme: LIGHT_DARK_MODE) {
  withoutThemeTransition(() => {
    switch (theme) {
      case LIGHT_MODE:
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
        break;
      case DARK_MODE:
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
        break;
      case AUTO_MODE:
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          document.documentElement.classList.add("dark");
          document.documentElement.style.colorScheme = "dark";
        } else {
          document.documentElement.classList.remove("dark");
          document.documentElement.style.colorScheme = "light";
        }
        break;
    }
  });

  // // Set the theme for Expressive Code
  // document.documentElement.setAttribute(
  // 	"data-theme",
  // 	expressiveCodeConfig.theme,
  // );
}

export function setTheme(theme: LIGHT_DARK_MODE): void {
  localStorage.setItem("theme", theme);
  applyThemeToDocument(theme);
}

export function getStoredTheme(): LIGHT_DARK_MODE {
  return (localStorage.getItem("theme") as LIGHT_DARK_MODE) || DEFAULT_THEME;
}
