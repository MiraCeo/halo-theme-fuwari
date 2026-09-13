# AGENTS.md

## Project Overview

Halo 2 CMS blog theme "Fuwari" (`theme-fuwari-miraceo`, maintained by MiraCeo) - an Astro-based
theme ported from the original [fuwari](https://github.com/saicaca/fuwari) Astro theme, via
[Jiewenhuang/halo-theme-fuwari](https://github.com/jiewenhuang/halo-theme-fuwari).

This branch installs alongside the upstream `theme-fuwari` theme: it uses its own theme name,
settings name, ConfigMap name, static asset base path, and editor UI plugin binding so the two
never share configuration.

**Tech Stack**: Astro 6, Vue 3, Svelte 5, Tailwind CSS 4, TypeScript, pnpm

## Commands

```bash
pnpm install            # Install dependencies (root workspace + ui-plugin)
pnpm dev                # Watch src/ and public/ with nodemon, rebuild on change
pnpm build:only         # Astro build only -> templates/
pnpm validate           # Check the built templates against settings.yaml
pnpm build              # build:ui-plugin -> astro build -> validate -> theme-package (zip into dist/)
pnpm build:pkg          # Alias of pnpm build
pnpm format             # Format with Prettier (includes .astro files)
```

**Testing**:

```bash
pnpm test               # template validator + theme-color + music-player checks
pnpm test:ui-plugin     # node --test on ui-plugin/tests/*.test.ts
pnpm --dir ui-plugin type-check
```

`pnpm test` covers the parts that fail silently: the template validator itself
(`scripts/validate-templates.test.mjs`, which injects one defect per case), the
shared colour maths (`tests/theme-color.test.mts`) and the sidebar music widget
logic (`tests/music-player.test.mts`, including that the generated inline script
parses as valid JavaScript). Run `npx tsc --noEmit` after touching `src/`.

## Architecture

### Astro compiles Halo templates, not a static site

The build output is a set of **Thymeleaf templates**, not static HTML. `astro.config.mjs` sets
`outDir: "./templates"` and `build.format: "file"`, and the `.astro` sources deliberately keep
`th:*` attributes that Halo resolves server-side:

- `th:text`, `th:if`, `th:href`, `th:content`, `th:classappend`, `th:style`, `th:with`
- Halo data is interpolated as literal `${site.title}`, `${theme.config.base.*}` strings in Astro props
- `templates/` is the build output (gitignored) - never edit it by hand

- Base path: `/themes/theme-fuwari-miraceo` (must match `theme.yaml` metadata name)
- Experimental Rust compiler enabled (`experimental.rustCompiler`)

### Editor UI plugin

`ui-plugin/` is a separate pnpm workspace package built with vite, shipped as the Halo UI plugin
`theme:theme-fuwari-miraceo`. It adds the `admonition` rich-text extension used by the post editor.
`ui-plugin/dist/` **is committed** (see `.gitignore`) so Halo can load it directly; rebuild it with
`pnpm build:ui-plugin` after changing anything under `ui-plugin/src/`.

### Source Structure

- `src/pages/` - Page templates (index, post, page, archives, categories, category, tags, tag, links, moments, moment, photos, photo)
- `src/layouts/` - `Layout.astro` (HTML shell, inline boot script, Swup lifecycle hooks), `MainGridLayout.astro` (navbar, banner, main grid, sidebar, TOC)
- `src/components/` - Mixed framework components:
  - `.astro` - Static components (Header, Footer, Navbar, PostCard, PostList, ConfigCarrier, etc.)
  - `.svelte` - Interactive components (Search, LightDarkSwitch, widget/DisplaySettings)
  - `.vue` - Interactive components (ThemeSwitcher, UserButton)
  - `control/`, `misc/`, `photos/`, `widget/` - Subgroups (pagination, image wrapper, photo EXIF/i18n, sidebar widgets)
- `src/styles/` - Layered CSS: `global.css` imports Tailwind plus `variables.css`, `base.css`, `components.css`, `markdown.css`, `music-player.css`, `transition.css`, `scrollbar.css`, `photoswipe.css`, `comment-widget.css`, `utilities.css`
- `src/utils/` - Runtime helpers (theme-color, music-player, setting-utils, content-photoswipe, photos-gallery-lightbox, photos/, date-utils, url-utils, content-utils)
- `src/constants/` - Layout constants, icon maps, link presets
- `src/types/` - `config.ts` (theme config shape), `searchResult.ts`
- `scripts/` - Build tooling: `validate-templates.mjs` (dependency-free HTML/Thymeleaf linter) plus its fault-injection test
- `tests/` - `theme-color.test.mts` and `music-player.test.mts`, run through node's type stripping

### Sidebar music widget

The widget is split three ways so the logic is testable without a browser:

- `src/components/widget/MusicPlayer.astro` - markup and per-widget ids only
- `src/components/widget/PlaylistItem.astro` - the `<template>` row the script clones per track
- `src/utils/music-player.ts` - `MUSIC_PLAYER_SOURCE` (the inline player) plus pure helpers
  (`formatTime`, `parseLRC`, `isLyricsUrl`, `buildMetingUrl`, `mapMetingTrack`)

The script still has to run inline: the sidebar sits **outside** Swup's replaced containers, so the
widget is never re-rendered and must bind on first parse. Two constraints follow:

- Astro compiles the inside of a `<script>` tag **even when it is `is:inline`**, so the player
  cannot be interpolated there as an expression (it fails with an SWC "expected a semicolon" error).
  `MusicPlayer.astro` therefore emits it via `<Fragment set:html={...} />`, which Astro passes
  through untouched.
- `MUSIC_PLAYER_SOURCE` must stay plain ES2020 with no `${...}` and no `</script` sequence.
  `buildMusicPlayerScript()` wraps it in an IIFE and binds `widgetId`; `tests/music-player.test.mts`
  asserts the result parses and that every `querySelector` class hook exists in the markup.

### Key Files

- `astro.config.mjs` - Astro config with integrations
- `theme.yaml` - Halo theme metadata (`requires: ">=2.25.0"`, version must be bumped here for releases)
- `settings.yaml` - Halo theme settings schema (`theme-fuwari-miraceo-setting`), groups: base / style / sidebar / profile / post / beian
- `ui-plugin/ui-plugin.yaml` - UI plugin metadata (name, version, `requires` - keep in sync with `theme.yaml`)
- `i18n/` - `default.properties`, `zh_CN.properties`, `zh_TW.properties`
- `nodemon.json` - Watches `src/**/*` and `public/**/*` for dev rebuilds
- `src/config.ts` - Client-side reader for the `#theme-config` JSON payload

### Runtime data flow

- **Theme config**: `Layout.astro` renders `<script type="application/json" id="theme-config" th:inline="javascript">/*[[${theme.config}]]*/</script>`. `ConfigCarrier.astro` exposes selected fields as `#config-carrier` data attributes; `src/config.ts` parses the JSON for client code.
- **i18n**: `Layout.astro` builds an inline script with `[(\#{key})]` expressions that populate `window.i18nResources` for client components.
- **Theme color**: configured value supports `#RGB`, `#RRGGBB`, or `rgb(r, g, b)`; invalid values fall back to the legacy numeric `hue`. `--theme-color` and `--hue` are set on `<html>`; visitor choice is stored in `localStorage["fuwari-miraceo-theme-color"]` and dark/light mode in `localStorage["theme"]`.
- **Colour maths has one home**: every conversion (`parseThemeColor`, `parseThemeColorHue`, `hueToHex`, `hexToHsv`, `hexToRgb`, `rgbToHex`, `hsvToHex`, `normalizeThemeColor`, `clamp`) lives in `src/utils/theme-color.ts`. The bundled `Layout.astro` script publishes them on `window.__fuwariThemeColor` before first paint, and the inline `<head>` script looks them up at call time instead of carrying a second copy. The shared module is imported by `setting-utils.ts`, `DisplaySettings.svelte`, and the inline script alike - add conversions there, never inline them again.
- **Page transitions**: `@swup/astro` with containers `main` and `#toc-container`; `Layout.astro` binds `visit:start` / `content:replace` / `page:view` hooks to re-init the scrollbar, PhotoSwipe lightboxes, banner, TOC, and legacy admonitions.

### External Dependencies

- `@halo-dev/api-client` - Halo API client
- `@swup/astro` - Page transitions (containers: `main`, `#toc-container`)
- `astro-icon` + `unplugin-icons` - Icon system (Iconify), configured in `astro.config.mjs`
- `overlayscrollbars` - Custom scrollbar
- `photoswipe` - Content and gallery lightboxes
- `sharp` - Image processing (requires native build)

## Conventions

- **Formatting**: Prettier with `prettier-plugin-astro` (config in `package.json`); lint-staged runs it on commit via husky
- **Icons**: Use Iconify icon classes (e.g., `icon-[mdi--github]`)
- **Theme Config**: Embedded in HTML via `#theme-config` script tag
- **Translations**: Halo i18n format in `i18n/*.properties`; keep `default`, `zh_CN`, and `zh_TW` in sync
- **Halo templates**: Keep `th:*` attributes intact; any literal Halo expression must be written so Astro does not try to interpret it
- **Theme identity**: Never reintroduce the bare `theme-fuwari` name, setting name, ConfigMap name, or base path
- **Never commit a build that fails `pnpm validate`**: the validator exists precisely because Astro cannot see template errors. If a legitimate pattern trips it, fix the rule rather than silencing the check

## CI/CD

- `.github/workflows/cd.yaml` triggers on published releases
- Uses `halo-sigs/reusable-workflows/.github/workflows/theme-cd.yaml@v4` (pnpm 10, Node 24)
- `skip-appstore-release: true` - releases are published to GitHub only, not the Halo app store
- Requires `HALO_PAT` secret for publishing

## Gotchas

- `templates/` and `_fuwari/` are gitignored - don't edit build output; `_fuwari/` holds the original fuwari source for reference when checked out
- `ui-plugin/dist/` is tracked in git and must be rebuilt before release
- `dist/` holds versioned theme zips produced by `theme-package`
- Node.js >= 22.12.0 required locally
- `pnpm-workspace.yaml` declares the workspace packages (`.`, `ui-plugin`) and allows native builds for esbuild and sharp
- Bumping a version means updating `theme.yaml` and `ui-plugin/ui-plugin.yaml` together
- `theme.config.base.themeColor.hue` is intentionally absent from `settings.yaml`: it is the legacy
  hue key that upgraded installs may still carry, and it is listed in `LEGACY_CONFIG_PATHS` in the
  validator so it does not read as a broken reference
- The visitor picker rounds hue to whole degrees, so a few colours shift by one step when read back
  (`#8066F0` -> `#7F66F0`). This predates the shared-module refactor; `tests/theme-color.test.mts`
  pins the current behaviour rather than pretending it is exact
- `prettier` has no Svelte plugin configured, so `.svelte` files are not covered by `pnpm format`
- The music widget's correctness depends on `#sidebar` staying **outside** Swup's `main` /
  `#toc-container`. Moving it inside would make Swup replace it on every navigation, and the new
  element would never be bound because the per-page `widgetId` differs. If the sidebar ever moves,
  the widget needs rebinding on `swup` `page:view` instead of a parse-time binding.
- `MUSIC_PLAYER_SOURCE` sets `audio.crossOrigin = "anonymous"`, which nothing in the widget needs.
  It is harmless only while the configured Meting API and audio URLs return
  `Access-Control-Allow-Origin`; if playback ever fails across all tracks with a CORS error while
  the URL works in a plain `<audio>` tag, that line is the first suspect. Not verified against a
  live Meting instance.
- `parseLRC` requires a fractional part, so `[mm:ss]` timestamps are ignored, and `[offset:]` tags
  are not honoured. Meting output uses the fractional form.
- Visitor-facing music labels are resolved twice on purpose: Thymeleaf renders them server-side so
  the widget is never briefly English, and `MUSIC_PLAYER_SOURCE` re-applies them through
  `window.i18nResources` for states that only exist at runtime (play/pause, active track).
