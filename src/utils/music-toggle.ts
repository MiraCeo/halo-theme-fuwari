/**
 * Top-bar music toggle.
 *
 * The button lives in the navbar while the `<audio>` element belongs to the
 * sidebar widget, so the two coordinate through `window.__fuwariMusic`. The
 * player publishes that object and fires it on every play/pause change, which
 * means this button reflects the *real* playback state: if the browser blocks
 * an autoplay attempt, the icon stays paused instead of spinning misleadingly.
 *
 * Visibility is decided here rather than with Thymeleaf. Server-side template
 * logic is unforgiving - an unsupported construct takes the whole page down -
 * so the markup ships the button hidden and this module reveals it only when a
 * player actually publishes itself. That also covers the case where the sidebar
 * carries a music widget that is not configured yet, which the server cannot
 * tell apart from a working one without iterating the widget array.
 */

const HIDDEN_CLASS = "hidden";

interface ToggleElements {
  button: HTMLElement;
  idleIcon: HTMLElement | null;
  playingIcon: HTMLElement | null;
  playLabel: string;
  pauseLabel: string;
}

/**
 * Resolve a label from the inline i18n map, ignoring unresolved Thymeleaf
 * placeholders the way the player does.
 */
function label(key: string, fallback: string): string {
  const value = window.i18nResources?.[key];
  return value && !value.includes("#{") ? value : fallback;
}

function collectToggle(): ToggleElements | null {
  const button = document.querySelector<HTMLElement>(".music-toggle-button");
  if (!button) return null;

  const serverLabel = button.getAttribute("aria-label") || "";
  const playLabel =
    serverLabel && !serverLabel.includes("#{")
      ? serverLabel
      : label("nav.musicPlay", "Play music");

  return {
    button,
    idleIcon: button.querySelector(".music-toggle-icon"),
    playingIcon: button.querySelector(".music-toggle-playing"),
    playLabel,
    pauseLabel: label("nav.musicPause", "Pause music"),
  };
}

function renderState(elements: ToggleElements, playing: boolean): void {
  elements.idleIcon?.classList.toggle("opacity-0", playing);
  elements.playingIcon?.classList.toggle("opacity-0", !playing);
  elements.button.setAttribute("aria-pressed", String(playing));
  const next = playing ? elements.pauseLabel : elements.playLabel;
  elements.button.setAttribute("aria-label", next);
  elements.button.setAttribute("title", next);
}

function reveal(elements: ToggleElements): void {
  elements.button.classList.remove(HIDDEN_CLASS);
}

/**
 * Read the "show top-bar music button" setting.
 *
 * Missing means enabled: the key does not exist in configs created before it was
 * added, and Halo only fills defaults in at install time. Returning "enabled"
 * for an absent key is also the only safe default, since a wrong `false` hides
 * the button with no way to discover why.
 */
function settingDisabled(): boolean {
  const text = document.getElementById("theme-config")?.textContent;
  if (!text) return false;
  try {
    return JSON.parse(text)?.base?.show_music_toggle === false;
  } catch {
    return false;
  }
}

export function initMusicToggle(): void {
  const elements = collectToggle();
  if (!elements || elements.button.dataset.musicBound === "true") return;
  elements.button.dataset.musicBound = "true";

  renderState(elements, false);

  if (settingDisabled()) return;

  const knob = window.__fuwariMusic;
  if (!knob) {
    // The player script has not run yet, or the sidebar has no music widget. It
    // is an inline script, so by the time this deferred bundle runs a real
    // player has already published itself; a missing knob therefore means there
    // is nothing to control.
    return;
  }

  // Only now is the button known to control something.
  reveal(elements);

  elements.button.addEventListener("click", () => {
    window.__fuwariMusic?.toggle();
  });

  // `subscribe` replays the current state immediately.
  knob.subscribe((playing) => {
    renderState(elements, playing);
  });
}
