/* Only publication-permitted runtime sprites are used for these previews. */
/* eslint-disable @next/next/no-img-element */
'use client';
import { useState } from 'react';
import type { CatalogItem } from '@/lib/study/data';
export function ItemPreview({ item, decorative = false }: { item: CatalogItem; decorative?: boolean }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  return failedPath === item.asset_path || !item.asset_path.startsWith('/assets/room/') ? <div className="item-fallback" aria-label={decorative ? undefined : `${item.name} image unavailable`} aria-hidden={decorative || undefined}>▧</div> : <img className="item-preview" src={item.asset_path} alt={decorative ? "" : item.name} onError={() => setFailedPath(item.asset_path)} />;
}
