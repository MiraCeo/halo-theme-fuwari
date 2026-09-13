// Behavioural harness for src/utils/theme-color.ts.
// Loaded through node's type stripping so this asserts against the *real*
// module the theme ships, including the copy the inline pre-paint script uses.
//
//   node --experimental-strip-types .tmp-verify/theme-color.test.mts

import assert from "node:assert/strict";
import {
  parseThemeColor,
  normalizeThemeColor,
  parseThemeColorHue,
  hexToHsv,
  hexToRgb,
  rgbToHex,
  hsvToHex,
  hueToHex,
  clamp,
} from "../src/utils/theme-color.ts";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
  }
}

// --- original implementations, copied verbatim from the pre-refactor source ---

const legacyParseThemeColor = (value?: string | null) => {
  if (!value) return null;
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
    if (!rgbMatch) return null;
    channels = rgbMatch.slice(1).map(Number);
    if (channels.some((channel) => channel > 255)) return null;
  }
  const hex = channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return { channels, hex: `#${hex}` };
};

const legacyHueToHex = (hue: number) => {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = 0.94 * 0.575;
  const section = normalizedHue / 60;
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
  const minimum = 0.94 - chroma;
  const rgb =
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
  return `#${rgb
    .map((channel) =>
      Math.round((channel + minimum) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
};

// Mirrors how the pre-refactor inline script called this: on an already-parsed
// colour object rather than on a raw string.
const legacyParseHueFromInfo = (
  info: { channels: number[] } | null,
  fallback: number,
) => {
  if (!info) return fallback;
  const { channels } = info;
  const [red, green, blue] = channels.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return fallback;
  let hue: number;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return Math.round((hue * 60 + 360) % 360);
};

// --- parsing ---

const VALID = [
  "#E28247", // the configured default in settings.yaml
  "#e28247",
  "#FFF",
  "#fff",
  "#000",
  "#000000",
  "#FFFFFF",
  "  #E28247  ",
  "rgb(226, 130, 71)",
  "rgb(226 130 71)",
  "rgb(0, 0, 0)",
  "rgb(255,255,255)",
  "RGB(1, 2, 3)",
  "#8066F0",
];

const INVALID = [
  undefined,
  null,
  "",
  "   ",
  "not-a-color",
  "#12345",
  "#GGGGGG",
  "rgb(256, 0, 0)",
  "rgb(1, 2)",
  "hsl(20, 50%, 50%)",
  "e28247",
];

check("parse: valid inputs match the original implementation", () => {
  for (const value of VALID) {
    assert.deepEqual(
      parseThemeColor(value),
      legacyParseThemeColor(value),
      `mismatch for ${JSON.stringify(value)}`,
    );
  }
});

check("parse: invalid inputs stay null", () => {
  for (const value of INVALID) {
    assert.equal(parseThemeColor(value), null, `expected null for ${value}`);
  }
});

check("parse: #E28247 normalises to uppercase hex and channels", () => {
  assert.equal(parseThemeColor("#E28247")!.hex, "#E28247");
  assert.deepEqual(parseThemeColor("#E28247")!.channels, [226, 130, 71]);
});

// --- normalisation ---

check("normalize: falls back only for unparsable input", () => {
  assert.equal(normalizeThemeColor("#e28247"), "#E28247");
  assert.equal(normalizeThemeColor("#abc"), "#AABBCC");
  assert.equal(normalizeThemeColor("rgb(226, 130, 71)"), "#E28247");
  assert.equal(normalizeThemeColor("bogus"), "#8066F0");
  assert.equal(normalizeThemeColor(undefined), "#8066F0");
  assert.equal(normalizeThemeColor("bogus", "#123456"), "#123456");
});

// --- hue extraction, including the achromatic fallback branch ---

check("hue: matches the original for every valid input", () => {
  for (const value of VALID) {
    const info = legacyParseThemeColor(value);
    assert.equal(
      parseThemeColorHue(value, 250),
      legacyParseHueFromInfo(info, 250),
      `hue mismatch for ${JSON.stringify(value)}`,
    );
  }
});

check("hue: greys and unparsable input use the legacy hue fallback", () => {
  assert.equal(parseThemeColorHue("#808080", 137), 137);
  assert.equal(parseThemeColorHue("#000", 137), 137);
  assert.equal(parseThemeColorHue("bogus", 137), 137);
  assert.equal(parseThemeColorHue(undefined, 137), 137);
});

check("hue: #E28247 is 23deg and #8066F0 is 251deg", () => {
  assert.equal(parseThemeColorHue("#E28247"), 23);
  assert.equal(parseThemeColorHue("#8066F0"), 251);
});

// --- legacy hue reconstruction: the path used when only an old hue is stored ---

check("hueToHex: byte-identical to the original for all 360 hues", () => {
  for (let hue = 0; hue < 360; hue += 1) {
    assert.equal(hueToHex(hue), legacyHueToHex(hue), `mismatch at hue ${hue}`);
  }
});

check("hueToHex: clamps out-of-range hue like the original", () => {
  for (const hue of [-30, 360, 400, -720, 719]) {
    assert.equal(hueToHex(hue), legacyHueToHex(hue), `mismatch at hue ${hue}`);
  }
});

// --- conversions used by the visitor colour picker ---

check("hexToRgb: round-trips every channel value", () => {
  for (let channel = 0; channel <= 255; channel += 1) {
    const hex = rgbToHex(channel, 255 - channel, 128);
    const rgb = hexToRgb(hex);
    assert.deepEqual(
      [rgb.red, rgb.green, rgb.blue],
      [channel, 255 - channel, 128],
      `round-trip failed at ${channel}`,
    );
  }
});

check("hexToRgb: invalid input degrades to black instead of NaN", () => {
  assert.deepEqual(hexToRgb("not-a-color"), { red: 0, green: 0, blue: 0 });
});

check("rgbToHex: clamps out-of-range channels", () => {
  assert.equal(rgbToHex(300, -20, 128), "#FF0080");
});

check(
  "hexToHsv: agrees with the picker's previous local implementation",
  () => {
    const legacy = (hex: string) => {
      const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
      const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
      const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const delta = max - min;
      let nextHue = 0;
      if (delta) {
        if (max === red) nextHue = ((green - blue) / delta) % 6;
        else if (max === green) nextHue = (blue - red) / delta + 2;
        else nextHue = (red - green) / delta + 4;
        nextHue = (nextHue * 60 + 360) % 360;
      }
      return {
        hue: Math.round(nextHue),
        saturation: max === 0 ? 0 : delta / max,
        value: max,
      };
    };

    for (const value of VALID) {
      const hex = legacyParseThemeColor(value)!.hex;
      assert.deepEqual(hexToHsv(hex), legacy(hex), `hsv mismatch for ${hex}`);
    }
  },
);

check(
  "hsvToHex: agrees with the picker's previous local implementation",
  () => {
    const legacy = (
      nextHue: number,
      nextSaturation: number,
      nextValue: number,
    ) => {
      const chroma = nextValue * nextSaturation;
      const section = nextHue / 60;
      const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
      const minimum = nextValue - chroma;
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
      return `#${[red, green, blue]
        .map((channel) =>
          Math.round((channel + minimum) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`.toUpperCase();
    };

    // Hue/saturation/value triples the picker can actually produce.
    for (let hue = 0; hue < 360; hue += 7) {
      for (const saturation of [0, 0.001, 0.25, 0.5, 0.575, 0.9, 1]) {
        for (const value of [0, 0.001, 0.5, 0.94, 1]) {
          assert.equal(
            hsvToHex(hue, saturation, value),
            legacy(hue, saturation, value),
            `hsvToHex mismatch at ${hue}/${saturation}/${value}`,
          );
        }
      }
    }
  },
);

check(
  "picker: read-back matches the pre-refactor implementation bit for bit",
  () => {
    // The picker's applyPickerColor() path is hsvToHex(hexToHsv(x)). Hue is
    // rounded to an integer degree, so a few colours shift by one step in one
    // channel (e.g. #8066F0 -> #7F66F0). That predates this refactor; what
    // matters here is that the new module reproduces the old output exactly.
    const legacyParseChannels = (value: string) => {
      const match = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)!;
      const hex =
        match[1].length === 3
          ? [...match[1]].map((part) => part + part).join("")
          : match[1];
      return [0, 2, 4].map((offset) =>
        Number.parseInt(hex.slice(offset, offset + 2), 16),
      );
    };

    const legacyHexToHsv = (hex: string) => {
      const [r, g, b] = legacyParseChannels(hex).map((c) => c / 255);
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min;
      let h = 0;
      if (delta) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h = (h * 60 + 360) % 360;
      }
      return {
        hue: Math.round(h),
        saturation: max === 0 ? 0 : delta / max,
        value: max,
      };
    };

    const legacyHsvToHex = (hue: number, sat: number, val: number) => {
      const chroma = val * sat,
        section = hue / 60;
      const inter = chroma * (1 - Math.abs((section % 2) - 1));
      const min = val - chroma;
      const [r, g, b] =
        section < 1
          ? [chroma, inter, 0]
          : section < 2
            ? [inter, chroma, 0]
            : section < 3
              ? [0, chroma, inter]
              : section < 4
                ? [0, inter, chroma]
                : section < 5
                  ? [inter, 0, chroma]
                  : [chroma, 0, inter];
      return `#${[r, g, b]
        .map((c) =>
          Math.round((c + min) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`.toUpperCase();
    };

    // Every colour reachable from the picker: all 360 hues at the default
    // saturation/value, plus the configured and visitor defaults.
    for (let hue = 0; hue < 360; hue += 1) {
      const hex = legacyHsvToHex(hue, 0.575, 0.94);
      const legacyHsv = legacyHexToHsv(hex);
      const before = legacyHsvToHex(
        legacyHsv.hue,
        legacyHsv.saturation,
        legacyHsv.value,
      );
      const hsv = hexToHsv(hex);
      const after = hsvToHex(hsv.hue, hsv.saturation, hsv.value);
      assert.equal(
        after,
        before,
        `read-back drifted from the old code at ${hex}`,
      );
    }

    for (const value of VALID) {
      const hex = normalizeThemeColor(value);
      const hsv = hexToHsv(hex);
      const legacyHsv = legacyHexToHsv(hex);
      assert.deepEqual(hsv, legacyHsv, `hsv mismatch for ${hex}`);
      assert.equal(
        hsvToHex(hsv.hue, hsv.saturation, hsv.value),
        legacyHsvToHex(legacyHsv.hue, legacyHsv.saturation, legacyHsv.value),
        `read-back mismatch for ${hex}`,
      );
    }
  },
);

check("picker: read-back is exact for most colours", () => {
  // Guard against the rounding quirk getting worse than it already is.
  let exact = 0;
  for (let hue = 0; hue < 360; hue += 1) {
    const hex = hsvToHex(hue, 0.575, 0.94);
    const hsv = hexToHsv(hex);
    if (hsvToHex(hsv.hue, hsv.saturation, hsv.value) === hex) exact += 1;
  }
  assert.ok(
    exact >= 270,
    `only ${exact}/360 hues read back exactly; the rounding quirk regressed`,
  );
});

check("rgb: picker channels equal the parsed sRGB channels", () => {
  for (const value of VALID) {
    const stored = normalizeThemeColor(value);
    const { channels } = parseThemeColor(stored)!;
    assert.deepEqual(
      hexToRgb(stored),
      { red: channels[0], green: channels[1], blue: channels[2] },
      `rgb mismatch for ${stored}`,
    );
  }
});

check(
  "picker: reset-button comparison is case-stable after normalisation",
  () => {
    // getThemeColor() may return a lowercase configured value while
    // getDefaultThemeColor() normalises; both must compare equal once normalised.
    const configured = "#e28247";
    assert.equal(
      normalizeThemeColor(configured),
      normalizeThemeColor(configured.toUpperCase()),
    );
  },
);

// --- clamp helper shared with the picker ---

check("clamp: bounds and defaults", () => {
  assert.equal(clamp(1.5), 1);
  assert.equal(clamp(-2), 0);
  assert.equal(clamp(0.5), 0.5);
  assert.equal(clamp(300, 0, 255), 255);
  assert.equal(clamp(-5, 0, 255), 0);
});

// --- report ---

console.log(`passed: ${passed}`);
if (failures.length) {
  console.error(`failed: ${failures.length}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("all theme-color checks passed");
