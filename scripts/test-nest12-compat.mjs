import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureSource = join(repositoryRoot, 'test', 'compat', 'nest12-esm');
const exactNestVersion = '12.0.0-alpha.5';
const expectedNestPeerRange = '^10.0.0 || ^11.0.0 || 12.0.0-alpha.5';
const nestWorkspaceDependencies = new Set([
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express',
  '@nestjs/platform-fastify',
  '@nestjs/testing',
]);
const excludedWorkspaceSegments = new Set(['.git', '.turbo', 'dist', 'node_modules']);
const packagePeers = [
  { directory: 'packages/common', nestPeers: ['@nestjs/common'] },
  { directory: 'packages/client', nestPeers: ['@nestjs/common', '@nestjs/core'] },
  { directory: 'packages/server', nestPeers: ['@nestjs/common', '@nestjs/core'] },
  { directory: 'packages/gateway', nestPeers: ['@nestjs/common', '@nestjs/core'] },
];

function run(command, args, cwd, stdio = 'inherit') {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed${
            signal ? ` with signal ${signal}` : ` with exit code ${code ?? 'unknown'}`
          }`,
        ),
      );
    });
  });
}

async function readPackageManifest(directory) {
  return JSON.parse(await readFile(join(repositoryRoot, directory, 'package.json'), 'utf8'));
}

async function verifyNestPeerRanges() {
  for (const { directory, nestPeers } of packagePeers) {
    const manifest = await readPackageManifest(directory);
    for (const peer of nestPeers) {
      assert.equal(
        manifest.peerDependencies?.[peer],
        expectedNestPeerRange,
        `${manifest.name} must advertise the exact tested Nest 12 alpha peer`,
      );
    }
  }
}

function shouldCopyWorkspacePath(source) {
  const sourceRelativePath = relative(repositoryRoot, source);
  return !sourceRelativePath.split(sep).some((segment) => excludedWorkspaceSegments.has(segment));
}

async function workspaceManifestPaths(workspaceDirectory) {
  const manifestPaths = [join(workspaceDirectory, 'package.json')];

  for (const workspaceGroup of ['apps', 'packages']) {
    const groupDirectory = join(workspaceDirectory, workspaceGroup);
    const entries = await readdir(groupDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = join(groupDirectory, entry.name, 'package.json');
        try {
          await access(manifestPath);
          manifestPaths.push(manifestPath);
        } catch {
          // Empty reserved package directories are intentionally not pnpm workspaces.
        }
      }
    }
  }

  return manifestPaths;
}

async function pinWorkspaceNestDependencies(workspaceDirectory) {
  for (const manifestPath of await workspaceManifestPaths(workspaceDirectory)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    let changed = false;

    for (const dependencySection of ['dependencies', 'devDependencies']) {
      for (const dependencyName of nestWorkspaceDependencies) {
        if (manifest[dependencySection]?.[dependencyName]) {
          manifest[dependencySection][dependencyName] = exactNestVersion;
          changed = true;
        }
      }
    }

    if (changed) {
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }
}

async function verifyWorkspaceWithNest12(workspaceDirectory) {
  await cp(repositoryRoot, workspaceDirectory, {
    recursive: true,
    filter: shouldCopyWorkspacePath,
  });
  await pinWorkspaceNestDependencies(workspaceDirectory);
  await run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], workspaceDirectory);
  await run('pnpm', ['typecheck'], workspaceDirectory);
  await run('pnpm', ['test'], workspaceDirectory);
  await run('pnpm', ['build'], workspaceDirectory);
}

async function packPackages(tarballDirectory) {
  const tarballs = new Map();

  for (const { directory } of packagePeers) {
    const manifest = await readPackageManifest(directory);
    const before = new Set(await readdir(tarballDirectory));

    await run(
      'pnpm',
      ['pack', '--pack-destination', tarballDirectory],
      join(repositoryRoot, directory),
      ['ignore', 'ignore', 'inherit'],
    );

    const created = (await readdir(tarballDirectory)).filter((file) => !before.has(file));
    assert.equal(created.length, 1, `packing ${manifest.name} must create exactly one tarball`);
    tarballs.set(manifest.name, join(tarballDirectory, created[0]));
  }

  return tarballs;
}

async function installPackedPackages(consumerDirectory, tarballs) {
  const manifestPath = join(consumerDirectory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  for (const [packageName, tarball] of tarballs) {
    manifest.dependencies[packageName] = `file:${tarball}`;
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], consumerDirectory);
}

async function main() {
  await verifyNestPeerRanges();

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'nest-mcp-nest12-'));
  const workspaceDirectory = join(temporaryRoot, 'workspace');
  const tarballDirectory = join(temporaryRoot, 'tarballs');
  const consumerDirectory = join(temporaryRoot, 'consumer');

  try {
    await verifyWorkspaceWithNest12(workspaceDirectory);
    await mkdir(tarballDirectory);
    const tarballs = await packPackages(tarballDirectory);
    await cp(fixtureSource, consumerDirectory, { recursive: true });
    await installPackedPackages(consumerDirectory, tarballs);
    await run('pnpm', ['test'], consumerDirectory);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
