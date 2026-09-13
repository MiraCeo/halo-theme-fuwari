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
  titleFromUrl,
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

check("parseCustomTracks: unusable input yields nothing, never throws", () => {
  // The parser deliberately degrades instead of throwing: a thrown error only
  // surfaces as the generic "failed to load" message, which tells the site owner
  // nothing about which field is wrong.
  assert.deepEqual(parseCustomTracks("{not json}"), []);
  assert.deepEqual(parseCustomTracks("just some text"), []);
  assert.deepEqual(parseCustomTracks(42), []);
  assert.deepEqual(parseCustomTracks(true), []);
  assert.deepEqual(parseCustomTracks("[]"), []);
  assert.deepEqual(parseCustomTracks("{}"), []);
});

check("parseCustomTracks: a bare object counts as one track", () => {
  const tracks = parseCustomTracks('{"name":"a","url":"/u.mp3"}');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].url, "/u.mp3");
});

// The settings expose tracks as an `array` field, so the template receives
// whatever the server stringifies it to. All of these shapes are real
// possibilities and must parse.
check("parseCustomTracks: accepts the settings group shape", () => {
  const tracks = parseCustomTracks({
    enable: true,
    items: [{ audio: "/upload/a.mp3", name: "A", cover: "/upload/a.jpg" }],
  });
  assert.deepEqual(tracks, [
    {
      name: "A",
      artist: "",
      url: "/upload/a.mp3",
      pic: "/upload/a.jpg",
      lrc: "",
    },
  ]);
});

// The settings use one group per track slot rather than an `array` field,
// because Halo always edits array items in a dialog. Nested groups come through
// as flat underscore-joined keys.
check("parseCustomTracks: reads the flat slot keys", () => {
  const tracks = parseCustomTracks({
    enable: true,
    slot1_audio: "/upload/a.mp3",
    slot1_name: "第一首",
    slot1_cover: "/upload/a.jpg",
    slot2_audio: "/upload/b.mp3",
    slot2_lyrics: "[00:01.00]hi",
  });
  assert.deepEqual(tracks, [
    {
      name: "第一首",
      artist: "",
      url: "/upload/a.mp3",
      pic: "/upload/a.jpg",
      lrc: "",
    },
    {
      name: "b",
      artist: "",
      url: "/upload/b.mp3",
      pic: "",
      lrc: "[00:01.00]hi",
    },
  ]);
});

check("parseCustomTracks: empty slots are skipped, order is by slot", () => {
  const tracks = parseCustomTracks({
    slot1_audio: "",
    slot2_audio: "/upload/two.mp3",
    slot10_audio: "/upload/ten.mp3",
    slot3_audio: "/upload/three.mp3",
  });
  // Slot 10 must not sort as though it were slot 1.
  assert.deepEqual(
    tracks.map((track) => track.url),
    ["/upload/two.mp3", "/upload/three.mp3", "/upload/ten.mp3"],
  );
});

check("parseCustomTracks: flat slots survive the string form too", () => {
  // SpEL stringifies nested groups as flat keys, so this is the realistic path.
  const tracks = parseCustomTracks(
    "{enable=true, slot1_audio=/upload/a.mp3?token=x, slot1_name=一刻千金, slot2_audio=/upload/b.mp3}",
  );
  assert.deepEqual(
    tracks.map((track) => track.name),
    ["一刻千金", "b"],
  );
  assert.equal(tracks[0].url, "/upload/a.mp3?token=x");
});

check("parseCustomTracks: an enable-only group yields nothing", () => {
  assert.deepEqual(parseCustomTracks({ enable: true }), []);
});

// --- settings schema contract ---

check("settings: track fields collapse until an audio file is chosen", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const settings = readFileSync(path.join(root, "settings.yaml"), "utf8");
  const lines = settings.split("\n");

  // Find every slot group and check the fields that follow `audio`.
  const slotStarts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s+name: slot\d+\s*$/.test(line))
    .map(({ index }) => index);
  assert.equal(slotStarts.length, 4, "expected four track slots");

  for (const start of slotStarts) {
    // Each slot block runs until the next slot (or the end of the array).
    const next = slotStarts.find((index) => index > start) ?? lines.length;
    const block = lines.slice(start, next).join("\n");

    const gated = block.match(/if: \$value\.audio/g) ?? [];
    assert.equal(
      gated.length,
      3,
      `slot at line ${start + 1} must gate title, cover and lyrics (found ${gated.length})`,
    );
    // The audio picker itself must stay visible, or the slot could never be filled.
    const audioIndex = block.indexOf("name: audio");
    const firstIf = block.indexOf("if: $value.audio");
    assert.ok(
      audioIndex !== -1 && (firstIf === -1 || audioIndex < firstIf),
      "the audio picker must come before the gated fields",
    );
  }
});

check("parseCustomTracks: accepts a real array of objects", () => {
  const tracks = parseCustomTracks([
    { audio: "/upload/a.mp3", name: "A" },
    { audio: "/upload/b.mp3" },
  ]);
  assert.deepEqual(
    tracks.map((track) => track.name),
    ["A", "b"],
  );
});

check("parseCustomTracks: accepts a Java toString() dump", () => {
  // SpEL stringifies a list of maps roughly like this, with unquoted keys and
  // values, which is why the relaxed parser exists at all.
  const tracks = parseCustomTracks(
    "[{audio=/upload/a.mp3, name=一刻千金, cover=/upload/a.jpg}, {audio=/upload/b.mp3, name=B}]",
  );
  assert.deepEqual(
    tracks.map((track) => track.name),
    ["一刻千金", "B"],
  );
  assert.deepEqual(
    tracks.map((track) => track.url),
    ["/upload/a.mp3", "/upload/b.mp3"],
  );
});

check("parseCustomTracks: a URL with a query string survives", () => {
  const tracks = parseCustomTracks(
    "[{audio=/upload/a.mp3?token=abc&v=2, name=With Query, cover=/upload/c.jpg}]",
  );
  assert.equal(tracks[0].url, "/upload/a.mp3?token=abc&v=2");
  assert.equal(tracks[0].name, "With Query");
  assert.equal(tracks[0].pic, "/upload/c.jpg");
});

check("parseCustomTracks: an unescaped comma in a URL is a known limit", () => {
  // The relaxed format has no quoting to tell `a,b` from two fields, and Halo
  // attachment URLs never contain a raw comma. Pinned so the behaviour is
  // visible rather than surprising; the JSON path handles it correctly.
  const raw = parseCustomTracks(
    "[{audio=/upload/a.mp3?x=1,y=2, name=N, cover=/c.jpg}]",
  );
  assert.equal(raw.length, 1);

  const json = parseCustomTracks(
    JSON.stringify([
      { audio: "/upload/a.mp3?x=1,y=2", name: "N", cover: "/c.jpg" },
    ]),
  );
  assert.equal(json[0].url, "/upload/a.mp3?x=1,y=2");
  assert.equal(json[0].name, "N");
});

check(
  "parseCustomTracks: lyrics with commas, brackets and equals survive",
  () => {
    const lyrics = "[00:12.50]第一行，带逗号\n[00:16.00]a=b [not a tag]";
    const tracks = parseCustomTracks({
      items: [{ audio: "/u.mp3", name: "N", lyrics }],
    });
    assert.equal(tracks[0].lrc, lyrics);
  },
);

check("parseCustomTracks: JSON inside a string still works", () => {
  const tracks = parseCustomTracks(
    JSON.stringify([{ audio: "/u.mp3", name: "S", lyrics: "a\nb" }]),
  );
  assert.equal(tracks[0].name, "S");
  assert.equal(tracks[0].lrc, "a\nb");
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

// --- title derivation ---

check("titleFromUrl: strips the directory, query and extension", () => {
  assert.equal(titleFromUrl("/upload/song.mp3"), "song");
  assert.equal(titleFromUrl("/upload/music/一刻千金.mp3"), "一刻千金");
  assert.equal(titleFromUrl("/upload/a.b.c.mp3"), "a.b.c");
  assert.equal(titleFromUrl("/upload/song.mp3?token=1"), "song");
  assert.equal(titleFromUrl("/upload/song.mp3#part"), "song");
  assert.equal(titleFromUrl("/upload/%E4%B8%80%E5%88%BB.mp3"), "一刻");
  assert.equal(titleFromUrl("https://cdn.example.com/a/b/track.flac"), "track");
});

check("titleFromUrl: empty and odd input does not throw", () => {
  assert.equal(titleFromUrl(""), "");
  assert.equal(titleFromUrl("/"), "");
  assert.equal(titleFromUrl("/upload/%ZZ.mp3"), "%ZZ", "bad escapes survive");
});

check("parseCustomTracks: an empty title falls back to the filename", () => {
  const tracks = parseCustomTracks({
    items: [
      { audio: "/upload/一刻千金.mp3" },
      { audio: "/upload/x.mp3", name: "给定了" },
    ],
  });
  assert.equal(tracks[0].name, "一刻千金");
  assert.equal(tracks[1].name, "给定了");
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
  // No invented "Unknown" placeholder any more: a missing title leaves the name
  // empty, and the player shows its own localised fallback for that.
  assert.deepEqual(mapMetingTrack({}), {
    name: "",
    artist: "",
    url: "",
    pic: "",
    lrc: "",
  });
});

check("mapMetingTrack: a missing title falls back to the filename", () => {
  const track = mapMetingTrack({ url: "https://cdn.example.com/一刻千金.mp3" });
  assert.equal(track.name, "一刻千金");
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
    // A multi-line `th:if` inside Astro's <Fragment> fails to compile ("unterminated
    // string constant"), so the EL lives in the frontmatter instead.
    assert.ok(
      !/<Fragment[\s\S]*?th:/.test(navbar),
      "do not put Thymeleaf attributes on Astro's <Fragment>",
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

// --- the music feature moved out of the sidebar widget list ---

check("music is a site-wide feature, not a sidebar widget", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const sidebar = readFileSync(
    path.join(root, "src/components/widget/SideBar.astro"),
    "utf8",
  );
  const settings = readFileSync(path.join(root, "settings.yaml"), "utf8");

  assert.ok(
    !sidebar.includes("th:case=\"'music'\""),
    "the music branch must be gone from the widget switch",
  );
  assert.ok(
    sidebar.includes("theme.config.music.enable"),
    "the sidebar must render the player from the feature config",
  );
  // Hiding the panel must not remove the player: it owns the <audio> element
  // that the top-bar button drives.
  assert.ok(
    sidebar.includes("display: none"),
    "show_sidebar must hide the wrapper, keeping the player alive",
  );
  assert.ok(
    !/value: music\b/.test(settings),
    "the widget picker must no longer offer a music option",
  );
  assert.ok(
    /^\s{4}- group: music$/m.test(settings),
    "settings must define a top-level 音乐 group",
  );
});

check("player markup reads the feature config, not a widget variable", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const player = readFileSync(
    path.join(root, "src/components/widget/MusicPlayer.astro"),
    "utf8",
  );
  // The music settings used to hang off each sidebar widget. Catch any of those
  // property paths creeping back in; i18n keys read `widget.music.*` and none of
  // these patterns match them.
  for (const oldPath of [
    "widget.custom_tracks",
    "widget.show_lyrics",
    "widget.autoplay",
    "widget.play_mode",
    "widget.volume",
    "widget.api",
    "widget.server",
    "widget.title",
  ]) {
    assert.ok(
      !player.includes(oldPath),
      `${oldPath} belongs to the 音乐 group now, not to a sidebar widget`,
    );
  }
  assert.ok(
    player.includes("theme.config.music.enable"),
    "the player must be gated by the feature switch",
  );
  // One player per site, so the id can be fixed - which is also what lets the
  // top-bar button and the sidebar panel share a single instance.
  assert.ok(
    player.includes('const widgetId = "music-widget"'),
    "the player id must be deterministic",
  );
  assert.ok(
    player.includes("id={widgetId}"),
    "the player element must carry that id",
  );
});

check("config types no longer expose music on a sidebar widget", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const types = readFileSync(path.join(root, "src/types/config.ts"), "utf8");
  const widgetBlock = /export interface Widget \{[\s\S]*?\n\}/.exec(types);
  assert.ok(widgetBlock, "Widget interface must still exist");
  for (const gone of ["show_lyrics", "autoplay", "custom_tracks", "server"]) {
    assert.ok(
      !widgetBlock[0].includes(gone),
      `${gone} must not remain on Widget`,
    );
  }
  assert.ok(
    /export interface Music \{[\s\S]*?\n\}/.test(types),
    "a Music interface must exist for the feature settings",
  );
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

check(
  "template markup: custom tracks travel in a text element, not an attribute",
  () => {
    const root = path.resolve(import.meta.dirname, "..");
    const markup = readFileSync(
      path.join(root, "src/components/widget/MusicPlayer.astro"),
      "utf8",
    );
    // The payload is full of quotes and brackets; putting it in a data attribute
    // means HTML-escaping it, which is exactly the fragile path this avoids.
    // `text/plain` rather than `application/json` because the server may hand
    // over a Java toString() dump, which is not valid JSON.
    assert.ok(
      markup.includes('type="text/plain"'),
      "tracks block must be a plain text element",
    );
    assert.ok(
      markup.includes("th:utext"),
      "Thymeleaf must inject the raw value into that element",
    );
    assert.ok(
      !markup.includes("data-custom-tracks"),
      "must not smuggle the payload through a data attribute",
    );
    assert.ok(
      MUSIC_PLAYER_SOURCE.includes('"music-tracks-" + widgetId'),
      "player must read the element by the same id pattern",
    );
  },
);

check("template markup: the player is gated by the feature switches", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const markup = readFileSync(
    path.join(root, "src/components/widget/MusicPlayer.astro"),
    "utf8",
  );
  assert.ok(
    markup.includes("theme.config.music.enable"),
    "the player must not render when music is switched off",
  );
  // Tracks and the Meting URL are each behind their own switch now.
  assert.ok(
    markup.includes("theme.config.music.custom_tracks.enable"),
    "custom tracks must be gated by their own switch",
  );
  assert.ok(
    markup.includes("theme.config.music.meting.enable"),
    "the Meting URL must not be sent when Meting is switched off",
  );
  assert.ok(
    markup.includes('th:utext="${theme.config.music.custom_tracks}"'),
    "the track group is injected verbatim for the tolerant parser",
  );
  // Not application/json: the server may emit a Java toString() dump, which is
  // not valid JSON, and nothing parses it as JSON.
  assert.ok(
    markup.includes('type="text/plain"'),
    "the track element must not claim to be JSON",
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
    markup.includes(
      "theme.config.music.show_lyrics != null and theme.config.music.show_lyrics",
    ),
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
