<script lang="ts">
  import {
    getDefaultThemeColor,
    getThemeColor,
    resetThemeColor,
    setThemeColor,
  } from "../../utils/setting-utils";

  let color = getThemeColor();
  const defaultColor = getDefaultThemeColor();
  let { hue, saturation, value } = hexToHsv(color);
  let { red, green, blue } = hexToRgb(color);
  let inputMode: "rgb" | "hex" = "rgb";
  let hexInput = color;
  let hexInputInvalid = false;
  let eyedropperLoading = false;
  const eyedropperSupported =
    typeof window !== "undefined" && "EyeDropper" in window;
  type I18nWindow = Window & { i18nResources?: Record<string, string> };
  type EyeDropperWindow = Window & {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
  };

  function clamp(value: number, min = 0, max = 1): number {
    return Math.min(max, Math.max(min, value));
  }

  function hexToHsv(hex: string) {
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
  }

  function hexToRgb(hex: string) {
    return {
      red: Number.parseInt(hex.slice(1, 3), 16),
      green: Number.parseInt(hex.slice(3, 5), 16),
      blue: Number.parseInt(hex.slice(5, 7), 16),
    };
  }

  function rgbToHex(nextRed: number, nextGreen: number, nextBlue: number) {
    return `#${[nextRed, nextGreen, nextBlue]
      .map((channel) =>
        Math.round(clamp(Number(channel), 0, 255))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`.toUpperCase();
  }

  function hsvToHex(nextHue: number, nextSaturation: number, nextValue: number) {
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
  }

  const t = (key: string, fallback: string): string => {
    const value = typeof window !== "undefined"
      ? (window as I18nWindow).i18nResources?.[key]
      : undefined;
    return value && !value.includes("#{") ? value : fallback;
  };

  function applyPickerColor() {
    color = hsvToHex(hue, saturation, value);
    ({ red, green, blue } = hexToRgb(color));
    hexInput = color;
    hexInputInvalid = false;
    setThemeColor(color);
  }

  function applyRgbColor() {
    red = Math.round(clamp(Number(red), 0, 255));
    green = Math.round(clamp(Number(green), 0, 255));
    blue = Math.round(clamp(Number(blue), 0, 255));
    color = rgbToHex(red, green, blue);
    ({ hue, saturation, value } = hexToHsv(color));
    hexInput = color;
    hexInputInvalid = false;
    setThemeColor(color);
  }

  function syncSelectedColor(nextColor: string) {
    color = nextColor.toUpperCase();
    ({ hue, saturation, value } = hexToHsv(color));
    ({ red, green, blue } = hexToRgb(color));
    hexInput = color;
    hexInputInvalid = false;
    setThemeColor(color);
  }

  function normalizeHexColor(value: string): string | null {
    const digits = value.trim().replace(/^#/, "").toUpperCase();
    if (/^[0-9A-F]{6}$/.test(digits)) return `#${digits}`;
    if (/^[0-9A-F]{3}$/.test(digits)) {
      return `#${digits
        .split("")
        .map((digit) => digit.repeat(2))
        .join("")}`;
    }
    return null;
  }

  function applyHexColor(event: Event) {
    hexInput = (event.currentTarget as HTMLInputElement).value;
    const normalizedColor = normalizeHexColor(hexInput);
    hexInputInvalid = normalizedColor === null;
    if (normalizedColor) syncSelectedColor(normalizedColor);
  }

  function restoreHexInput() {
    if (!hexInputInvalid) return;
    hexInput = color;
    hexInputInvalid = false;
  }

  function toggleInputMode() {
    inputMode = inputMode === "rgb" ? "hex" : "rgb";
    hexInput = color;
    hexInputInvalid = false;
  }

  async function startEyeDropper() {
    if (eyedropperLoading) return;
    const EyeDropperApi = (window as EyeDropperWindow).EyeDropper;
    if (!EyeDropperApi) return;

    eyedropperLoading = true;
    try {
      const result = await new EyeDropperApi().open();
      syncSelectedColor(result.sRGBHex);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error(
          "[theme-fuwari-miraceo] EyeDropper API failed to pick a color",
          error,
        );
      }
    } finally {
      eyedropperLoading = false;
    }
  }

  function updateSaturationValue(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    saturation = clamp((event.clientX - rect.left) / rect.width);
    value = 1 - clamp((event.clientY - rect.top) / rect.height);
    applyPickerColor();
  }

  function startSaturationValueDrag(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    updateSaturationValue(event);
  }

  function moveSaturationValueDrag(event: PointerEvent) {
    if (event.buttons === 1) updateSaturationValue(event);
  }

  function updateHue() {
    applyPickerColor();
  }

  function resetColor() {
    color = resetThemeColor();
    ({ hue, saturation, value } = hexToHsv(color));
    ({ red, green, blue } = hexToRgb(color));
    hexInput = color;
    hexInputInvalid = false;
  }
</script>

<div
  id="display-setting"
  class="float-panel float-panel-closed absolute transition-all w-80 right-4 px-4 py-4"
  style={`--picker-hue: ${hue}`}
>
  <div class="flex flex-row gap-2 mb-3 items-center justify-between">
    <div class="flex gap-2 font-bold text-lg text-neutral-900 dark:text-neutral-100 transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-(--primary)
            before:absolute before:-left-3 before:top-[0.33rem]"
    >
      {t("theme.color", "主题色")}
      <button aria-label={t("theme.resetDefault", "Reset to Default")} class="btn-regular w-7 h-7 rounded-md  active:scale-90 will-change-transform"
              class:opacity-0={color === defaultColor} class:pointer-events-none={color === defaultColor} on:click={resetColor}>
        <div class="text-(--btn-content)">
          <div icon="fa6-solid:arrow-rotate-left" class="icon-[fa6-solid--arrow-rotate-left] text-[0.875rem]"></div>
        </div>
      </button>
    </div>
    <div class="rounded-md bg-(--btn-regular-bg) px-2 py-1 font-mono text-sm font-bold text-(--btn-content)">
      {color.toUpperCase()}
    </div>
  </div>
  <div
    class="saturation-value-picker"
    aria-label={t("theme.color", "主题色")}
    on:pointerdown={startSaturationValueDrag}
    on:pointermove={moveSaturationValueDrag}
  >
    <span
      class="picker-cursor"
      style={`left: ${saturation * 100}%; top: ${(1 - value) * 100}%`}
    ></span>
  </div>
  <div class="mt-3 flex items-center gap-3">
    <span class="color-preview" style={`background-color: ${color}`}></span>
    <input
      class="hue-slider"
      aria-label="Hue"
      type="range"
      min="0"
      max="359"
      step="1"
      bind:value={hue}
      on:input={updateHue}
    />
  </div>
  <div class="mt-4 flex items-start gap-3">
    <button
      class="eyedropper-button btn-plain"
      class:opacity-60={eyedropperLoading}
      aria-label="屏幕取色"
      title={eyedropperSupported
        ? "使用浏览器取色器"
        : "当前浏览器不支持 EyeDropper API"}
      type="button"
      disabled={eyedropperLoading || !eyedropperSupported}
      on:click={startEyeDropper}
    >
      <span
        class="icon-[material-symbols--colorize-outline] text-[1.4rem]"
        class:animate-spin={eyedropperLoading}
      ></span>
    </button>
    {#if inputMode === "rgb"}
      <div class="grid min-w-0 flex-1 grid-cols-3 gap-2">
        <label class="rgb-field">
          <input
            aria-label="Red"
            type="number"
            min="0"
            max="255"
            bind:value={red}
            on:input={applyRgbColor}
          />
          <span>R</span>
        </label>
        <label class="rgb-field">
          <input
            aria-label="Green"
            type="number"
            min="0"
            max="255"
            bind:value={green}
            on:input={applyRgbColor}
          />
          <span>G</span>
        </label>
        <label class="rgb-field">
          <input
            aria-label="Blue"
            type="number"
            min="0"
            max="255"
            bind:value={blue}
            on:input={applyRgbColor}
          />
          <span>B</span>
        </label>
      </div>
    {:else}
      <label class="hex-field min-w-0 flex-1">
        <input
          class:invalid={hexInputInvalid}
          aria-label="Hex RGB"
          aria-invalid={hexInputInvalid}
          type="text"
          maxlength="7"
          placeholder="#E28247"
          bind:value={hexInput}
          on:input={applyHexColor}
          on:blur={restoreHexInput}
        />
        <span>HEX</span>
      </label>
    {/if}
    <button
      class="color-mode-button btn-plain"
      aria-label={inputMode === "rgb" ? "切换到十六进制输入" : "切换到 RGB 输入"}
      title={inputMode === "rgb" ? "切换到十六进制输入" : "切换到 RGB 输入"}
      aria-pressed={inputMode === "hex"}
      type="button"
      on:click={toggleInputMode}
    >
      {inputMode === "rgb" ? "HEX" : "RGB"}
    </button>
  </div>
</div>

<style>
  .saturation-value-picker {
    position: relative;
    height: 10.5rem;
    cursor: crosshair;
    touch-action: none;
    overflow: hidden;
    border-radius: 0.65rem;
    background:
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, hsl(var(--picker-hue) 100% 50%));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
  }

  .picker-cursor {
    position: absolute;
    width: 1.15rem;
    height: 1.15rem;
    transform: translate(-50%, -50%);
    pointer-events: none;
    border: 3px solid white;
    border-radius: 999px;
    box-shadow: 0 0 0 2px rgb(0 0 0 / 0.8);
  }

  .color-preview {
    width: 2.25rem;
    height: 2.25rem;
    flex: none;
    border: 2px solid rgb(255 255 255 / 0.8);
    border-radius: 999px;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.12);
  }

  .hue-slider {
    width: 100%;
    height: 0.8rem;
    appearance: none;
    cursor: pointer;
    border-radius: 999px;
    background: linear-gradient(
      to right,
      #f00,
      #ff0,
      #0f0,
      #0ff,
      #00f,
      #f0f,
      #f00
    );
  }

  .hue-slider::-webkit-slider-thumb {
    width: 1.15rem;
    height: 1.15rem;
    appearance: none;
    border: 3px solid white;
    border-radius: 999px;
    background: hsl(var(--picker-hue) 100% 50%);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25);
  }

  .hue-slider::-moz-range-thumb {
    width: 0.85rem;
    height: 0.85rem;
    border: 3px solid white;
    border-radius: 999px;
    background: hsl(var(--picker-hue) 100% 50%);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25);
  }

  .eyedropper-button {
    width: 2.5rem;
    height: 2.5rem;
    flex: none;
    border-radius: 0.5rem;
  }

  .color-mode-button {
    width: 2.8rem;
    height: 2.5rem;
    flex: none;
    border: 1px solid var(--line-color);
    border-radius: 0.5rem;
    background: var(--card-bg);
    font-family: monospace;
    font-size: 0.72rem;
    font-weight: 700;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .color-mode-button:hover,
  .color-mode-button:focus-visible {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--card-bg));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 16%, transparent);
  }

  .rgb-field,
  .hex-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    color: var(--ink);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .rgb-field input,
  .hex-field input {
    width: 100%;
    height: 2.5rem;
    border: 1px solid var(--line-color);
    border-radius: 0.45rem;
    background: var(--card-bg);
    color: var(--ink);
    text-align: center;
    outline: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .rgb-field input:focus,
  .hex-field input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent);
  }

  .hex-field input.invalid {
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgb(239 68 68 / 0.16);
  }

</style>
