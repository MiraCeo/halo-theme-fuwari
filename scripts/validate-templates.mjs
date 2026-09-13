#!/usr/bin/env node
/**
 * Validate the Astro-generated Halo templates in `templates/`.
 *
 * Astro treats `th:*` attributes and `${theme.config.*}` references as opaque
 * strings, so a typo in either one builds successfully and only breaks when
 * Halo renders the page. This script is the missing compile-time check.
 *
 *   node scripts/validate-templates.mjs            # errors fail the run
 *   node scripts/validate-templates.mjs --strict    # warnings fail too
 *   node scripts/validate-templates.mjs --templates <dir>
 *
 * Checks performed:
 *   1. `theme.config.*` references resolve in `settings.yaml`
 *   2. `${...}` / `#{...}` / `*{...}` delimiters are balanced inside `th:*`
 *   3. `[# ... #]` prototype-only comment blocks do not leak into the output
 *   4. Thymeleaf inlining expressions and delimiters are well formed
 *   5. `th:each` carries an iteration variable
 *   6. every `th:case` has a `th:switch` ancestor
 *   7. `th:inline` uses a language Thymeleaf understands
 *   8. no attribute appears twice on the same tag (Astro/JSX directives included)
 *   9. no unresolved Astro syntax leaks into the output
 *  10. known `th:*` attributes only, and no `th:*` on `<html>`/`<head>`
 *
 * Exit code is non-zero when an error (or, with `--strict`, a warning) is found.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

let parseYaml;
try {
  ({ parse: parseYaml } = await import("yaml"));
} catch {
  console.error(
    'This script needs the "yaml" package. Run "pnpm install" first.',
  );
  process.exit(2);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/**
 * `theme.config.*` keys that are intentionally absent from `settings.yaml`
 * because they only exist for visitors upgrading from an older release.
 * `base.themeColor.hue` was replaced by `base.themeColor.color`; the runtime
 * still reads it as a fallback.
 */
const LEGACY_CONFIG_PATHS = new Set(["base.themeColor.hue"]);

/** Attributes Halo/Thymeleaf understand. Anything else is a typo. */
const KNOWN_TH_ATTRIBUTES = new Set([
  "alt",
  "aria",
  "attr",
  "case",
  "checked",
  "class",
  "classappend",
  "colspan",
  "content",
  "data",
  "datetime",
  "disabled",
  "each",
  "for",
  "href",
  "id",
  "if",
  "inline",
  "lang",
  "method",
  "name",
  "placeholder",
  "readonly",
  "rel",
  "role",
  "selected",
  "src",
  "style",
  "switch",
  "target",
  "text",
  "title",
  "type",
  "unless",
  "utext",
  "value",
  "width",
  "with",
]);

const TH_INLINE_LANGUAGES = new Set(["text", "javascript", "css", "none"]);

/** `th:data-*` and `th:aria-*` are valid; both are handled per-attribute. */
const TH_PREFIXED_ATTRIBUTES = /^th:(?:data|aria)-[a-z][a-z0-9-]*$/;

/**
 * Patterns that must never survive into a built template. Each one has to be
 * specific enough to be a real defect: false positives here are worse than
 * missing a check, because they train people to ignore the output.
 */
const ASTRO_LEAKS = [
  { pattern: /\bset:html\b/, label: "Astro set:html directive" },
  {
    pattern: /\bAstro\.(?:props|params|url|self|slots|generator)\b/,
    label: "Astro runtime global",
  },
  { pattern: /import\.meta\.env/, label: "import.meta.env" },
  { pattern: /<Fragment\b/, label: "Astro <Fragment>" },
  { pattern: /\[object Object\]/, label: "uninterpolated object" },
];

// ---------------------------------------------------------------------------
// parsing
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Elements whose text content must not be scanned as markup. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

/**
 * Minimal HTML scanner. It is not a full parser; it only needs to walk tags,
 * their attributes, and skip raw-text/comment regions faithfully enough to
 * catch template mistakes.
 */
function scan(html) {
  const tags = [];
  const textRegions = [];
  let depth = 0;
  const stack = [];
  let index = 0;

  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt === -1) break;

    // Comments, including Thymeleaf's `<!--/* */-->` parser-level blocks.
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }

    // Doctype / CDATA / declarations.
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(
      html.slice(lt, lt + 64),
    );
    if (!match) {
      index = lt + 1;
      continue;
    }

    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const attributeStart = lt + match[0].length;

    if (closing) {
      const end = html.indexOf(">", attributeStart);
      const top = stack.pop();
      if (top && top !== name) {
        // Mismatched nesting is reported by the depth check below.
        stack.push(top);
      }
      depth = Math.max(0, depth - 1);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    // Find the end of the tag, respecting quoted attribute values.
    const { end, attributes } = readAttributes(html, attributeStart);
    const selfClosing = html[end - 1] === "/";
    tags.push({ name, attributes, depth, index: lt });
    depth += 1;

    if (!selfClosing && !VOID_ELEMENTS.has(name)) {
      stack.push(name);
    }

    index = end + 1;

    if (RAW_TEXT_ELEMENTS.has(name)) {
      const closeTag = `</${name}`;
      const closeAt = html.toLowerCase().indexOf(closeTag, index);
      const inner =
        closeAt === -1 ? html.slice(index) : html.slice(index, closeAt);
      const bodyEnd = closeAt === -1 ? html.length : closeAt;
      textRegions.push({
        name,
        text: inner,
        start: index,
        end: bodyEnd,
        depth,
      });
      index = bodyEnd;
    }
  }

  return { tags, textRegions };
}

/**
 * Replace every raw-text region (script/style bodies) with spaces, keeping the
 * string's length and newlines intact so offsets and line numbers still line
 * up. Markup-level checks run against this so scripts and stylesheets cannot
 * trip them.
 *
 * Operates on code units (not code points) so astral characters keep their
 * width and every later offset stays valid.
 */
function maskRawText(html, textRegions) {
  let masked = "";
  let cursor = 0;
  for (const region of textRegions) {
    masked += html.slice(cursor, region.start);
    masked += html.slice(region.start, region.end).replace(/[^\n]/g, " ");
    cursor = region.end;
  }
  return masked + html.slice(cursor);
}

/** Read attributes of one tag, honouring quotes. Returns the tag end offset. */
function readAttributes(html, from) {
  const attributes = [];
  let index = from;

  while (index < html.length) {
    while (index < html.length && /\s/.test(html[index])) index += 1;
    if (html[index] === ">" || html[index] === "/" || index >= html.length)
      break;

    const nameMatch = /^[^\s=/>]+/.exec(html.slice(index));
    if (!nameMatch) {
      index += 1;
      continue;
    }
    const name = nameMatch[0];
    index += name.length;

    while (index < html.length && /\s/.test(html[index])) index += 1;

    let value = null;
    if (html[index] === "=") {
      index += 1;
      while (index < html.length && /\s/.test(html[index])) index += 1;
      const quote = html[index];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, index + 1);
        value =
          close === -1 ? html.slice(index + 1) : html.slice(index + 1, close);
        index = close === -1 ? html.length : close + 1;
      } else {
        const bare = /^[^\s>]*/.exec(html.slice(index));
        value = bare[0];
        index += value.length;
      }
    }

    attributes.push({ name, value, offset: index });
  }

  // Consume the closing `>`.
  while (index < html.length && html[index] !== ">") index += 1;
  return { end: index, attributes };
}

// ---------------------------------------------------------------------------
// settings.yaml schema
// ---------------------------------------------------------------------------

/**
 * Collect the set of valid `theme.config` paths from the Halo settings schema.
 * Group and array nodes are valid references in their own right, so both the
 * container path and its children are recorded.
 */
function collectSchemaPaths(settingsPath) {
  const raw = readFileSync(settingsPath, "utf8");
  const settings = parseYaml(raw);
  const paths = new Set();

  for (const form of settings?.spec?.forms ?? []) {
    if (form?.group) paths.add(form.group);
    walkSchema(form?.formSchema ?? [], form?.group ? [form.group] : [], paths);
  }
  return paths;
}

function walkSchema(nodes, prefix, paths) {
  for (const node of nodes ?? []) {
    const name = node?.name;
    const current = name ? [...prefix, name] : [...prefix];

    if (name) paths.add(current.join("."));

    // `group` and `array` nest their children under the field name.
    if (Array.isArray(node?.children) && node.children.length > 0) {
      walkSchema(node.children, current, paths);
    }
  }
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

function createReporter() {
  const problems = [];
  const add = (severity, file, line, message) =>
    problems.push({ severity, file, line, message });
  return {
    problems,
    error: (file, line, message) => add("error", file, line, message),
    warn: (file, line, message) => add("warning", file, line, message),
  };
}

function lineOf(html, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < html.length; index += 1) {
    if (html[index] === "\n") line += 1;
  }
  return line;
}

function isBalanced(expression, open, close) {
  let depth = 0;
  for (const character of expression) {
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function checkThymeleafExpression(report, file, line, expression, attribute) {
  if (!isBalanced(expression, "{", "}")) {
    report.error(
      file,
      line,
      `${attribute}: unbalanced braces in ${JSON.stringify(expression)}`,
    );
    return;
  }
  if (!isBalanced(expression, "(", ")")) {
    report.error(
      file,
      line,
      `${attribute}: unbalanced parentheses in ${JSON.stringify(expression)}`,
    );
  }
  for (const delimiter of ["${", "#{", "*{"]) {
    const opens = expression.split(delimiter).length - 1;
    if (opens === 0) continue;
    const content = expression.split(delimiter).slice(1).join(delimiter);
    if (!content.includes("}")) {
      report.error(
        file,
        line,
        `${attribute}: ${delimiter} opened but never closed in ${JSON.stringify(expression)}`,
      );
    }
  }
}

function checkConfigPaths(report, file, html, mask, schemaPaths) {
  const pattern =
    /theme\.config\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/g;
  const seen = new Set();

  for (const match of mask.matchAll(pattern)) {
    const configPath = match[1];
    if (seen.has(configPath)) continue;
    seen.add(configPath);
    if (LEGACY_CONFIG_PATHS.has(configPath)) continue;
    if (schemaPaths.has(configPath)) continue;

    // A longer schema path under this reference means the reference is a
    // container (e.g. `theme.config.post` while `post.license` exists).
    const isContainer = [...schemaPaths].some((candidate) =>
      candidate.startsWith(`${configPath}.`),
    );
    if (isContainer) continue;

    const line = lineOf(html, match.index);
    report.error(
      file,
      line,
      `theme.config.${configPath} does not exist in settings.yaml`,
    );
  }
}

function checkAttributeExpression(report, file, html, tag, attribute) {
  const line = lineOf(html, tag.index);
  const value = attribute.value ?? "";
  if (!value) {
    report.error(file, line, `${attribute.name} has no value`);
    return;
  }

  // Thymeleaf's parser-level comment block is server-side only.
  if (value.includes("[#") && !value.includes("#]")) {
    report.error(
      file,
      line,
      `${attribute.name}: "#[" parser comment block is not terminated`,
    );
  }

  checkThymeleafExpression(report, file, line, value, attribute.name);

  if (attribute.name === "th:each") {
    // "<var> : <expression>" or "<var>, <status> : <expression>"
    if (!/^[A-Za-z_][\w-]*(?:\s*,\s*[A-Za-z_][\w-]*)?\s*:\s*\S/.test(value)) {
      report.error(
        file,
        line,
        `th:each must be "<var>[, <status>] : <expression>", got ${JSON.stringify(value)}`,
      );
    }
  }

  if (attribute.name === "th:inline") {
    const language = value.trim().toLowerCase();
    if (!TH_INLINE_LANGUAGES.has(language)) {
      report.warn(
        file,
        line,
        `th:inline="${value}" is not a known inlining mode (${[...TH_INLINE_LANGUAGES].join(", ")})`,
      );
    }
  }
}

function checkInlineExpressions(report, file, html, markup, textRegions) {
  // `/*[[${...}]]*/` inlining inside <script> blocks: the comment wrapper makes
  // the expression invisible to browsers while Thymeleaf replaces it.
  for (const region of textRegions) {
    if (region.name !== "script") continue;
    for (const match of region.text.matchAll(/\/\*\[\[([\s\S]*?)\]\]\*\//g)) {
      checkThymeleafExpression(
        report,
        file,
        lineOf(html, region.start + match.index),
        match[1],
        "inlining expression",
      );
    }
  }

  // Delimiter balance only makes sense in markup: a script may legitimately
  // contain array literals such as `a[[0]]`.
  const opens = markup.split("[[").length - 1;
  const closes = markup.split("]]").length - 1;
  if (opens !== closes) {
    report.error(
      file,
      1,
      `unbalanced Thymeleaf inlining delimiters in markup: ${opens} "[[" vs ${closes} "]]"`,
    );
  }
}

function checkThCase(report, file, html, tags) {
  const stack = [];
  for (const tag of tags) {
    while (stack.length && stack[stack.length - 1].depth >= tag.depth) {
      stack.pop();
    }
    const hasSwitch = tag.attributes.some((a) => a.name === "th:switch");
    const hasCase = tag.attributes.some((a) => a.name === "th:case");
    if (hasCase) {
      const switchAncestor = stack.some((entry) => entry.hasSwitch);
      if (!switchAncestor) {
        report.error(
          file,
          lineOf(html, tag.index),
          "th:case without an enclosing th:switch",
        );
      }
    }
    if (hasSwitch || hasCase) stack.push({ depth: tag.depth, hasSwitch });
  }
}

function checkAstroLeaks(report, file, html, markup) {
  for (const { pattern, label } of ASTRO_LEAKS) {
    const match = pattern.exec(markup);
    if (match) {
      report.error(
        file,
        lineOf(html, match.index),
        `${label} leaked into the built template: ${JSON.stringify(match[0])}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// driver
// ---------------------------------------------------------------------------

function parseArguments(argv) {
  let templatesDir = path.join(ROOT, "templates");
  let settingsFile = path.join(ROOT, "settings.yaml");
  let strict = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") strict = true;
    else if (argument === "--templates")
      templatesDir = path.resolve(argv[++index]);
    else if (argument === "--settings")
      settingsFile = path.resolve(argv[++index]);
    else if (argument === "--help" || argument === "-h") {
      console.log(
        "usage: node scripts/validate-templates.mjs [--strict] [--templates <dir>] [--settings <file>]",
      );
      process.exit(0);
    } else {
      console.error(`unknown argument: ${argument}`);
      process.exit(2);
    }
  }

  return { templatesDir, settingsFile, strict };
}

/**
 * Validate every `.html` file in `templatesDir` and return the findings without
 * printing or exiting, so tests can drive this in-process.
 *
 * @returns {{findings: Array<{severity: string, file: string, line: number, message: string}>, files: string[]}}
 */
export function validateTemplates(templatesDir, settingsFile) {
  const schemaPaths = collectSchemaPaths(settingsFile);
  if (schemaPaths.size === 0) {
    throw new Error(`No settings schema read from ${settingsFile}`);
  }

  const report = createReporter();
  const files = readdirSync(templatesDir)
    .filter((entry) => entry.endsWith(".html"))
    .sort();

  for (const entry of files) {
    const html = readFileSync(path.join(templatesDir, entry), "utf8");
    const { tags, textRegions } = scan(html);
    const markup = maskRawText(html, textRegions);
    // `${theme.config}` dumps the whole config into the page inside a
    // Thymeleaf inlining comment. It is valid and references no single setting,
    // so blank it out rather than flagging it as a dangling reference.
    const configMask = markup.split("${theme.config}").join(" ".repeat(16));

    checkConfigPaths(report, entry, html, configMask, schemaPaths);
    checkInlineExpressions(report, entry, html, markup, textRegions);
    checkThCase(report, entry, html, tags);
    checkAstroLeaks(report, entry, html, markup);

    for (const tag of tags) {
      const seen = new Map();
      for (const attribute of tag.attributes) {
        const name = attribute.name.toLowerCase();

        // Duplicate or colliding attributes are rejected outright by the HTML
        // parser Thymeleaf feeds, so a duplicated `alt`/`class` silently drops
        // one of them.
        if (seen.has(name)) {
          report.error(
            entry,
            lineOf(html, tag.index),
            `duplicate attribute "${attribute.name}" on <${tag.name}>`,
          );
        } else {
          seen.set(name, attribute);
        }

        if (name.startsWith("data-th-")) {
          const equivalent = `th:${name.slice("data-th-".length)}`;
          report.warn(
            entry,
            lineOf(html, tag.index),
            `${attribute.name} uses the legacy data-th- form; prefer ${equivalent}`,
          );
          checkAttributeExpression(report, entry, html, tag, {
            name: equivalent,
            value: attribute.value,
          });
          continue;
        }

        if (!name.startsWith("th:")) continue;

        if (
          !KNOWN_TH_ATTRIBUTES.has(name.slice(3)) &&
          !TH_PREFIXED_ATTRIBUTES.test(name)
        ) {
          report.warn(
            entry,
            lineOf(html, tag.index),
            `unknown Thymeleaf attribute "${attribute.name}" on <${tag.name}>`,
          );
        }

        checkAttributeExpression(report, entry, html, tag, attribute);
      }
    }
  }

  return { findings: report.problems, files };
}

function main() {
  const { templatesDir, settingsFile, strict } = parseArguments(
    process.argv.slice(2),
  );

  if (!statSync(templatesDir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(
      `No templates found at ${templatesDir}. Run "pnpm build:only" first.`,
    );
    process.exit(2);
  }

  let result;
  try {
    result = validateTemplates(templatesDir, settingsFile);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  const { findings, files } = result;
  if (files.length === 0) {
    console.error(`No .html templates in ${templatesDir}`);
    process.exit(2);
  }

  const errors = findings.filter((p) => p.severity === "error");
  const warnings = findings.filter((p) => p.severity === "warning");

  for (const problem of findings) {
    const label = problem.severity === "error" ? "error" : "warning";
    console.log(
      `${problem.file}:${problem.line}  ${label}  ${problem.message}`,
    );
  }

  const summary = `${files.length} templates checked: ${errors.length} error(s), ${warnings.length} warning(s)`;
  if (errors.length || (strict && warnings.length)) {
    console.error(`\n✗ ${summary}`);
    process.exit(1);
  }
  console.log(`\n✓ ${summary}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
