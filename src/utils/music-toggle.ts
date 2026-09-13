/**
 * Top-bar music toggle.
 *
 * The button lives in the navbar while the `<audio>` element belongs to the
 * sidebar widget, so the two coordinate through `window.__fuwariMusic`. The
 * player publishes that object and fires it on every play/pause change, which
 * means this button reflects the *real* playback state: if the browser blocks
 * an autoplay attempt, the icon stays paused instead of spinning misleadingly.
 *
 * The button is only rendered by `Navbar.astro` when a configured music widget
 * exists, so a missing knob here means the player has not loaded yet, not that
 * music is unconfigured.
 */

interface ToggleElements {
  button: HTMLElement;
  idleIcon: HTMLElement | null;
  playingIcon: HTMLElement | null;
  playLabel: string;
  pauseLabel: string;
}

function collectToggle(): ToggleElements | null {
  const button = document.getElementById("music-toggle");
  if (!button) return null;
  return {
    button,
    idleIcon: button.querySelector(".music-toggle-icon"),
    playingIcon: button.querySelector(".music-toggle-playing"),
    playLabel: button.getAttribute("aria-label") || "Play music",
    // Renaming on play is the only label this button changes, so the strings
    // come from the same inline i18n map the player uses.
    pauseLabel: window.i18nResources?.["nav.musicPause"] || "Pause music",
  };
}

function renderState(elements: ToggleElements, playing: boolean): void {
  elements.idleIcon?.classList.toggle("opacity-0", playing);
  elements.playingIcon?.classList.toggle("opacity-0", !playing);
  elements.button.setAttribute("aria-pressed", String(playing));
  const label = playing ? elements.pauseLabel : elements.playLabel;
  elements.button.setAttribute("aria-label", label);
  elements.button.setAttribute("title", label);
}

export function initMusicToggle(): void {
  const elements = collectToggle();
  if (!elements || elements.button.dataset.musicBound === "true") return;
  elements.button.dataset.musicBound = "true";

  renderState(elements, false);

  elements.button.addEventListener("click", () => {
    window.__fuwariMusic?.toggle();
  });

  // `subscribe` replays the current state immediately, and the knob is created
  // by whichever side runs first, so this also covers the player loading later.
  window.__fuwariMusic?.subscribe((playing) => {
    renderState(elements, playing);
  });
}
