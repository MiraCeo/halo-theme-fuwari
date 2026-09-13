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

check("parseLRC: drops metadata, blank and untimed lines", () => {
  const source =
    "[ti:Title]\n[ar:Artist]\n[00:01.00]kept\n\n[00:02.00]   \nno timestamp";
  assert.deepEqual(parseLRC(source), [{ time: 1, text: "kept" }]);
});

check("parseLRC: empty-ish input returns an empty list", () => {
  assert.deepEqual(parseLRC(""), []);
  assert.deepEqual(parseLRC(undefined), []);
  assert.deepEqual(parseLRC(null), []);
  assert.deepEqual(parseLRC("not lyrics at all"), []);
});

check(
  "parseLRC: [mm:ss]-only timestamps are ignored (known limitation)",
  () => {
    // The regex requires a fractional part. Nothing in the Meting output relies on
    // the short form, but pinning it keeps the behaviour visible.
    assert.deepEqual(parseLRC("[00:05]no fraction"), []);
  },
);

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
