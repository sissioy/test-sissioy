import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  LEGACY_SAMPLE_PATH,
  PIN_PATH,
  assertOverlayAllowed,
  isLegacyArticlePath,
  mapLegacyPath,
  rewriteLegacyText
} from './lib/legacy.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, '.build');
const modernDir = path.join(buildDir, 'modern');
const legacyDir = path.join(buildDir, 'legacy');
const archivePath = path.join(buildDir, 'legacy.tar');
const distDir = path.join(root, 'dist');
const textExtensions = new Set(['.html', '.css', '.js', '.xml', '.json', '.txt', '.webmanifest']);

async function run(command, args) {
  const result = await execFileAsync(command, args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

async function walk(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function extractLegacySnapshot() {
  try {
    await run('git', ['rev-parse', '--verify', 'origin/gh-pages']);
  } catch {
    throw new Error('Missing origin/gh-pages. Run: git fetch origin gh-pages:refs/remotes/origin/gh-pages');
  }
  await mkdir(legacyDir, { recursive: true });
  await run('git', ['archive', '--format=tar', '--output', archivePath, 'origin/gh-pages']);
  await run('tar', ['-xf', archivePath, '-C', legacyDir]);
}

async function copyLegacySnapshot() {
  const files = await walk(legacyDir);
  const legacyArticles = files.filter(isLegacyArticlePath);
  if (legacyArticles.length !== 45) {
    throw new Error(`Expected 45 frozen legacy article pages, found ${legacyArticles.length}`);
  }

  for (const relative of files) {
    const source = path.join(legacyDir, relative);
    const target = path.join(distDir, mapLegacyPath(relative));
    await mkdir(path.dirname(target), { recursive: true });
    if (textExtensions.has(path.extname(relative).toLowerCase())) {
      const contents = await readFile(source, 'utf8');
      await writeFile(target, rewriteLegacyText(contents));
    } else {
      await cp(source, target);
    }
  }
}

async function copyFontAssets() {
  const packageDir = path.join(root, 'node_modules/@fontsource/noto-serif-sc');
  const cssSource = path.join(packageDir, '400.css');
  const css = await readFile(cssSource, 'utf8');
  const fontNames = [...css.matchAll(/\.\/files\/([^)'\"]+\.woff2)/g)].map(match => match[1]);
  const targetDir = path.join(modernDir, 'fonts');
  await mkdir(targetDir, { recursive: true });
  for (const name of new Set(fontNames)) {
    await cp(path.join(packageDir, 'files', name), path.join(targetDir, name));
  }
  await writeFile(path.join(targetDir, 'noto-serif-sc.css'), css.replaceAll('./files/', '/fonts/'));
}

async function overlayModernBuild() {
  const files = await walk(modernDir);
  for (const relative of files) {
    const source = path.join(modernDir, relative);
    const target = path.join(distDir, relative);
    try {
      if ((await stat(target)).isFile()) assertOverlayAllowed(relative);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { force: true });
  }
}

function parseFrontMatter(contents) {
  const match = contents.match(/^---\s*\n([\s\S]*?)\n---/);
  return match ? yaml.load(match[1]) ?? {} : {};
}

function dateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return { year: get('year'), month: get('month') };
}

async function collectPublishedPosts() {
  const postsDir = path.join(root, 'source/_posts');
  const entries = await readdir(postsDir, { withFileTypes: true });
  const posts = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;
    const frontMatter = parseFrontMatter(await readFile(path.join(postsDir, entry.name), 'utf8'));
    if (frontMatter.published === false) continue;
    const slug = path.basename(entry.name, '.md');
    const explicit = frontMatter.permalink ? String(frontMatter.permalink).replace(/^\/+/, '') : null;
    const parts = dateParts(frontMatter.date);
    posts.push({
      title: String(frontMatter.title ?? slug),
      legacy: frontMatter.legacy === true,
      path: explicit ?? `posts/${parts.year}/${parts.month}/${slug}/`
    });
  }
  return posts;
}

async function writeDeploymentManifest() {
  const posts = await collectPublishedPosts();
  const newPosts = posts.filter(post => !post.legacy);
  let commit = 'working-tree';
  try {
    commit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  } catch {}
  const manifest = {
    schemaVersion: 1,
    commit,
    newPostCount: newPosts.length,
    newPostPaths: newPosts.map(post => post.path),
    pinPath: PIN_PATH,
    legacySamplePath: LEGACY_SAMPLE_PATH,
    legacyArticleCount: 45
  };
  await writeFile(path.join(distDir, 'deployment-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

await rm(buildDir, { recursive: true, force: true });
await rm(distDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
await mkdir(distDir, { recursive: true });

await extractLegacySnapshot();
await run(path.join(root, 'node_modules/.bin/hexo'), ['generate']);
await copyFontAssets();
await copyLegacySnapshot();
await overlayModernBuild();
await writeDeploymentManifest();

console.log('Built merged site in dist/');
