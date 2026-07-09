// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { imageImportApi } from '@/apis/imageImportApi';
import { ImageAnnotator } from './ImageAnnotator';
import { API_BASE } from '@/config/urls';
import type { ImageImport } from '@/types/imageImport';

interface Props {
  imageImportId: string;
}

/**
 * Read-only render of an image import: original image with the annotation
 * overlay drawn on top. Used by StoryDetailPanel for stories that were
 * created via "Create from Image".
 */
export function ImageImportPreview({ imageImportId }: Props) {
  const [data, setData] = useState<ImageImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    imageImportApi
      .getById(imageImportId)
      .then((r) => active && setData(r))
      .catch((e: { message?: string }) =>
        active && setError(e?.message ?? 'Failed to load annotated image'),
      );
    return () => {
      active = false;
    };
  }, [imageImportId]);

  if (error) {
    return (
      <div className="rounded-md border bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Loading annotated image…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ImageIcon className="h-4 w-4" />
        Annotated source image
        <span className="text-xs font-normal text-muted-foreground">
          ({data.annotations.length} annotation{data.annotations.length !== 1 ? 's' : ''})
        </span>
      </div>
      <ImageAnnotator
        imageUrl={`${API_BASE}${data.attachmentUrl}`}
        annotations={data.annotations}
        onChange={() => {}}
        readOnly
        maxWidth={720}
      />
    </div>
  );
}
