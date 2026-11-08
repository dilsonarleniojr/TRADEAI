// Análise de código morto: grafo de imports a partir das entradas do Next.js.
// Uso: node deadcode.cjs <raiz-do-projeto>
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2]);
const ts = require(path.join(root, "node_modules/typescript"));
const SRC = path.join(root, "src");
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".venv" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.includes(path.extname(name))) out.push(p);
  }
  return out;
}

function resolveFile(base) {
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))];
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

function specifiers(file) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out = [];
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push(n.moduleSpecifier.text);
    } else if (ts.isCallExpression(n)) {
      const a = n.arguments[0];
      const isImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === "require";
      if ((isImport || isRequire) && a && ts.isStringLiteralLike(a)) out.push(a.text);
    } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "URL") {
      const a = n.arguments && n.arguments[0];
      if (a && ts.isStringLiteralLike(a)) out.push(a.text); // new Worker(new URL("./x.ts", import.meta.url))
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function resolveSpec(from, spec) {
  if (spec.startsWith("@/")) return resolveFile(path.join(SRC, spec.slice(2)));
  if (spec.startsWith(".")) return resolveFile(path.resolve(path.dirname(from), spec));
  return null;
}

function pkgName(spec) {
  if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("node:") || spec.startsWith("bun:")) return null;
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

// Entradas: arquivos especiais do App Router, workers, testes, configs e scripts.
const NEXT_SPECIAL = /^(page|layout|route|loading|error|not-found|global-error|template|default|middleware|proxy|instrumentation|opengraph-image|icon|sitemap|robots|manifest)\.(t|j)sx?$/;
const allSrc = walk(SRC);
const entries = new Set(
  allSrc.filter((f) => NEXT_SPECIAL.test(path.basename(f)) || f.includes(`${path.sep}workers${path.sep}`))
);
for (const f of walk(path.join(root, "tests"))) entries.add(f);
for (const f of walk(path.join(root, "scratch"))) entries.add(f);
for (const name of fs.readdirSync(root)) {
  const p = path.join(root, name);
  if (fs.statSync(p).isFile() && EXTS.includes(path.extname(name))) entries.add(p);
}
for (const d of fs.readdirSync(path.join(root, "mini-services"))) {
  for (const f of walk(path.join(root, "mini-services", d))) entries.add(f);
}

const reached = new Set();
const usedPkgs = new Set();
const stack = [...entries];
while (stack.length) {
  const f = stack.pop();
  if (reached.has(f)) continue;
  reached.add(f);
  let specs = [];
  try { specs = specifiers(f); } catch { continue; }
  for (const s of specs) {
    const pn = pkgName(s);
    if (pn) usedPkgs.add(pn);
    const r = resolveSpec(f, s);
    if (r && !reached.has(r)) stack.push(r);
  }
}

// Referências por string (ex.: caminhos em configs ou fetch de workers em public/) — conservador.
const unreachable = allSrc.filter((f) => !reached.has(f));
const lines = (f) => fs.readFileSync(f, "utf8").split("\n").length;

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const configText = ["next.config.ts", "postcss.config.mjs", "tailwind.config.ts", "eslint.config.mjs", "components.json", "src/app/globals.css"]
  .map((f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), "utf8") : ""))
  .join("\n");
const scriptsText = JSON.stringify(pkg.scripts || {});
const unusedDeps = Object.keys(pkg.dependencies || {}).filter(
  (d) => !usedPkgs.has(d) && !configText.includes(d) && !scriptsText.includes(d)
);
const unusedDevDeps = Object.keys(pkg.devDependencies || {}).filter(
  (d) => !usedPkgs.has(d) && !configText.includes(d) && !scriptsText.includes(d) && !d.startsWith("@types/")
);

const rel = (f) => path.relative(root, f);
const total = unreachable.reduce((a, f) => a + lines(f), 0);
console.log(`ARQUIVOS_SRC ${allSrc.length} | ALCANCADOS ${allSrc.filter((f) => reached.has(f)).length} | INALCANCAVEIS ${unreachable.length} (${total} linhas)`);
for (const f of unreachable.sort((a, b) => lines(b) - lines(a))) console.log(`  ${String(lines(f)).padStart(5)}  ${rel(f)}`);
console.log(`DEPS_SEM_USO (${unusedDeps.length}): ${unusedDeps.join(", ")}`);
console.log(`DEVDEPS_SEM_USO (${unusedDevDeps.length}): ${unusedDevDeps.join(", ")}`);
