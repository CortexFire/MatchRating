/* eslint-disable @typescript-eslint/no-require-imports -- This development-only runner installs a CommonJS TypeScript require hook. */
// Small runner for the benchmark only; uses the project's installed TypeScript.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(result.outputText, filename);
};
const target = path.resolve(process.argv[2]);
process.argv.splice(1, 1);
require(target);
