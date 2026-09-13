// Fault-injection test for scripts/validate-templates.mjs.
// Copies the built templates to a scratch dir, injects one defect per case,
// and asserts the validator reports it. Also asserts a clean copy stays clean.
//
// Runs the validator in-process: the sandbox forbids spawning node with piped
// stdio, and importing the exported function is faster and more precise anyway.
//
//   node .tmp-verify/validator-faults.mjs

import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { validateTemplates } from "../scripts/validate-templates.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRATCH = path.join(ROOT, ".tmp-verify", "fault-templates");
const SETTINGS = path.join(ROOT, "settings.yaml");

function findingsFor() {
  return validateTemplates(SCRATCH, SETTINGS).findings;
}

function resetScratch() {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  cpSync(path.join(ROOT, "templates"), SCRATCH, { recursive: true });
}

function patch(file, from, to) {
  const target = path.join(SCRATCH, file);
  const original = readFileSync(target, "utf8");
  if (!original.includes(from)) {
    throw new Error(`anchor not found in ${file}: ${JSON.stringify(from)}`);
  }
  writeFileSync(target, original.replace(from, to));
}

const cases = [
  {
    name: "clean build output",
    mutate: () => {},
    expect: [],
  },
  {
    name: "unknown theme.config path",
    mutate: () =>
      patch(
        "index.html",
        "${site.title}",
        "${theme.config.base.banner.enabel}",
      ),
    expect: [
      "error",
      "theme.config.base.banner.enabel does not exist in settings.yaml",
    ],
  },
  {
    name: "setting renamed in settings.yaml but not in the template",
    mutate: () =>
      patch(
        "post.html",
        "${theme.config.post.license.name}",
        "${theme.config.post.license.nam}",
      ),
    expect: ["error", "theme.config.post.license.nam does not exist"],
  },
  {
    name: "duplicate attribute on one tag",
    mutate: () =>
      patch(
        "index.html",
        '<meta charset="UTF-8">',
        '<meta charset="UTF-8" charset="utf-8">',
      ),
    expect: ["error", 'duplicate attribute "charset" on <meta>'],
  },
  {
    name: "duplicate class attribute silently dropping one",
    mutate: () =>
      patch(
        "index.html",
        '<div id="config-carrier"',
        '<div class="a" class="b" id="config-carrier"',
      ),
    expect: ["error", 'duplicate attribute "class" on <div>'],
  },
  {
    name: "unbalanced braces in a th: expression",
    mutate: () =>
      patch("index.html", 'th:text="${site.title}"', 'th:text="${site.title"'),
    expect: ["error", "unbalanced braces"],
  },
  {
    name: "th:each without an iteration variable",
    mutate: () =>
      patch("tags.html", 'th:each="tag : ${tags}"', 'th:each="${tags}"'),
    expect: ["error", "th:each must be"],
  },
  {
    name: "Astro Fragment leaking through",
    mutate: () =>
      patch(
        "index.html",
        '<meta charset="UTF-8">',
        '<Fragment set:html="x"><meta charset="UTF-8">',
      ),
    expect: ["error", "Astro <Fragment>"],
  },
  {
    name: "unbalanced inlining delimiters",
    mutate: () => patch("index.html", "<body", "<body [[${site.title}]"),
    expect: ["error", "unbalanced Thymeleaf inlining delimiters"],
  },
  {
    name: "th:case without a th:switch",
    mutate: () =>
      patch("index.html", "<html th:lang=", "<html th:case=\"'x'\" th:lang="),
    expect: ["error", "th:case without an enclosing th:switch"],
  },
  {
    name: "unknown th: attribute",
    mutate: () =>
      patch(
        "index.html",
        'th:if="${theme.config.base.banner.enable}"',
        'th:iff="${theme.config.base.banner.enable}"',
      ),
    expect: ["warning", 'unknown Thymeleaf attribute "th:iff"'],
  },
  {
    name: "legacy data-th- form",
    mutate: () =>
      patch(
        "index.html",
        'th:if="${theme.config.base.banner.enable}"',
        'data-th-if="${theme.config.base.banner.enable}"',
      ),
    expect: ["warning", "uses the legacy data-th- form"],
  },
  {
    name: "legacy base.themeColor.hue stays allowed",
    mutate: () =>
      patch(
        "index.html",
        "${site.title}",
        "${theme.config.base.themeColor.hue}",
      ),
    expect: [],
  },

  // Boundary cases for the th:case / th:switch ancestry rule. Each replaces the
  // whole scratch directory with a single synthetic template.
  {
    name: "th:case as a direct child of its th:switch",
    replaceAll: () =>
      `<div th:switch="\${x}"><div th:case="'a'">A</div><div th:case="'b'">B</div></div>`,
    expect: [],
  },
  {
    name: "th:case nested deeply inside its th:switch",
    replaceAll: () =>
      `<div th:switch="\${x}"><section><article><p th:case="'a'">A</p></article></section></div>`,
    expect: [],
  },
  {
    name: "th:case in the second of two sibling switches",
    replaceAll: () =>
      `<div th:switch="\${x}"><div th:case="'a'">A</div></div><div th:switch="\${y}"><div th:case="'b'">B</div></div>`,
    expect: [],
  },
  {
    name: "th:case after the switch has closed",
    replaceAll: () =>
      `<div th:switch="\${x}"><div>A</div></div><div th:case="'a'">A</div>`,
    expect: ["error", "th:case without an enclosing th:switch"],
  },
  {
    name: "th:case belonging to an empty sibling switch",
    replaceAll: () =>
      `<div th:switch="\${x}"><div th:case="'a'">A</div></div><div th:switch="\${y}"></div><div th:case="'b'">B</div>`,
    expect: ["error", "th:case without an enclosing th:switch"],
  },
];

let passed = 0;
const failures = [];

for (const testCase of cases) {
  resetScratch();
  try {
    if (testCase.replaceAll) {
      // Synthetic single-template scenarios: drop the real build output so the
      // case is judged in isolation.
      rmSync(SCRATCH, { recursive: true, force: true });
      mkdirSync(SCRATCH, { recursive: true });
      writeFileSync(
        path.join(SCRATCH, "case.html"),
        `<!doctype html><html><body>${testCase.replaceAll()}</body></html>`,
      );
    } else {
      testCase.mutate();
    }
  } catch (error) {
    failures.push(
      `${testCase.name}: could not inject defect - ${error.message}`,
    );
    continue;
  }

  let findings;
  try {
    findings = findingsFor();
  } catch (error) {
    failures.push(`${testCase.name}: validator threw - ${error.message}`);
    continue;
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  if (testCase.expect.length === 0) {
    if (findings.length > 0) {
      failures.push(
        `${testCase.name}: expected no findings, got ${findings.length}:\n` +
          findings.map((f) => `      ${f.severity}: ${f.message}`).join("\n"),
      );
      continue;
    }
  } else {
    const [severity, message] = testCase.expect;
    const pool = severity === "error" ? errors : warnings;
    if (!pool.some((f) => f.message.includes(message))) {
      failures.push(
        `${testCase.name}: no ${severity} containing ${JSON.stringify(message)}; got:\n` +
          findings.map((f) => `      ${f.severity}: ${f.message}`).join("\n"),
      );
      continue;
    }
    if (severity === "warning" && errors.length > 0) {
      failures.push(
        `${testCase.name}: warning case also produced errors: ` +
          errors.map((f) => f.message).join("; "),
      );
      continue;
    }
  }

  passed += 1;
}

resetScratch();
rmSync(SCRATCH, { recursive: true, force: true });

console.log(`passed: ${passed}/${cases.length}`);
if (failures.length) {
  console.error(`failed: ${failures.length}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("validator catches every injected defect");
