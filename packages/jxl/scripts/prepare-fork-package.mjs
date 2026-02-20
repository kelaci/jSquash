#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPackagePath = path.join(__dirname, '..', 'dist', 'package.json');

const raw = await readFile(distPackagePath, 'utf8');
const pkg = JSON.parse(raw);

const baseVersion = pkg.version;
const packageName = process.env.FORK_PACKAGE_NAME ?? '@lacinak/jsquash-jxl';
const packageVersion =
  process.env.FORK_PACKAGE_VERSION ?? `${baseVersion}-lacinak.0`;
const repository = process.env.FORK_PACKAGE_REPOSITORY ?? 'lacinak/jSquash';

pkg.name = packageName;
pkg.version = packageVersion;
pkg.repository = {
  type: 'git',
  url: `git+https://github.com/${repository}.git`,
};
pkg.types = 'index.d.ts';
pkg.exports = {
  '.': {
    types: './index.d.ts',
    import: './index.js',
    default: './index.js',
  },
};
pkg.publishConfig = {
  access: 'public',
};
delete pkg.scripts;
delete pkg.devDependencies;

await writeFile(distPackagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log(
  `Prepared fork package ${pkg.name}@${pkg.version} in ${distPackagePath}`,
);
