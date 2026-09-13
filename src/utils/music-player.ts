/*
 * Client-side behaviour of the sidebar music widget.
 *
 * This module owns the widget's client logic. It is consumed two ways, because
 * the widget must bind during initial HTML parsing rather than waiting for a
 * deferred module:
 *
 *   1. `MusicPlayer.astro` renders `MUSIC_PLAYER_SOURCE` into an inline
 *      `<script is:inline>` block. The snippet is an IIFE body and receives the
 *      per-widget element id through `define:vars`.
 *   2. The pure helpers (`formatTime`, `parseLRC`, `isLyricsUrl`,
 *      `buildMetingUrl`, `mapMetingTrack`) are exported for tests and for any
 *      future module-based caller.
 *
 * `MUSIC_PLAYER_SOURCE` must stay valid inside an `is:inline` script: plain
 * ES2020, no imports, no TypeScript syntax. It must also never contain the
 * character sequence that closes a script element, since the block is emitted
 * verbatim.
 */

export interface MusicTrack {
  name: string;
  artist: string;
  url: string;
  pic: string;
  lrc: string;
}

export interface MusicLyricLine {
  time: number;
  text: string;
}

export interface MusicSourceConfig {
  api: string;
  server: string;
  type: string;
  id: string;
}

/** Seconds -> `m:ss`; unusable input becomes `0:00`. */
export function formatTime(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

/**
 * Parse LRC text into time-ordered lines. A line carrying several timestamps
 * yields one entry per timestamp, which is how repeated choruses are written.
 * `[mm:ss.xx]` (centiseconds) and `[mm:ss.xxx]` (milliseconds) are both
 * accepted; the fraction divisor follows the digit count.
 */
export function parseLRC(lrc: string | undefined | null): MusicLyricLine[] {
  if (!lrc) return [];
  const result: MusicLyricLine[] = [];
  const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
  lrc.split("\n").forEach((line) => {
    const matches = Array.from(line.matchAll(timeReg));
    if (matches.length === 0) return;
    const text = line.replace(timeReg, "").trim();
    if (!text) return;
    matches.forEach((match) => {
      const m = Number.parseInt(match[1], 10);
      const s = Number.parseInt(match[2], 10);
      const ms = Number.parseInt(match[3], 10);
      const time = m * 60 + s + ms / (match[3].length === 3 ? 1000 : 100);
      result.push({ time, text });
    });
  });
  return result.sort((a, b) => a.time - b.time);
}

/**
 * Decide whether a track's `lrc` field is a URL to fetch or the lyrics itself.
 * Meting returns either, and plain lyrics are indistinguishable from a relative
 * path without this check.
 */
export function isLyricsUrl(value: string): boolean {
  return (
    /^(https?:)?\/\//.test(value) ||
    value.startsWith("/") ||
    /\.(lrc|txt)(\?|#|$)/i.test(value)
  );
}

/** Expand a Meting-style API template with the widget's current settings. */
export function buildMetingUrl(config: MusicSourceConfig): string {
  return config.api
    .replace(":server", encodeURIComponent(config.server))
    .replace(":type", encodeURIComponent(config.type))
    .replace(":id", encodeURIComponent(config.id))
    .replace(":r", String(Math.random()));
}

/** Normalise one Meting response entry into a track, tolerating both schemas. */
export function mapMetingTrack(item: Record<string, unknown>): MusicTrack {
  return {
    name: String(item.title || item.name || "Unknown"),
    artist: String(item.author || item.artist || "Unknown"),
    url: String(item.url ?? ""),
    pic: String(item.pic || item.cover || ""),
    lrc: String(item.lrc ?? ""),
  };
}

/**
 * Build the complete inline `<script>` body for one widget instance.
 *
 * Astro compiles the contents of a `<script>` tag even when it is `is:inline`,
 * so the player cannot be interpolated as an expression there. Callers render
 * this string through `set:html` instead, which Astro passes through untouched.
 *
 * The source is a function body, so it is wrapped in an IIFE with the widget id
 * bound as a parameter: that keeps the snippet self-contained and avoids
 * depending on any surrounding scope.
 */
export function buildMusicPlayerScript(widgetId: string): string {
  return `(function (widgetId) {${MUSIC_PLAYER_SOURCE}\n})(${JSON.stringify(widgetId)});`;
}

/**
 * The inline player. Must stay valid inside an `is:inline` script: plain
 * ES2020, no imports, no TypeScript syntax, and no `</script>` sequence.
 *
 * `widgetId` is bound by `buildMusicPlayerScript`; every other value is read
 * from the widget's own data attributes so nothing has to be inlined per
 * instance.
 */
export const MUSIC_PLAYER_SOURCE = `
    const widget = document.getElementById(widgetId);
    if (!widget || widget.dataset.fireflyBound === "true") return;
    widget.dataset.fireflyBound = "true";

    const resources = window.i18nResources || {};
    const t = (key, fallback) => {
      const value = resources[key];
      return value && !value.includes("#{") ? value : fallback;
    };

    const cfg = {
      server: widget.dataset.server || "netease",
      type: widget.dataset.type || "playlist",
      id: widget.dataset.id || "",
      api:
        widget.dataset.api ||
        "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
      volume: Number.parseFloat(widget.dataset.volume || "0.7"),
      playMode: widget.dataset.playMode || "list",
      showLyrics: widget.dataset.showLyrics !== "false",
      i18n: {
        noPlaying: t("widget.music.noPlaying", "\\u672a\\u64ad\\u653e"),
        lyrics: t("widget.music.lyrics", "\\u6b4c\\u8bcd"),
        volume: t("widget.music.volume", "\\u97f3\\u91cf"),
        playMode: t("widget.music.playMode", "\\u64ad\\u653e\\u6a21\\u5f0f"),
        prev: t("widget.music.prev", "\\u4e0a\\u4e00\\u9996"),
        next: t("widget.music.next", "\\u4e0b\\u4e00\\u9996"),
        playlist: t("widget.music.playlist", "\\u64ad\\u653e\\u5217\\u8868"),
        noLyrics: t("widget.music.noLyrics", "\\u6682\\u65e0\\u6b4c\\u8bcd"),
        loadingLyrics: t(
          "widget.music.loadingLyrics",
          "\\u6b63\\u5728\\u52a0\\u8f7d\\u6b4c\\u8bcd",
        ),
        failedLyrics: t(
          "widget.music.failedLyrics",
          "\\u6b4c\\u8bcd\\u52a0\\u8f7d\\u5931\\u8d25",
        ),
        noSongs: t("widget.music.noSongs", "\\u6682\\u65e0\\u6b4c\\u66f2"),
        error: t("widget.music.error", "\\u97f3\\u4e50\\u52a0\\u8f7d\\u5931\\u8d25"),
        play: t("widget.music.play", "\\u64ad\\u653e"),
        pause: t("widget.music.pause", "\\u6682\\u505c"),
        progress: t("widget.music.progress", "\\u64ad\\u653e\\u8fdb\\u5ea6"),
        noCover: t("widget.music.noCover", "\\u65e0\\u5c01\\u9762"),
      },
    };

    const formatTime = (seconds) => {
      if (!seconds || Number.isNaN(seconds)) return "0:00";
      const min = Math.floor(seconds / 60);
      const sec = Math.floor(seconds % 60);
      return min + ":" + (sec < 10 ? "0" : "") + sec;
    };

    const parseLRC = (lrc) => {
      if (!lrc) return [];
      const result = [];
      const timeReg = /\\[(\\d{2}):(\\d{2})\\.(\\d{2,3})\\]/g;
      lrc.split("\\n").forEach((line) => {
        const matches = Array.from(line.matchAll(timeReg));
        if (matches.length === 0) return;
        const text = line.replace(timeReg, "").trim();
        if (!text) return;
        matches.forEach((match) => {
          const m = Number.parseInt(match[1], 10);
          const s = Number.parseInt(match[2], 10);
          const ms = Number.parseInt(match[3], 10);
          const time = m * 60 + s + ms / (match[3].length === 3 ? 1000 : 100);
          result.push({ time, text });
        });
      });
      return result.sort((a, b) => a.time - b.time);
    };

    const isLyricsUrl = (value) =>
      /^(https?:)?\\/\\//.test(value) ||
      value.startsWith("/") ||
      /\\.(lrc|txt)(\\?|#|$)/i.test(value);

    const buildMetingUrl = () =>
      cfg.api
        .replace(":server", encodeURIComponent(cfg.server))
        .replace(":type", encodeURIComponent(cfg.type))
        .replace(":id", encodeURIComponent(cfg.id))
        .replace(":r", String(Math.random()));

    const mapMetingTrack = (item) => ({
      name: item.title || item.name || "Unknown",
      artist: item.author || item.artist || "Unknown",
      url: item.url || "",
      pic: item.pic || item.cover || "",
      lrc: item.lrc || "",
    });

    const ui = {
      loading: widget.querySelector(".music-loading"),
      cover: widget.querySelector(".music-cover"),
      title: widget.querySelector(".music-title"),
      artist: widget.querySelector(".music-artist"),
      progressBar: widget.querySelector(".progress-bar"),
      progressThumb: widget.querySelector(".progress-thumb"),
      progressContainer: widget.querySelector(".progress-container"),
      currentTime: widget.querySelector(".current-time"),
      totalTime: widget.querySelector(".total-time"),
      btnPlay: widget.querySelector(".btn-play"),
      iconPlay: widget.querySelector(".icon-play"),
      iconPause: widget.querySelector(".icon-pause"),
      btnPrev: widget.querySelector(".btn-prev"),
      btnNext: widget.querySelector(".btn-next"),
      btnRepeat: widget.querySelector(".btn-repeat"),
      iconRepeat: widget.querySelector(".icon-repeat"),
      iconRepeatOne: widget.querySelector(".icon-repeat-one"),
      iconShuffle: widget.querySelector(".icon-shuffle"),
      btnMute: widget.querySelector(".btn-mute"),
      iconVolHigh: widget.querySelector(".icon-vol-high"),
      iconVolMute: widget.querySelector(".icon-vol-mute"),
      volContainer: widget.querySelector(".vol-container"),
      volBar: widget.querySelector(".vol-bar"),
      btnLrc: widget.querySelector(".btn-lrc-toggle"),
      iconLrcOn: widget.querySelector(".icon-lrc-on"),
      iconLrcOff: widget.querySelector(".icon-lrc-off"),
      lrcDrawer: widget.querySelector(".lrc-drawer"),
      lrcContainer: widget.querySelector(".lrc-container"),
      btnDrawer: widget.querySelector(".btn-drawer-toggle"),
      playlistDrawer: widget.querySelector(".playlist-drawer"),
      playlistContainer: widget.querySelector(".playlist-container"),
      itemTemplate: document.getElementById(
        "playlist-item-template-" + widgetId,
      ),
    };

    // The markup already carries localised labels from Thymeleaf; these keep the
    // runtime state (play/pause, volume, active track) in the same language.
    ui.artist.textContent = cfg.i18n.noPlaying;
    ui.btnPlay.title = cfg.i18n.play;
    ui.btnPlay.setAttribute("aria-label", cfg.i18n.play);
    ui.btnLrc.title = cfg.i18n.lyrics;
    ui.btnLrc.setAttribute("aria-label", cfg.i18n.lyrics);
    ui.btnMute.title = cfg.i18n.volume;
    ui.btnMute.setAttribute("aria-label", cfg.i18n.volume);
    ui.btnRepeat.title = cfg.i18n.playMode;
    ui.btnRepeat.setAttribute("aria-label", cfg.i18n.playMode);
    ui.btnPrev.title = cfg.i18n.prev;
    ui.btnPrev.setAttribute("aria-label", cfg.i18n.prev);
    ui.btnNext.title = cfg.i18n.next;
    ui.btnNext.setAttribute("aria-label", cfg.i18n.next);
    ui.btnDrawer.title = cfg.i18n.playlist;
    ui.btnDrawer.setAttribute("aria-label", cfg.i18n.playlist);
    ui.progressContainer.setAttribute("aria-label", cfg.i18n.progress);
    ui.volContainer.setAttribute("aria-label", cfg.i18n.volume);
    ui.lrcContainer.setAttribute("aria-label", cfg.i18n.lyrics);
    ui.playlistContainer.setAttribute("aria-label", cfg.i18n.playlist);
    ui.cover.alt = cfg.i18n.noCover;

    if (!cfg.showLyrics) ui.btnLrc.classList.add("hidden");

    const clamp01 = (value) => Math.max(0, Math.min(1, value));

    const state = {
      playlist: [],
      currentIndex: 0,
      playMode: cfg.playMode === "random" ? 2 : cfg.playMode === "one" ? 1 : 0,
      // A configured volume outside 0..1 makes the browser throw when assigned
      // to audio.volume, which would abort this whole binding pass.
      volume: Number.isFinite(cfg.volume) ? clamp01(cfg.volume) : 0.7,
      isMuted: false,
      lyrics: [],
      currentLrcIndex: -1,
      isUserScrolling: false,
      scrollTimeout: 0,
      lyricsRequest: 0,
    };

    const audio = document.createElement("audio");
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.volume = state.volume;
    audio.style.display = "none";
    widget.appendChild(audio);
    const setLoading = (isLoading) => {
      ui.loading.classList.toggle("opacity-0", !isLoading);
      ui.loading.classList.toggle("pointer-events-none", !isLoading);
    };

    const updatePlayStateUI = (isPlaying) => {
      ui.btnPlay.classList.toggle("bg-(--primary)", isPlaying);
      ui.btnPlay.classList.toggle("text-white", isPlaying);
      ui.btnPlay.classList.toggle("bg-(--btn-regular-bg)", !isPlaying);
      ui.btnPlay.classList.toggle("text-(--primary)", !isPlaying);
      ui.iconPlay.classList.toggle("hidden", isPlaying);
      ui.iconPause.classList.toggle("hidden", !isPlaying);
      ui.cover.style.animationPlayState = isPlaying ? "running" : "paused";
      ui.btnPlay.title = isPlaying ? cfg.i18n.pause : cfg.i18n.play;
      ui.btnPlay.setAttribute("aria-label", ui.btnPlay.title);
    };

    const updateModeUI = () => {
      ui.iconRepeat.classList.toggle("hidden", state.playMode !== 0);
      ui.iconRepeatOne.classList.toggle("hidden", state.playMode !== 1);
      ui.iconShuffle.classList.toggle("hidden", state.playMode !== 2);
      // The button carries the dark:text-neutral-* shade, which ties with
      // text-(--primary) on specificity and wins by source order, so the active
      // shade has to be toggled too or the indicator stays invisible in dark mode.
      ui.btnRepeat.classList.toggle("text-(--primary)", state.playMode !== 0);
      ui.btnRepeat.classList.toggle("text-neutral-300", state.playMode === 0);
      ui.btnRepeat.classList.toggle(
        "dark:text-neutral-600",
        state.playMode === 0,
      );
    };

    const updateVolumeUI = () => {
      const pct = state.isMuted ? 0 : state.volume * 100;
      ui.volBar.style.width = pct + "%";
      ui.volContainer.setAttribute("aria-valuenow", Math.round(pct));
      ui.iconVolHigh.classList.toggle(
        "hidden",
        state.isMuted || state.volume === 0,
      );
      ui.iconVolMute.classList.toggle(
        "hidden",
        !(state.isMuted || state.volume === 0),
      );
    };

    const updateTrackUI = (track) => {
      if (!track) return;
      ui.title.textContent = track.name;
      ui.title.title = track.name;
      ui.artist.textContent = track.artist;
      ui.artist.title = track.artist;
      ui.cover.classList.add("opacity-0");
      ui.cover.src = track.pic || "";
      ui.cover.alt = track.pic
        ? track.name + " - " + track.artist
        : cfg.i18n.noCover;
      ui.cover.classList.remove("animate-spin-slow");
      void ui.cover.offsetWidth;
      ui.cover.classList.add("animate-spin-slow");
      ui.cover.style.animationPlayState = "paused";
      ui.progressBar.style.width = "0%";
      ui.progressThumb.style.left = "0%";
      ui.progressContainer.setAttribute("aria-valuenow", "0");
      ui.currentTime.textContent = "0:00";
      ui.totalTime.textContent = "0:00";
    };

    // Repainting the list on every timeupdate was wasted work; only touch the
    // DOM when the active row actually changes.
    let renderedActiveIndex = -1;
    const updatePlaylistActiveUI = (force) => {
      if (!force && renderedActiveIndex === state.currentIndex) return;
      renderedActiveIndex = state.currentIndex;
      ui.playlistContainer.querySelectorAll(".playlist-item").forEach((el) => {
        const isActive =
          Number.parseInt(el.dataset.index, 10) === state.currentIndex;
        el.classList.toggle("bg-neutral-100", isActive);
        el.classList.toggle("dark:bg-white/10", isActive);
        // setAttribute/removeAttribute, not toggleAttribute: the latter emits
        // aria-current="" which ARIA resolves to false.
        if (isActive) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
        el.querySelector(".item-active-overlay")?.classList.toggle(
          "hidden",
          !isActive,
        );
        el.querySelector(".item-active-overlay")?.classList.toggle(
          "flex",
          isActive,
        );
        el.querySelector(".item-title")?.classList.toggle(
          "text-(--primary)",
          isActive,
        );
      });
    };

    const renderPlaylist = () => {
      ui.playlistContainer.innerHTML = "";
      state.playlist.forEach((track, index) => {
        const clone = ui.itemTemplate.content.cloneNode(true);
        const item = clone.querySelector(".playlist-item");
        const img = clone.querySelector(".item-cover");
        const title = clone.querySelector(".item-title");
        const artist = clone.querySelector(".item-artist");
        img.src = track.pic || "";
        img.alt = track.name + " - " + track.artist;
        title.textContent = track.name;
        artist.textContent = track.artist;
        item.dataset.index = index;
        item.setAttribute("role", "option");
        item.setAttribute("aria-label", track.name + " - " + track.artist);
        item.addEventListener("click", () => playTrackByIndex(index));
        ui.playlistContainer.appendChild(clone);
      });
      updatePlaylistActiveUI(true);
    };

    const renderLyricsUI = (lyrics, status) => {
      state.currentLrcIndex = -1;
      ui.lrcContainer.innerHTML = "";
      const message = {
        loading: cfg.i18n.loadingLyrics,
        failed: cfg.i18n.failedLyrics,
        none: cfg.i18n.noLyrics,
      }[status];
      if (message || !lyrics.length) {
        const notice = document.createElement("div");
        notice.className = "py-10 text-sm text-neutral-400";
        notice.setAttribute("role", "option");
        notice.textContent = message || cfg.i18n.noLyrics;
        ui.lrcContainer.appendChild(notice);
        return;
      }
      lyrics.forEach((line, index) => {
        const lineEl = document.createElement("div");
        lineEl.className =
          "lrc-line cursor-pointer py-1 text-sm text-neutral-400 transition-all duration-300 hover:text-(--primary)";
        lineEl.textContent = line.text;
        lineEl.dataset.index = String(index);
        lineEl.setAttribute("role", "option");
        lineEl.addEventListener("click", () => {
          if (audio.duration) audio.currentTime = line.time;
        });
        ui.lrcContainer.appendChild(lineEl);
      });
    };

    const updateLrcHighlight = (index) => {
      if (index === state.currentLrcIndex) return;
      state.currentLrcIndex = index;
      ui.lrcContainer.querySelectorAll(".lrc-line").forEach((line, i) => {
        const active = i === index;
        line.classList.toggle("text-(--primary)", active);
        line.classList.toggle("font-bold", active);
        line.classList.toggle("text-base", active);
        line.classList.toggle("text-sm", !active);
        line.classList.toggle("text-neutral-400", !active);
      });
      if (index === -1 || state.isUserScrolling) return;
      const line = ui.lrcContainer.querySelector(
        '.lrc-line[data-index="' + index + '"]',
      );
      if (!line) return;
      const top =
        line.offsetTop -
        ui.lrcContainer.clientHeight / 2 +
        line.offsetHeight / 2;
      ui.lrcContainer.scrollTo({ top, behavior: "smooth" });
    };

    const loadLyrics = (track) => {
      // A slow fetch for a previous track must not land in the lyrics pane
      // after the visitor already moved on.
      state.lyricsRequest += 1;
      const requestId = state.lyricsRequest;
      const isCurrent = () => requestId === state.lyricsRequest;
      state.lyrics = [];

      if (!track.lrc) {
        renderLyricsUI([], "none");
        return;
      }
      if (!isLyricsUrl(track.lrc)) {
        state.lyrics = parseLRC(track.lrc);
        renderLyricsUI(state.lyrics, state.lyrics.length ? "loaded" : "none");
        return;
      }
      renderLyricsUI([], "loading");
      fetch(track.lrc)
        .then((res) => res.text())
        .then((text) => {
          if (!isCurrent()) return;
          state.lyrics = parseLRC(text);
          renderLyricsUI(
            state.lyrics,
            state.lyrics.length ? "loaded" : "none",
          );
        })
        .catch(() => {
          if (isCurrent()) renderLyricsUI([], "failed");
        });
    };

    const loadTrack = (index, autoPlay) => {
      if (index < 0 || index >= state.playlist.length) return;
      state.currentIndex = index;
      const track = state.playlist[index];
      audio.src = track.url;
      loadLyrics(track);
      updateTrackUI(track);
      updatePlaylistActiveUI(false);
      if (autoPlay) {
        audio
          .play()
          .then(() => updatePlayStateUI(true))
          .catch(() => updatePlayStateUI(false));
      } else {
        updatePlayStateUI(false);
      }
    };

    const nextIndex = (step) => {
      const length = state.playlist.length;
      if (state.playMode === 2 && length > 1) {
        let candidate = state.currentIndex;
        while (candidate === state.currentIndex) {
          candidate = Math.floor(Math.random() * length);
        }
        return candidate;
      }
      return (state.currentIndex + step + length) % length;
    };

    const playNext = (autoEnded) => {
      if (!state.playlist.length) return;
      if (state.playMode === 1 && autoEnded) {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      loadTrack(nextIndex(1), true);
    };

    const playPrev = () => {
      if (!state.playlist.length) return;
      loadTrack(nextIndex(-1), true);
    };

    const togglePlay = () => {
      if (!state.playlist.length) return;
      if (audio.paused) {
        // Without this catch a blocked autoplay rejects unhandled.
        audio
          .play()
          .then(() => updatePlayStateUI(true))
          .catch(() => updatePlayStateUI(false));
      } else {
        audio.pause();
        updatePlayStateUI(false);
      }
    };

    const playTrackByIndex = (index) => {
      if (index === state.currentIndex && !audio.paused) {
        togglePlay();
      } else {
        loadTrack(index, true);
      }
    };

    const setDrawer = (drawer, open) => {
      drawer.style.gridTemplateRows = open ? "1fr" : "0fr";
      drawer.classList.toggle("opacity-100", open);
      drawer.classList.toggle("opacity-0", !open);
    };

    const setVolume = (next) => {
      state.volume = clamp01(next);
      state.isMuted = false;
      audio.volume = state.volume;
      audio.muted = false;
      updateVolumeUI();
    };

    const seekTo = (seconds) => {
      if (!audio.duration) return;
      audio.currentTime = Math.max(0, Math.min(audio.duration, seconds));
    };

    const onSliderKeydown = (event, apply) => {
      const step = event.shiftKey ? 10 : 2;
      let handled = true;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp":
          apply(step);
          break;
        case "ArrowLeft":
        case "ArrowDown":
          apply(-step);
          break;
        case "Home":
          apply(-Infinity);
          break;
        case "End":
          apply(Infinity);
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    };

    const isAllTheWay = (delta) => !Number.isFinite(delta);

    ui.btnPlay.addEventListener("click", togglePlay);
    ui.btnNext.addEventListener("click", () => playNext(false));
    ui.btnPrev.addEventListener("click", playPrev);
    ui.btnRepeat.addEventListener("click", () => {
      state.playMode = (state.playMode + 1) % 3;
      updateModeUI();
    });
    ui.btnMute.addEventListener("click", () => {
      state.isMuted = !state.isMuted;
      audio.muted = state.isMuted;
      updateVolumeUI();
    });
    ui.volContainer.addEventListener("click", (event) => {
      const rect = ui.volContainer.getBoundingClientRect();
      if (!rect.width) return;
      setVolume((event.clientX - rect.left) / rect.width);
    });
    ui.volContainer.addEventListener("keydown", (event) =>
      onSliderKeydown(event, (delta) => {
        if (isAllTheWay(delta)) setVolume(delta < 0 ? 0 : 1);
        else setVolume(state.volume + delta / 100);
      }),
    );
    ui.progressContainer.addEventListener("click", (event) => {
      const rect = ui.progressContainer.getBoundingClientRect();
      if (!rect.width || !audio.duration) return;
      seekTo(((event.clientX - rect.left) / rect.width) * audio.duration);
    });
    ui.progressContainer.addEventListener("keydown", (event) =>
      onSliderKeydown(event, (delta) => {
        if (!audio.duration) return;
        if (isAllTheWay(delta)) seekTo(delta < 0 ? 0 : audio.duration);
        else seekTo(audio.currentTime + (delta / 100) * audio.duration);
      }),
    );
    ui.btnLrc.addEventListener("click", () => {
      const isOpen = ui.lrcDrawer.style.gridTemplateRows === "1fr";
      setDrawer(ui.playlistDrawer, false);
      ui.btnDrawer.classList.remove("text-(--primary)");
      ui.btnDrawer.setAttribute("aria-expanded", "false");
      setDrawer(ui.lrcDrawer, !isOpen);
      ui.btnLrc.classList.toggle("text-(--primary)", !isOpen);
      ui.btnLrc.setAttribute("aria-expanded", String(!isOpen));
      ui.iconLrcOn.classList.toggle("hidden", isOpen);
      ui.iconLrcOff.classList.toggle("hidden", !isOpen);
    });
    ui.btnDrawer.addEventListener("click", () => {
      const isOpen = ui.playlistDrawer.style.gridTemplateRows === "1fr";
      setDrawer(ui.lrcDrawer, false);
      ui.btnLrc.classList.remove("text-(--primary)");
      ui.btnLrc.setAttribute("aria-expanded", "false");
      ui.iconLrcOn.classList.add("hidden");
      ui.iconLrcOff.classList.remove("hidden");
      setDrawer(ui.playlistDrawer, !isOpen);
      ui.btnDrawer.classList.toggle("text-(--primary)", !isOpen);
      ui.btnDrawer.setAttribute("aria-expanded", String(!isOpen));
    });

    ui.cover.addEventListener("load", () =>
      ui.cover.classList.remove("opacity-0"),
    );
    ui.cover.addEventListener("error", () =>
      ui.cover.classList.add("opacity-0"),
    );

    const markUserScrolling = () => {
      state.isUserScrolling = true;
      window.clearTimeout(state.scrollTimeout);
      state.scrollTimeout = window.setTimeout(() => {
        state.isUserScrolling = false;
      }, 3000);
    };
    ui.lrcContainer.addEventListener("wheel", markUserScrolling);
    ui.lrcContainer.addEventListener("touchstart", markUserScrolling);

    audio.addEventListener("timeupdate", () => {
      if (Number.isNaN(audio.duration)) return;
      const progress = (audio.currentTime / audio.duration) * 100;
      ui.progressBar.style.width = progress + "%";
      ui.progressThumb.style.left = progress + "%";
      ui.progressContainer.setAttribute("aria-valuenow", Math.round(progress));
      ui.currentTime.textContent = formatTime(audio.currentTime);
      ui.totalTime.textContent = formatTime(audio.duration);
      if (state.lyrics.length) {
        let index = -1;
        for (let i = 0; i < state.lyrics.length; i += 1) {
          if (audio.currentTime >= state.lyrics[i].time) index = i;
          else break;
        }
        updateLrcHighlight(index);
      }
    });
    audio.addEventListener("ended", () => playNext(true));
    audio.addEventListener("error", () => {
      ui.title.textContent = cfg.i18n.error;
      setLoading(false);
    });
    // Keeps the button honest when playback is driven from outside the widget
    // (OS media keys, browser media controls, picture-in-picture).
    audio.addEventListener("play", () => updatePlayStateUI(true));
    audio.addEventListener("pause", () => updatePlayStateUI(false));

    updateModeUI();
    updateVolumeUI();
    setLoading(true);
    fetch(buildMetingUrl())
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        state.playlist = list
          .map(mapMetingTrack)
          .filter((track) => track.url);
        if (!state.playlist.length) {
          ui.title.textContent = cfg.i18n.noSongs;
          return;
        }
        renderPlaylist();
        loadTrack(
          state.playMode === 2
            ? Math.floor(Math.random() * state.playlist.length)
            : 0,
          false,
        );
      })
      .catch(() => {
        ui.title.textContent = cfg.i18n.error;
      })
      .finally(() => setLoading(false));
`;
