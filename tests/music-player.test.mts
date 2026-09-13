// Checks for the sidebar music widget logic extracted to
// src/utils/music-player.ts.
//
//   node --experimental-strip-types tests/music-player.test.mts
//
// The inline player snippet is generated from source, so the checks that matter
// most here are: the pure helpers behave as they did before the extraction, and
// the generated snippet is syntactically valid JavaScript. A syntax error there
// would only surface in a browser, after a full theme build.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MUSIC_PLAYER_SOURCE,
  buildMetingUrl,
  buildMusicPlayerScript,
  formatTime,
  isLyricsUrl,
  mapMetingTrack,
  normalizeLyrics,
  parseCustomTracks,
  parseLRC,
} from "../src/utils/music-player.ts";

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

// --- formatTime ---

check("formatTime: pads seconds and handles unusable input", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(5), "0:05");
  assert.equal(formatTime(59), "0:59");
  assert.equal(formatTime(60), "1:00");
  assert.equal(formatTime(61), "1:01");
  assert.equal(formatTime(599), "9:59");
  assert.equal(formatTime(600), "10:00");
  assert.equal(formatTime(3600), "60:00");
  assert.equal(formatTime(1.9), "0:01", "fractions floor, not round");
});

check("formatTime: mirrors the original falsy guard", () => {
  // The shipped implementation is `if (!seconds || Number.isNaN(seconds))`, so
  // NaN, undefined and 0 all collapse to the placeholder. Negative values were
  // never expected and produce this exact garbage; pinned so the behaviour stays
  // visible rather than being discovered later.
  assert.equal(formatTime(Number.NaN), "0:00");
  assert.equal(formatTime(undefined as unknown as number), "0:00");
  assert.equal(formatTime(-1), "-1:0-1");
});

// --- parseLRC ---

check("parseLRC: parses centisecond and millisecond timestamps", () => {
  assert.deepEqual(parseLRC("[00:01.50]half"), [{ time: 1.5, text: "half" }]);
  assert.deepEqual(parseLRC("[00:01.500]half"), [{ time: 1.5, text: "half" }]);
  assert.deepEqual(parseLRC("[01:00.00]minute"), [
    { time: 60, text: "minute" },
  ]);
});

check(
  "parseLRC: one line with several timestamps yields one entry each",
  () => {
    assert.deepEqual(parseLRC("[00:10.00][01:20.00]chorus"), [
      { time: 10, text: "chorus" },
      { time: 80, text: "chorus" },
    ]);
  },
);

check("parseLRC: output is sorted by time regardless of input order", () => {
  const lyrics = parseLRC("[00:30.00]c\n[00:10.00]a\n[00:20.00]b");
  assert.deepEqual(
    lyrics.map((line) => line.text),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    lyrics.map((line) => line.time),
    [10, 20, 30],
  );
});

check("parseLRC: metadata, blank and timestamp-only lines are dropped", () => {
  const source =
    "[ti:Title]\n[ar:Artist]\n[00:01.00]kept\n\n[00:02.00]   \nno timestamp";
  assert.deepEqual(parseLRC(source), [
    { time: 1, text: "kept" },
    { time: -1, text: "no timestamp" },
  ]);
});

check("parseLRC: empty-ish input returns an empty list", () => {
  assert.deepEqual(parseLRC(""), []);
  assert.deepEqual(parseLRC(undefined), []);
  assert.deepEqual(parseLRC(null), []);
});

check("parseLRC: accepts [mm:ss] without a fraction", () => {
  assert.deepEqual(parseLRC("[00:05]no fraction"), [
    { time: 5, text: "no fraction" },
  ]);
  assert.deepEqual(parseLRC("[01:30]minute and a half"), [
    { time: 90, text: "minute and a half" },
  ]);
});

check("parseLRC: untimed lines sort after timed ones", () => {
  // time -1 must not jump to the front of the list.
  const lyrics = parseLRC("plain line\n[00:10.00]timed line");
  assert.deepEqual(
    lyrics.map((line) => line.text),
    ["timed line", "plain line"],
  );
  assert.equal(lyrics[0].time, 10);
  assert.equal(lyrics[1].time, -1);
});

// --- normalizeLyrics ---

check("normalizeLyrics: joins an array one line per entry", () => {
  assert.equal(
    normalizeLyrics(["[00:01.00]a", "[00:02.00]b"]),
    "[00:01.00]a\n[00:02.00]b",
  );
});

check("normalizeLyrics: passes strings through and defaults to empty", () => {
  assert.equal(normalizeLyrics("inline"), "inline");
  assert.equal(normalizeLyrics(undefined), "");
  assert.equal(normalizeLyrics(null), "");
  assert.equal(normalizeLyrics([]), "");
});

// --- parseCustomTracks ---

check("parseCustomTracks: maps the documented shape", () => {
  const tracks = parseCustomTracks(
    JSON.stringify([
      {
        name: "Song",
        artist: "Singer",
        url: "/upload/song.mp3",
        pic: "/upload/cover.jpg",
        lrc: ["[00:01.00]a"],
      },
    ]),
  );
  assert.deepEqual(tracks, [
    {
      name: "Song",
      artist: "Singer",
      url: "/upload/song.mp3",
      pic: "/upload/cover.jpg",
      lrc: "[00:01.00]a",
    },
  ]);
});

check("parseCustomTracks: a single entry is the common case", () => {
  // The settings help text advertises "one or two tracks in a JSON array".
  const tracks = parseCustomTracks(
    '[{"name":"一刻千金","artist":"MiraCeo","url":"/upload/music/song.mp3"}]',
  );
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].name, "一刻千金");
  assert.equal(tracks[0].pic, "");
  assert.equal(tracks[0].lrc, "");
});

check("parseCustomTracks: drops entries without a url", () => {
  const tracks = parseCustomTracks(
    '[{"name":"a","url":""},{"name":"b","url":"/upload/b.mp3"},{"name":"c"}]',
  );
  assert.deepEqual(
    tracks.map((track) => track.name),
    ["b"],
  );
});

check("parseCustomTracks: empty input is an empty list, not an error", () => {
  assert.deepEqual(parseCustomTracks(""), []);
  assert.deepEqual(parseCustomTracks("   "), []);
  assert.deepEqual(parseCustomTracks(undefined), []);
  assert.deepEqual(parseCustomTracks(null), []);
});

check(
  "parseCustomTracks: malformed JSON throws so the player can report it",
  () => {
    assert.throws(() => parseCustomTracks("{not json}"), SyntaxError);
  },
);

check("parseCustomTracks: a non-array payload throws", () => {
  assert.throws(() => parseCustomTracks('{"name":"a"}'), TypeError);
});

check("parseCustomTracks: non-object entries are ignored", () => {
  const tracks = parseCustomTracks('["junk", 42, null, {"url":"/u.mp3"}]');
  assert.deepEqual(
    tracks.map((track) => track.url),
    ["/u.mp3"],
  );
});

check("parseCustomTracks: tolerates the Meting field names too", () => {
  const tracks = parseCustomTracks(
    '[{"title":"t","author":"a","url":"/u.mp3","cover":"/c.jpg"}]',
  );
  assert.equal(tracks[0].name, "t");
  assert.equal(tracks[0].artist, "a");
  assert.equal(tracks[0].pic, "/c.jpg");
});

// --- isLyricsUrl ---

check("isLyricsUrl: absolute and protocol-relative URLs", () => {
  assert.equal(isLyricsUrl("https://example.com/a.lrc"), true);
  assert.equal(isLyricsUrl("http://example.com/a.lrc"), true);
  assert.equal(isLyricsUrl("//example.com/a.lrc"), true);
});

check("isLyricsUrl: site-relative paths", () => {
  assert.equal(isLyricsUrl("/upload/lyrics/a.lrc"), true);
  assert.equal(isLyricsUrl("/anything"), true);
});

check("isLyricsUrl: .lrc/.txt suffixes with query or hash", () => {
  assert.equal(isLyricsUrl("a.lrc"), true);
  assert.equal(isLyricsUrl("a.txt"), true);
  assert.equal(isLyricsUrl("a.lrc?token=1"), true);
  assert.equal(isLyricsUrl("a.txt#part"), true);
  assert.equal(isLyricsUrl("A.LRC"), true, "suffix match is case-insensitive");
});

check("isLyricsUrl: inline LRC text is not a URL", () => {
  assert.equal(isLyricsUrl("[00:01.00]inline lyrics"), false);
  assert.equal(isLyricsUrl("[ti:title]\n[00:01.00]x"), false);
});

// --- buildMetingUrl ---

check("buildMetingUrl: substitutes every placeholder", () => {
  const url = buildMetingUrl({
    api: "https://api.example.com/?server=:server&type=:type&id=:id&r=:r",
    server: "netease",
    type: "playlist",
    id: "12345",
  });
  assert.match(url, /server=netease/);
  assert.match(url, /type=playlist/);
  assert.match(url, /id=12345/);
  assert.match(url, /r=[\d.]+/);
  // A leftover placeholder looks like `:name`; the scheme colon is fine.
  assert.ok(
    !/:[a-z]/i.test(url.replace("https:", "").replace("http:", "")),
    `placeholder survived in ${url}`,
  );
});

check("buildMetingUrl: encodes values that would break the query", () => {
  const url = buildMetingUrl({
    api: "https://api.example.com/?type=:type&id=:id",
    server: "netease",
    type: "search",
    id: "a&b=c d",
  });
  assert.ok(url.includes("a%26b%3Dc%20d"), `unencoded value in ${url}`);
});

// --- mapMetingTrack ---

check("mapMetingTrack: accepts the title/author schema", () => {
  assert.deepEqual(
    mapMetingTrack({
      title: "Song",
      author: "Singer",
      url: "u",
      pic: "p",
      lrc: "l",
    }),
    { name: "Song", artist: "Singer", url: "u", pic: "p", lrc: "l" },
  );
});

check("mapMetingTrack: accepts the name/artist schema", () => {
  assert.deepEqual(
    mapMetingTrack({ name: "Song", artist: "Singer", url: "u", cover: "c" }),
    { name: "Song", artist: "Singer", url: "u", pic: "c", lrc: "" },
  );
});

check("mapMetingTrack: falls back without throwing on sparse entries", () => {
  assert.deepEqual(mapMetingTrack({}), {
    name: "Unknown",
    artist: "Unknown",
    url: "",
    pic: "",
    lrc: "",
  });
});

check(
  "mapMetingTrack: tracks without a url are filtered out downstream",
  () => {
    // The player does `list.map(mapMetingTrack).filter((t) => t.url)`, so an entry
    // with no url must map to an empty string rather than "undefined".
    assert.equal(mapMetingTrack({ title: "x" }).url, "");
  },
);

// --- the generated inline script ---

check("buildMusicPlayerScript: emits a parseable, self-contained IIFE", () => {
  const script = buildMusicPlayerScript("music-widget-abc123");
  assert.ok(script.includes('"music-widget-abc123"'), "id is passed literally");
  assert.ok(
    script.startsWith("(function (widgetId) {"),
    "uses a classic function so the snippet needs no transform",
  );
  assert.ok(script.trimEnd().endsWith(");"), "IIFE is invoked and closed");
  assert.equal(
    script.split("</scr" + "ipt").length - 1,
    0,
    "must not contain a script close tag, which would truncate the block",
  );
  assert.doesNotThrow(
    () => new Function(script),
    "generated script must be valid JavaScript",
  );
});

check("buildMusicPlayerScript: escapes the widget id", () => {
  // Ids are generated, but escaping keeps a hostile value from breaking out.
  const script = buildMusicPlayerScript('a";alert(1);"');
  assert.ok(script.includes('"a\\";alert(1);\\""'));
  assert.doesNotThrow(() => new Function(script));
});

check("snippet: never contains a close-script sequence", () => {
  // Regression guard: a close-script sequence inside the snippet ends the HTML
  // element early AND silently truncates the template literal it lives in. Both
  // mistakes were made while writing this widget.
  const closeTag = "</scr" + "ipt";
  assert.equal(
    MUSIC_PLAYER_SOURCE.split(closeTag).length - 1,
    0,
    `snippet must never contain ${closeTag}`,
  );
  assert.equal(
    buildMusicPlayerScript("music-widget-x").split(closeTag).length - 1,
    0,
    "nor may the generated script introduce one",
  );
  // The build helper watches for it too, since a future edit could reintroduce
  // it without any other test noticing.
  const root = path.resolve(import.meta.dirname, "..");
  const source = readFileSync(
    path.join(root, "src/utils/music-player.ts"),
    "utf8",
  );
  assert.ok(
    source.includes('const closeTag = "</scr" + "ipt"'),
    "buildMusicPlayerScript must keep its close-tag guard",
  );
});

check(
  "buildMusicPlayerScript: binds via a classic function, not an arrow",
  () => {
    // An arrow IIFE would still work, but the classic form keeps the snippet
    // readable in built output and avoids `this` surprises.
    const script = buildMusicPlayerScript("music-widget-x");
    assert.ok(script.startsWith("(function (widgetId) {"));
  },
);

// --- top-bar toggle contract ---

check("music-toggle: reads the knob the player publishes", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const toggle = readFileSync(
    path.join(root, "src/utils/music-toggle.ts"),
    "utf8",
  );
  assert.ok(
    toggle.includes("window.__fuwariMusic?.toggle()"),
    "click must drive the shared knob",
  );
  assert.ok(
    toggle.includes("knob.subscribe("),
    "icon must follow real playback state, not the click",
  );
  assert.ok(
    toggle.includes("reveal(elements)"),
    "the button must be revealed only once a player exists",
  );
  assert.ok(
    toggle.includes("settingDisabled()"),
    "the show_music_toggle setting must be honoured on the client",
  );
});

check("music-toggle: the knob name matches between toggle and player", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const toggle = readFileSync(
    path.join(root, "src/utils/music-toggle.ts"),
    "utf8",
  );
  assert.ok(
    toggle.includes("__fuwariMusic") &&
      MUSIC_PLAYER_SOURCE.includes("__fuwariMusic"),
    "both sides must agree on window.__fuwariMusic",
  );
});

check("music-toggle: selector and markup hooks agree", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const navbar = readFileSync(
    path.join(root, "src/components/Navbar.astro"),
    "utf8",
  );
  const toggle = readFileSync(
    path.join(root, "src/utils/music-toggle.ts"),
    "utf8",
  );
  // A class selector, not an id: the button is rendered once per sidebar widget
  // because `th:each` and `th:if` must not share an element.
  assert.ok(
    toggle.includes('querySelector<HTMLElement>(".music-toggle-button")'),
    "toggle must look the button up by class",
  );
  assert.ok(
    navbar.includes('class="music-toggle-button'),
    "Navbar must render that class",
  );
  assert.ok(
    navbar.includes("music-toggle-icon") &&
      navbar.includes("music-toggle-playing"),
    "both icon hooks must exist in the markup",
  );
  assert.ok(
    navbar.includes("hidden h-11 w-11"),
    "the button must ship hidden so it cannot appear without a player",
  );
});

check(
  "navbar: the music button avoids the constructs that broke the site",
  () => {
    const root = path.resolve(import.meta.dirname, "..");
    const navbar = readFileSync(
      path.join(root, "src/components/Navbar.astro"),
      "utf8",
    );
    // The explanatory comment in this file names the forbidden constructs, so
    // strip comments before scanning or the explanation trips its own check.
    const markup = navbar
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    // All of these were in the version that produced a blank page in production.
    // Halo renders templates server-side, so an expression it cannot evaluate
    // takes the whole page down rather than degrading.
    assert.ok(
      !markup.includes("#lists.toList"),
      "#lists.toList is not available in this dialect",
    );
    assert.ok(
      !markup.includes("?["),
      "SpEL selection expressions are not proven to work here",
    );
    assert.ok(
      !markup.includes('th:remove="'),
      "th:remove has never been used in this theme",
    );
    // The two rules the outage taught us.
    for (const match of markup.matchAll(/<[a-zA-Z][^>]*>/g)) {
      const tag = match[0];
      if (!/\bth:each=/.test(tag)) continue;
      assert.ok(
        !/\bth:(?:if|unless|remove)=/.test(tag),
        `th:each must not share an element with th:if/unless/remove: ${tag.replace(/\s+/g, " ")}`,
      );
      assert.ok(
        !/\sid="/.test(tag),
        `th:each must not share an element with a literal id: ${tag.replace(/\s+/g, " ")}`,
      );
    }
  },
);

check("MUSIC_PLAYER_SOURCE: guards against double binding", () => {
  assert.ok(
    MUSIC_PLAYER_SOURCE.includes("fireflyBound"),
    "the bound-once guard is what makes re-execution safe",
  );
});

check("MUSIC_PLAYER_SOURCE: has no unescaped template placeholders", () => {
  const dollarBrace = "$" + "{";
  assert.equal(
    MUSIC_PLAYER_SOURCE.split(dollarBrace).length - 1,
    0,
    "a placeholder would be interpolated by the build, not by the browser",
  );
});

// --- contract with the template markup ---

check("template markup: every class hook the script queries exists", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const markup = [
    readFileSync(
      path.join(root, "src/components/widget/MusicPlayer.astro"),
      "utf8",
    ),
    readFileSync(
      path.join(root, "src/components/widget/PlaylistItem.astro"),
      "utf8",
    ),
  ].join("\n");

  // Collect every class token the markup defines, so single-class elements such
  // as class="current-time" count the same as long utility lists.
  const defined = new Set<string>();
  for (const match of markup.matchAll(/class="([^"]*)"/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (token) defined.add(token);
    }
  }

  const queried = [
    ...MUSIC_PLAYER_SOURCE.matchAll(/querySelector\("\.([a-z-]+)"\)/g),
  ].map((match) => match[1]);
  assert.ok(
    queried.length > 20,
    `expected many hooks, found ${queried.length}`,
  );

  const missing = [...new Set(queried)].filter((hook) => !defined.has(hook));
  assert.deepEqual(
    missing,
    [],
    `hooks missing from markup: ${missing.join(", ")}`,
  );
});

check(
  "template markup: the id-scoped template lookup matches the component",
  () => {
    const root = path.resolve(import.meta.dirname, "..");
    const markup = readFileSync(
      path.join(root, "src/components/widget/MusicPlayer.astro"),
      "utf8",
    );
    assert.ok(
      MUSIC_PLAYER_SOURCE.includes('"playlist-item-template-" + widgetId'),
      "script builds the template id from widgetId",
    );
    assert.ok(
      markup.includes("`playlist-item-template-${widgetId}`"),
      "component must define that exact id",
    );
  },
);

check(
  "template markup: custom tracks travel as JSON, not as an attribute",
  () => {
    const root = path.resolve(import.meta.dirname, "..");
    const markup = readFileSync(
      path.join(root, "src/components/widget/MusicPlayer.astro"),
      "utf8",
    );
    // JSON is full of quotes; putting it in a data attribute means HTML-escaping
    // it, which is exactly the fragile path this avoids.
    assert.ok(
      markup.includes('type="application/json"'),
      "tracks block must be a JSON script element",
    );
    assert.ok(
      markup.includes("th:utext"),
      "Thymeleaf must inject the raw JSON into that element",
    );
    assert.ok(
      !markup.includes("data-custom-tracks"),
      "must not smuggle the JSON through a data attribute",
    );
    assert.ok(
      MUSIC_PLAYER_SOURCE.includes('"music-tracks-" + widgetId'),
      "player must read the JSON element by the same id pattern",
    );
  },
);

check("template markup: the widget hides itself when unconfigured", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const markup = readFileSync(
    path.join(root, "src/components/widget/MusicPlayer.astro"),
    "utf8",
  );
  assert.ok(
    markup.includes("not #strings.isEmpty(widget.custom_tracks)"),
    "an unconfigured widget must not render at all",
  );
  assert.ok(
    !markup.includes("api.i-meto.com"),
    "the dead default mirror must stay removed",
  );
});

check("template markup: lyrics are opt-in and follow the setting", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const markup = readFileSync(
    path.join(root, "src/components/widget/MusicPlayer.astro"),
    "utf8",
  );
  assert.ok(
    markup.includes("widget.show_lyrics != null and widget.show_lyrics"),
    "lyrics must be opt-in: a missing key means off",
  );
  // The runtime rule must match, or the button would appear for people who left
  // the setting off.
  const source = readFileSync(
    path.join(root, "src/utils/music-player.ts"),
    "utf8",
  );
  assert.ok(
    source.includes('widget.dataset.showLyrics === "true"'),
    "player must treat only an explicit true as enabled",
  );
  assert.ok(
    source.includes("hasTimedLyrics"),
    "a track with no timed lyrics must hide the button too",
  );
});

check("template markup: labels come from Thymeleaf, never hardcoded", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const markup = readFileSync(
    path.join(root, "src/components/widget/MusicPlayer.astro"),
    "utf8",
  );

  // aria-label must be either a Thymeleaf-bound attribute or absent.
  const literalAriaLabels = [
    ...markup.matchAll(/(?<![:\w-])aria-label="([^"\n]*)"/g),
  ]
    .map((match) => match[1])
    .filter(Boolean);
  assert.deepEqual(
    literalAriaLabels,
    [],
    `hardcoded aria-label values: ${literalAriaLabels.join(" | ")}`,
  );

  const literalTitles = [...markup.matchAll(/(?<![:\w-])title="([^"\n]*)"/g)]
    .map((match) => match[1])
    .filter(Boolean);
  assert.deepEqual(
    literalTitles,
    [],
    `hardcoded title values: ${literalTitles.join(" | ")}`,
  );

  // Every user-facing label the script can set must be bound server-side too,
  // otherwise the widget shows the wrong language until the script runs.
  const boundKeys = new Set(
    [...markup.matchAll(/#\{([\w.]+)\}/g)].map((match) => match[1]),
  );
  for (const key of [
    "widget.music.lyrics",
    "widget.music.volume",
    "widget.music.progress",
    "widget.music.playMode",
    "widget.music.prev",
    "widget.music.next",
    "widget.music.play",
    "widget.music.playlist",
    "widget.music.noPlaying",
    "widget.music.noLyrics",
  ]) {
    assert.ok(boundKeys.has(key), `${key} is not bound in the markup`);
  }
});

// --- report ---

console.log(`passed: ${passed}`);
if (failures.length) {
  console.error(`failed: ${failures.length}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("all music-player checks passed");
