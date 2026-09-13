import {
  AUTO_MODE,
  DARK_MODE,
  DEFAULT_THEME,
  LIGHT_MODE,
} from "../constants/constants.ts";
import type { LIGHT_DARK_MODE } from "../types/config";
import {
  DEFAULT_HUE,
  hueToHex,
  normalizeThemeColor,
  parseThemeColor,
  parseThemeColorHue,
} from "./theme-color.ts";

let restoreTransitionFrame = 0;
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

export { normalizeThemeColor, parseThemeColorHue };

/** Fallback hue when only an unusable legacy hue value is configured. */
function readLegacyHue(configCarrier: HTMLElement | null): number {
  const parsed = Number.parseInt(
    configCarrier?.dataset.hue || String(DEFAULT_HUE),
    10,
  );
  return Number.isNaN(parsed) ? DEFAULT_HUE : parsed;
}

export function getDefaultHue(): number {
  const configCarrier = document.getElementById("config-carrier");
  return parseThemeColorHue(
    configCarrier?.dataset.themeColor,
    readLegacyHue(configCarrier),
  );
}

export function getDefaultThemeColor(): string {
  const configCarrier = document.getElementById("config-carrier");
  const configuredColor = configCarrier?.dataset.themeColor;
  if (parseThemeColor(configuredColor)) {
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
  const normalizedColor = normalizeThemeColor(color, getDefaultThemeColor());
  const hue = parseThemeColorHue(normalizedColor, getDefaultHue());
  document.documentElement.style.setProperty("--theme-color", normalizedColor);
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
