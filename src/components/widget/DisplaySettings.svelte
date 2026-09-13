<script lang="ts">
  import {
    getDefaultThemeColor,
    getThemeColor,
    resetThemeColor,
    setThemeColor,
  } from "../../utils/setting-utils";
  import {
    clamp,
    hexToHsv,
    hexToRgb,
    hsvToHex,
    normalizeThemeColor,
    rgbToHex,
  } from "../../utils/theme-color";

  // Always store the picker colour in normalised uppercase form: the reset
  // button compares it against the configured default, which is normalised too.
  let color = normalizeThemeColor(getThemeColor());
  const defaultColor = normalizeThemeColor(getDefaultThemeColor());
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

  function applyRgbColor(
    channel: "red" | "green" | "blue",
    event: Event,
  ) {
    const nextValue = Number((event.currentTarget as HTMLInputElement).value);
    if (channel === "red") red = nextValue;
    else if (channel === "green") green = nextValue;
    else blue = nextValue;
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

  function handleSaturationValueKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.1 : 0.01;
    let handled = true;
    switch (event.key) {
      case "ArrowLeft":
        saturation = clamp(saturation - step);
        break;
      case "ArrowRight":
        saturation = clamp(saturation + step);
        break;
      case "ArrowUp":
        value = clamp(value + step);
        break;
      case "ArrowDown":
        value = clamp(value - step);
        break;
      default:
        handled = false;
    }
    if (!handled) return;
    event.preventDefault();
    applyPickerColor();
  }

  function updateHue(event: Event) {
    hue = Number((event.currentTarget as HTMLInputElement).value);
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
              class:opacity-0={color === defaultColor} class:pointer-events-none={color === defaultColor} onclick={resetColor}>
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
    role="slider"
    tabindex="0"
    aria-label={t("theme.saturationBrightness", "颜色饱和度与明度")}
    aria-describedby="color-picker-help"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={Math.round(saturation * 100)}
    aria-valuetext={`${Math.round(saturation * 100)}% / ${Math.round(value * 100)}%`}
    onpointerdown={startSaturationValueDrag}
    onpointermove={moveSaturationValueDrag}
    onkeydown={handleSaturationValueKeydown}
  >
    <span
      class="picker-cursor"
      aria-hidden="true"
      style={`left: ${saturation * 100}%; top: ${(1 - value) * 100}%`}
    ></span>
  </div>
  <span id="color-picker-help" class="sr-only">
    {t(
      "theme.saturationBrightnessHelp",
      "使用方向键调整，按住 Shift 可大幅调整",
    )}
  </span>
  <div class="mt-3 flex items-center gap-3">
    <span class="color-preview" style={`background-color: ${color}`}></span>
    <input
      class="hue-slider"
      aria-label={t("theme.hue", "色相")}
      type="range"
      min="0"
      max="359"
      step="1"
      bind:value={hue}
      oninput={updateHue}
    />
  </div>
  <div class="mt-4 flex items-start gap-3">
    <button
      class="eyedropper-button btn-plain"
      class:opacity-60={eyedropperLoading}
      aria-label={t("theme.eyedropper", "从屏幕取色")}
      title={eyedropperSupported
        ? t("theme.eyedropper", "从屏幕取色")
        : t(
            "theme.eyedropperUnavailable",
            "当前浏览器不支持 EyeDropper API",
          )}
      type="button"
      disabled={eyedropperLoading || !eyedropperSupported}
      onclick={startEyeDropper}
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
            aria-label={t("theme.red", "红色")}
            type="number"
            min="0"
            max="255"
            bind:value={red}
            oninput={(event) => applyRgbColor("red", event)}
          />
          <span>R</span>
        </label>
        <label class="rgb-field">
          <input
            aria-label={t("theme.green", "绿色")}
            type="number"
            min="0"
            max="255"
            bind:value={green}
            oninput={(event) => applyRgbColor("green", event)}
          />
          <span>G</span>
        </label>
        <label class="rgb-field">
          <input
            aria-label={t("theme.blue", "蓝色")}
            type="number"
            min="0"
            max="255"
            bind:value={blue}
            oninput={(event) => applyRgbColor("blue", event)}
          />
          <span>B</span>
        </label>
      </div>
    {:else}
      <label class="hex-field min-w-0 flex-1">
        <input
          class:invalid={hexInputInvalid}
          aria-label={t("theme.hexRgb", "十六进制 RGB")}
          aria-invalid={hexInputInvalid}
          aria-describedby={hexInputInvalid ? "hex-color-error" : undefined}
          type="text"
          maxlength="7"
          placeholder="#E28247"
          bind:value={hexInput}
          oninput={applyHexColor}
          onblur={restoreHexInput}
        />
        <span>HEX</span>
        {#if hexInputInvalid}
          <span id="hex-color-error" class="sr-only" role="alert">
            {t(
              "theme.invalidHex",
              "请输入有效的 3 位或 6 位十六进制颜色",
            )}
          </span>
        {/if}
      </label>
    {/if}
    <button
      class="color-mode-button btn-plain"
      aria-label={inputMode === "rgb"
        ? t("theme.switchToHex", "切换到十六进制输入")
        : t("theme.switchToRgb", "切换到 RGB 输入")}
      title={inputMode === "rgb"
        ? t("theme.switchToHex", "切换到十六进制输入")
        : t("theme.switchToRgb", "切换到 RGB 输入")}
      aria-pressed={inputMode === "hex"}
      type="button"
      onclick={toggleInputMode}
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

  .saturation-value-picker:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
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
