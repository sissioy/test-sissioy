import path from 'node:path';

export const LEGACY_ASSET_DIRS = new Set(['css', 'js', 'lib', 'images']);
export const PIN_PATH = 'archives/a5547e95.html';
export const LEGACY_SAMPLE_PATH = 'archives/c895e024.html';

export function mapLegacyPath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const first = normalized.split('/')[0];
  return LEGACY_ASSET_DIRS.has(first) ? `legacy-assets/${normalized}` : normalized;
}

export function rewriteLegacyText(text) {
  return text
    .replace(/https?:\/\/(?:www\.)?sissioy\.com/gi, 'https://www.sissioy.top')
    .replace(/([\"'(=])\/(css|js|lib|images)\//g, '$1/legacy-assets/$2/');
}

export function isLegacyArticlePath(relativePath) {
  return /^archives\/[0-9a-f]+\.html$/i.test(relativePath);
}

export function isAllowedOverlayConflict(relativePath) {
  if (relativePath === PIN_PATH || relativePath === 'index.html') return true;
  if (/^(archives|tags|categories|page)\//.test(relativePath) && !isLegacyArticlePath(relativePath)) return true;
  return /^(atom\.xml|sitemap\.xml|search\.xml|robots\.txt)$/.test(relativePath);
}

export function assertOverlayAllowed(relativePath) {
  if (isLegacyArticlePath(relativePath) && relativePath !== PIN_PATH) {
    throw new Error(`Modern build may not overwrite frozen legacy article: ${relativePath}`);
  }
  if (!isAllowedOverlayConflict(relativePath)) {
    throw new Error(`Unexpected modern/legacy output conflict: ${relativePath}`);
  }
}
