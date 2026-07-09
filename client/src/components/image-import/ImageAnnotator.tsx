// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KImage, Rect, Arrow, Circle, Text, Group, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Annotation, AnnotationShape } from '@/types/imageImport';
import { httpClient } from '@/config/httpClient';

interface Props {
  imageUrl: string;
  annotations: Annotation[];
  onChange: (next: Annotation[]) => void;
  /**
   * Read-only mode. When true, the annotator becomes a static overlay used by
   * StoryDetailPanel — no toolbar, no drag, no edit.
   */
  readOnly?: boolean;
  /** Optional max width in pixels — image scales down to fit. */
  maxWidth?: number;
}

const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function pickColor(annotations: Annotation[]): string {
  return PALETTE[annotations.length % PALETTE.length];
}

export function ImageAnnotator({ imageUrl, annotations, onChange, readOnly, maxWidth = 900 }: Props) {
  const [tool, setTool] = useState<AnnotationShape>('rect');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // The attachment endpoint is auth-gated, so we can't load the image with a
  // bare `<img src>` (no cookies on cross-origin GETs without explicit CORS
  // setup). Fetch the image bytes through the authenticated httpClient, build
  // an object URL, and feed THAT to the Image element.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setImage(null);
    setLoadError(null);

    (async () => {
      try {
        const res = await httpClient.get(imageUrl, { responseType: 'blob' });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        const img = new window.Image();
        img.onload = () => !cancelled && setImage(img);
        img.onerror = () => !cancelled && setLoadError('Failed to decode image');
        img.src = objectUrl;
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load image from server',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl]);

  const { stageWidth, stageHeight, scale } = useMemo(() => {
    if (!image) return { stageWidth: maxWidth, stageHeight: 400, scale: 1 };
    const s = Math.min(1, maxWidth / image.naturalWidth);
    return {
      stageWidth: image.naturalWidth * s,
      stageHeight: image.naturalHeight * s,
      scale: s,
    };
  }, [image, maxWidth]);

  // Wire up the transformer to the currently selected node.
  useEffect(() => {
    if (readOnly || !transformerRef.current || !stageRef.current) return;
    if (!selectedId) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
      return;
    }
    const node = stageRef.current.findOne(`#anno-${selectedId}`);
    if (node) {
      transformerRef.current.nodes([node]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, annotations, readOnly]);

  function onMouseDown(e: KonvaEventObject<MouseEvent>) {
    if (readOnly) return;
    // Click on empty stage area → start drawing or deselect
    const target = e.target;
    if (target !== target.getStage() && target.getType() !== 'Stage') {
      // Clicked an existing shape — selection handled by onClick below
      return;
    }
    setSelectedId(null);
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const x = pos.x / scale;
    const y = pos.y / scale;
    if (tool === 'text') {
      const next: Annotation = {
        id: uid(),
        shape: 'text',
        x,
        y,
        text: '',
        color: pickColor(annotations),
      };
      onChange([...annotations, next]);
      setSelectedId(next.id);
      return;
    }
    setDraft({
      id: uid(),
      shape: tool,
      x,
      y,
      width: 0,
      height: 0,
      x2: x,
      y2: y,
      text: '',
      color: pickColor(annotations),
    });
  }

  function onMouseMove(e: KonvaEventObject<MouseEvent>) {
    if (readOnly || !draft) return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const x = pos.x / scale;
    const y = pos.y / scale;
    if (draft.shape === 'rect') {
      setDraft({ ...draft, width: x - draft.x, height: y - draft.y });
    } else if (draft.shape === 'arrow') {
      setDraft({ ...draft, x2: x, y2: y });
    }
  }

  function onMouseUp() {
    if (readOnly || !draft) return;
    // Discard tiny accidental clicks
    if (draft.shape === 'rect') {
      const w = Math.abs(draft.width ?? 0);
      const h = Math.abs(draft.height ?? 0);
      if (w < 6 && h < 6) {
        setDraft(null);
        return;
      }
      // Normalize negative-width drags
      const norm: Annotation = {
        ...draft,
        x: (draft.width ?? 0) < 0 ? draft.x + (draft.width ?? 0) : draft.x,
        y: (draft.height ?? 0) < 0 ? draft.y + (draft.height ?? 0) : draft.y,
        width: Math.abs(draft.width ?? 0),
        height: Math.abs(draft.height ?? 0),
      };
      onChange([...annotations, norm]);
      setSelectedId(norm.id);
    } else if (draft.shape === 'arrow') {
      const dx = (draft.x2 ?? draft.x) - draft.x;
      const dy = (draft.y2 ?? draft.y) - draft.y;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        setDraft(null);
        return;
      }
      onChange([...annotations, draft]);
      setSelectedId(draft.id);
    }
    setDraft(null);
  }

  function updateAnnotation(id: string, patch: Partial<Annotation>) {
    onChange(annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeAnnotation(id: string) {
    onChange(annotations.filter((a) => a.id !== id));
    setSelectedId(null);
  }

  function renderBadge(cx: number, cy: number, color: string, label: string) {
    const r = 12;
    return (
      <>
        <Circle x={cx} y={cy} radius={r} fill={color} stroke="#ffffff" strokeWidth={2} />
        <Text
          x={cx - r}
          y={cy - 7}
          width={r * 2}
          align="center"
          text={label}
          fontSize={12}
          fontStyle="bold"
          fill="#ffffff"
          listening={false}
        />
      </>
    );
  }

  function renderAnnotation(a: Annotation, idx: number) {
    const common = {
      id: `anno-${a.id}`,
      onClick: () => !readOnly && setSelectedId(a.id),
      onTap: () => !readOnly && setSelectedId(a.id),
      draggable: !readOnly,
      onDragEnd: (e: KonvaEventObject<DragEvent>) => {
        const dx = e.target.x();
        const dy = e.target.y();
        if (a.shape === 'arrow') {
          updateAnnotation(a.id, {
            x: a.x + dx / scale,
            y: a.y + dy / scale,
            x2: (a.x2 ?? a.x) + dx / scale,
            y2: (a.y2 ?? a.y) + dy / scale,
          });
        } else {
          updateAnnotation(a.id, {
            x: a.x + dx / scale,
            y: a.y + dy / scale,
          });
        }
        e.target.position({ x: 0, y: 0 });
      },
    };
    const label = String(idx + 1);

    if (a.shape === 'rect') {
      return (
        <Group key={a.id} {...common}>
          <Rect
            x={a.x * scale}
            y={a.y * scale}
            width={(a.width ?? 0) * scale}
            height={(a.height ?? 0) * scale}
            stroke={a.color}
            strokeWidth={3}
            dash={[6, 4]}
            fill={a.color + '22'}
          />
          {renderBadge(a.x * scale, a.y * scale, a.color, label)}
        </Group>
      );
    }
    if (a.shape === 'arrow') {
      return (
        <Group key={a.id} {...common}>
          <Arrow
            points={[
              a.x * scale,
              a.y * scale,
              (a.x2 ?? a.x) * scale,
              (a.y2 ?? a.y) * scale,
            ]}
            stroke={a.color}
            fill={a.color}
            strokeWidth={3}
            pointerLength={12}
            pointerWidth={12}
          />
          {renderBadge(a.x * scale, a.y * scale, a.color, label)}
        </Group>
      );
    }
    // point marker — only the numbered badge, no text on canvas
    return (
      <Group key={a.id} {...common}>
        {renderBadge(a.x * scale, a.y * scale, a.color, label)}
      </Group>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
          <span className="font-medium">Tool:</span>
          {(['rect', 'arrow', 'text'] as AnnotationShape[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              className={`rounded px-2 py-1 text-xs capitalize ${
                tool === t ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
              }`}
            >
              {t === 'text' ? 'point' : t}
            </button>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">
            Mark the image with numbered shapes — write the description for each one in the list below.
          </span>
        </div>
      ) : null}

      <div className="overflow-auto rounded-md border bg-muted/20" style={{ maxWidth }}>
        {image ? (
          <Stage
            ref={stageRef}
            width={stageWidth}
            height={stageHeight}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onTouchStart={onMouseDown as unknown as (e: KonvaEventObject<TouchEvent>) => void}
            onTouchMove={onMouseMove as unknown as (e: KonvaEventObject<TouchEvent>) => void}
            onTouchEnd={onMouseUp}
          >
            <Layer>
              <KImage image={image} width={stageWidth} height={stageHeight} listening={false} />
              {annotations.map((a, idx) => renderAnnotation(a, idx))}
              {draft ? renderAnnotation(draft, annotations.length) : null}
              {!readOnly ? <Transformer ref={transformerRef} rotateEnabled={false} /> : null}
            </Layer>
          </Stage>
        ) : (
          <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {loadError ? (
              <span className="text-destructive">Image failed to load: {loadError}</span>
            ) : (
              <>Loading image…</>
            )}
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <div className="border-b px-3 py-2 text-sm font-medium">
          Annotations ({annotations.length})
        </div>
        {annotations.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            {readOnly
              ? 'No annotations on this image.'
              : 'Draw a rectangle, arrow, or point on the image. Each numbered marker pairs with its description below.'}
          </p>
        ) : (
          <ul className="divide-y">
            {annotations.map((a, idx) => (
              <li
                key={a.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm ${
                  selectedId === a.id ? 'bg-muted/50' : ''
                }`}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: a.color }}
                >
                  {idx + 1}
                </span>
                <span className="w-12 shrink-0 text-xs uppercase text-muted-foreground">
                  {a.shape === 'text' ? 'point' : a.shape}
                </span>
                {readOnly ? (
                  <span className="flex-1 whitespace-pre-wrap break-words text-sm">
                    {a.text || <span className="text-muted-foreground">(no description)</span>}
                  </span>
                ) : (
                  <>
                    <input
                      value={a.text}
                      placeholder="Describe this region…"
                      onChange={(e) => updateAnnotation(a.id, { text: e.target.value })}
                      onFocus={() => setSelectedId(a.id)}
                      className="flex-1 rounded border bg-background px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeAnnotation(a.id)}
                      className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
