import {
  AUTO_MODE,
  DARK_MODE,
  DEFAULT_THEME,
  LIGHT_MODE,
} from "../constants/constants.ts";
import type { LIGHT_DARK_MODE } from "../types/config";

let restoreTransitionFrame = 0;

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

export function parseThemeColorHue(
  value: string | undefined,
  fallback = 250,
): number {
  if (!value) {
    return fallback;
  }

  const hexMatch = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
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
    const rgbMatch = value
      .trim()
      .match(/^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/i);
    if (!rgbMatch) {
      return fallback;
    }
    channels = rgbMatch.slice(1).map(Number);
    if (channels.some((channel) => channel > 255)) {
      return fallback;
    }
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

export function isHueFixed(): boolean {
  const configCarrier = document.getElementById("config-carrier");
  return (
    configCarrier?.dataset.hueFixed === "true" ||
    document.documentElement.dataset.hueFixed === "true"
  );
}

export function getHue(): number {
  if (isHueFixed()) {
    return getDefaultHue();
  }
  const stored = localStorage.getItem("hue");
  return stored ? Number.parseInt(stored, 10) : getDefaultHue();
}

export function setHue(hue: number): void {
  const nextHue = isHueFixed() ? getDefaultHue() : hue;
  if (!isHueFixed()) {
    localStorage.setItem("hue", String(nextHue));
  }
  const r = document.querySelector(":root") as HTMLElement;
  if (!r) {
    return;
  }
  r.style.setProperty("--hue", String(nextHue));
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
