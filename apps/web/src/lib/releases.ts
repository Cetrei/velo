const GITHUB_RELEASES_API_BASE = 'https://api.github.com/repos';
const DEFAULT_RELEASES_REPO = 'Cetrei/velo';

export function getReleasesRepo(): string {
  const configuredRepo = import.meta.env.VITE_RELEASES_REPO as string | undefined;
  return configuredRepo && configuredRepo.length > 0 ? configuredRepo : DEFAULT_RELEASES_REPO;
}

export function getReleasesRepoUrl(): string {
  return `https://github.com/${getReleasesRepo()}`;
}

function buildReleasesApiUrl(repo: string): string {
  return `${GITHUB_RELEASES_API_BASE}/${repo}/releases`;
}

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  sizeBytes: number;
}

export interface VeloRelease {
  tagName: string;
  versionName: string;
  publishedAt: string;
  htmlUrl: string;
  windowsAsset: ReleaseAsset | null;
  androidAsset: ReleaseAsset | null;
}

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
  assets: GithubReleaseAsset[];
}

function toVersionName(tagName: string): string {
  return tagName.startsWith('v') ? tagName.slice(1) : tagName;
}

function findAsset(assets: GithubReleaseAsset[], predicate: (name: string) => boolean): ReleaseAsset | null {
  const match = assets.find((asset) => predicate(asset.name.toLowerCase()));
  if (!match) return null;
  return {
    name: match.name,
    downloadUrl: match.browser_download_url,
    sizeBytes: match.size,
  };
}

function toVeloRelease(raw: GithubRelease): VeloRelease {
  return {
    tagName: raw.tag_name,
    versionName: toVersionName(raw.tag_name),
    publishedAt: raw.published_at,
    htmlUrl: raw.html_url,
    windowsAsset: findAsset(raw.assets, (name) => name.endsWith('-setup.exe') || name.endsWith('.msi')),
    androidAsset: findAsset(raw.assets, (name) => name.endsWith('.apk')),
  };
}

export async function fetchPublishedReleases(repo: string): Promise<VeloRelease[]> {
  const response = await fetch(`${buildReleasesApiUrl(repo)}?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`[WEB] Failed to fetch releases from GitHub (status ${response.status})`);
  }
  const raw = (await response.json()) as GithubRelease[];
  return raw
    .filter((release) => !release.draft && !release.prerelease)
    .map(toVeloRelease)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '';
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(1)} MB`;
}

export function formatReleaseDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
