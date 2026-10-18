// Pull named top-level functions and constants out of app.js, so their logic can be tested in Node
// without a browser. Only pure helpers are tested this way; the rest is tested by hand.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

function block(name) {
  const re = new RegExp(`^(?:async )?function ${name}\\(|^const ${name} = `, "m");
  const m = re.exec(SRC);
  if (!m) throw new Error(`not found in app.js: ${name}`);
  // walk to the end of the statement: balanced brackets, then a newline (function) or ";" (const)
  let i = m.index, depth = 0, str = null, seenOpen = false;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (str) { if (c === "\\") i++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === "/" && SRC[i + 1] === "/") { i = SRC.indexOf("\n", i); continue; }
    if ("({[".includes(c)) { depth++; seenOpen = true; }
    else if (")}]".includes(c)) depth--;
    if (seenOpen && depth === 0 && (c === "}" || c === ";" || c === ")") && /^\s*(\n|;|$)/.test(SRC.slice(i + 1, i + 3))) {
      return SRC.slice(m.index, SRC[i + 1] === ";" ? i + 2 : i + 1);
    }
  }
  throw new Error(`unterminated: ${name}`);
}

export function load(names, globals = {}) {
  const ctx = vm.createContext({ Math, Date, JSON, Intl, Object, Array, Number, String, Set, Map, isFinite, ...globals });
  vm.runInContext(names.map(block).join("\n") + `\n;globalThis.__out = { ${names.join(", ")} };`, ctx);
  return ctx.__out;
}
