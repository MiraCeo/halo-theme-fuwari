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

Music is a **site-wide feature**, configured in the top-level `音乐` settings group
(`theme.config.music.*`), not a sidebar widget. It used to be a `widgets` array value, which
forced site-wide options like volume and autoplay to be duplicated per widget entry and buried
inside the array's edit dialog.

The logic is split four ways so it is testable without a browser:

- `src/components/widget/MusicPlayer.astro` - the player panel (`id="music-widget"`), markup only
- `src/components/widget/PlaylistItem.astro` - the `<template>` row the script clones per track
- `src/utils/music-player.ts` - `MUSIC_PLAYER_SOURCE` (the inline player) plus pure helpers
  (`formatTime`, `parseLRC`, `normalizeLyrics`, `parseCustomTracks`, `titleFromUrl`,
  `isLyricsUrl`, `buildMetingUrl`, `mapMetingTrack`)
- `src/utils/music-toggle.ts` - the top-bar play/pause button

**One player, two views.** The sidebar panel is the single owner of the `<audio>` element; the
top-bar button drives it through `window.__fuwariMusic` (typed in `src/global.d.ts`).
`SideBar.astro` renders the player whenever music is enabled and hides the _wrapper_ when
`show_sidebar` is off - it must not remove the player, or the top-bar button would have nothing to
control. Both surfaces being needed is not redundancy: `Layout.astro` applies `navbar-hidden`
(`-translate-y-16 opacity-0`) once the page scrolls past ~234px with a banner enabled, so the
top-bar button is gone for the whole of a long article.

**Sources.** A player plays from one of two fields, each behind its own `enable` switch, and the
custom list wins when both are on:

- `custom_tracks` (recommended) - one nested `group` per track slot (`slot1..slot4`), each holding
  `audio`, `name`, `cover` and `lyrics`. Audio and covers are Halo attachments, so there is no
  third-party dependency. Fields after the audio picker are hidden until a file is chosen. A blank
  title falls back to the audio filename (`titleFromUrl`); ID3 tags are not readable because an
  attachment field hands over a URL, not a file.
- `meting.api` - a Meting server URL. There is deliberately **no built-in default**: the previous
  default mirror died and broke every install that relied on it.

Slots are nested groups rather than an `array` field because Halo always opens array items in an
"编辑条目" dialog, which made later edits awkward.

Halo serialises those groups as a Java `Map.toString()` (`{slot1={audio=...}}`) or as JSON,
depending on the build, so `parseCustomTracks` accepts nested slots, flat `slot1_audio` keys, an
`items` array and plain JSON. A comma inside a filename is only treated as a field separator when
the brace nesting is back at the top and a `key=` follows.

**Custom tracks travel in a `script[type=text/plain]` element**, not a data attribute: JSON is full
of quotes and HTML-escaping it into an attribute is the fragile path. Thymeleaf injects it with
`th:utext` and the player reads `textContent`. The type is `text/plain`, not `application/json`,
because the server may emit a Java `toString()` dump, which is not valid JSON.

**Missing means enabled** for `show_toggle` and `show_sidebar`: a config saved before those keys
existed has no value, and a wrong `false` hides a surface with no way to tell why.

The script still has to run inline: the sidebar sits **outside** Swup's replaced containers, so the
widget is never re-rendered and must bind on first parse. Two constraints follow:

- Astro compiles the inside of a `<script>` tag **even when it is `is:inline`**, so the player
  cannot be interpolated there as an expression (it fails with an SWC "expected a semicolon" error).
  `MusicPlayer.astro` therefore emits it via `<Fragment set:html={...} />`, which Astro passes
  through untouched.
- `MUSIC_PLAYER_SOURCE` must stay plain ES2020 with no `${...}` and no `</script` sequence, and it
  must not contain an unescaped backtick: it lives in a template literal, so a stray backtick or
  close tag silently truncates the literal and the build fails with a confusing
  "`',' expected`" far from the real line. `buildMusicPlayerScript()` guards the close tag, and
  `tests/music-player.test.mts` asserts both properties.

### Key Files

- `astro.config.mjs` - Astro config with integrations
- `theme.yaml` - Halo theme metadata (`requires: ">=2.25.0"`, version must be bumped here for releases)
- `settings.yaml` - Halo theme settings schema (`theme-fuwari-miraceo-setting`), groups: base / style / sidebar / music / profile / post / beian
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
- The music player's correctness depends on `#sidebar` staying **outside** Swup's `main` /
  `#toc-container`. Moving it inside would make Swup replace it on every navigation, and the new
  element would never be bound because it binds once at parse time. If the sidebar ever moves, the
  player needs rebinding on `swup` `page:view`.
- Never put a Thymeleaf attribute on Astro's `<Fragment>`. A multi-line `th:if` there fails the
  build with "unterminated string constant" pointing at an unrelated line. Use
  `<div class="contents">` when a wrapper is needed, and lift long EL into a frontmatter constant.
- `MUSIC_PLAYER_SOURCE` sets `audio.crossOrigin = "anonymous"`, which nothing in the widget needs.
  It is harmless for same-origin Halo attachments and for Meting mirrors that send
  `Access-Control-Allow-Origin` (verified against a working public mirror). If playback ever
  fails for every track with a CORS error while the URL works in a plain `<audio>` tag, that line
  is the first suspect.
- `parseLRC` treats metadata tags such as `[ti:...]` / `[ar:...]` as non-lyrics and drops them, and
  keeps untimed lines with `time: -1` after the timed ones. Because untimed lines cannot be
  highlighted, a track whose lyrics are entirely untimed hides the lyrics button.
- Visitor-facing music labels are resolved twice on purpose: Thymeleaf renders them server-side so
  the widget is never briefly English, and `MUSIC_PLAYER_SOURCE` re-applies them through
  `window.i18nResources` for states that only exist at runtime (play/pause, active track).
- Do not reintroduce a hardcoded default music API. The previous one (`api.i-meto.com`) stopped
  serving and left every fresh install showing a load failure. Public Meting mirrors are all
  unofficial and die regularly; the theme now ships no default and offers the custom track list
  instead.
- **Halo merges a theme's saved config with the new schema rather than replacing it**, so removing
  a field from `settings.yaml` leaves its old key behind in the ConfigMap. A live install was
  observed carrying both `custom_tracks.items` (from an early `array` schema) and
  `custom_tracks.slot1..4` (the current shape) simultaneously. `parseCustomTracks` reads the slot
  keys first and ignores leftovers, but never assume the stored shape matches the current schema.
- Theme upgrades on a live Halo do not always take effect: an install was found serving a build
  whose templates predate the uploaded package while the front end still worked. When a fix
  "doesn't work" after deploying, compare the emitted markup against the package before debugging
  the code - look for a marker only the new build contains, such as a new `theme.config.*` path.
  Asset filenames are content-hashed and matched across builds, so they do not identify a version.
