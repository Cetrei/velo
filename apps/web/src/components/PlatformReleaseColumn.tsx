import { useState } from 'react';
import type { ReleaseAsset, VeloRelease } from '../lib/releases';
import { formatFileSize, formatReleaseDate } from '../lib/releases';

const RECENT_VERSIONS_SHOWN = 3;

interface PlatformEntry {
  release: VeloRelease;
  asset: ReleaseAsset;
}

interface PlatformReleaseColumnProps {
  platformLabel: string;
  installHint: string;
  entries: PlatformEntry[];
}

function ReleaseRow({ entry, isLatest }: { entry: PlatformEntry; isLatest: boolean }) {
  const { release, asset } = entry;
  return (
    <a
      href={asset.downloadUrl}
      className="flex items-center justify-between gap-4 rounded-xl border border-velo-surface px-4 py-3 transition-colors hover:border-velo-indigo"
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium text-velo-text-primary">
          v{release.versionName}
          {isLatest && (
            <span className="ml-2 rounded-full bg-velo-emerald/15 px-2 py-0.5 text-xs font-medium text-velo-emerald">
              Latest
            </span>
          )}
        </span>
        <span className="text-xs text-velo-text-secondary">
          {formatReleaseDate(release.publishedAt)}
          {asset.sizeBytes > 0 && ` · ${formatFileSize(asset.sizeBytes)}`}
        </span>
      </div>
      <span className="text-xs font-medium text-velo-indigo">Download</span>
    </a>
  );
}

export function PlatformReleaseColumn({ platformLabel, installHint, entries }: PlatformReleaseColumnProps) {
  const [showAll, setShowAll] = useState(false);

  if (entries.length === 0) {
    return (
      <section className="flex flex-1 flex-col gap-3 rounded-2xl bg-velo-surface p-6">
        <h2 className="text-base font-medium text-velo-text-primary">{platformLabel}</h2>
        <p className="text-sm text-velo-text-secondary">No published releases yet.</p>
      </section>
    );
  }

  const visibleEntries = showAll ? entries : entries.slice(0, RECENT_VERSIONS_SHOWN);
  const hasMore = !showAll && entries.length > RECENT_VERSIONS_SHOWN;

  return (
    <section className="flex flex-1 flex-col gap-3 rounded-2xl bg-velo-surface p-6">
      <div>
        <h2 className="text-base font-medium text-velo-text-primary">{platformLabel}</h2>
        <p className="text-xs text-velo-text-secondary">{installHint}</p>
      </div>
      <div className="flex flex-col gap-2">
        {visibleEntries.map((entry, index) => (
          <ReleaseRow key={entry.release.tagName} entry={entry} isLatest={index === 0} />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-1 text-xs font-medium text-velo-text-secondary underline"
        >
          See all versions
        </button>
      )}
    </section>
  );
}
