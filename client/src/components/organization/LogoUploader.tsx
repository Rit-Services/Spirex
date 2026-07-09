// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useRef, useState, type DragEvent } from 'react';
import { Camera, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { API_BASE } from '@/config/urls';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LogoUploaderProps {
  /** Org name — its initial is the fallback when there's no logo. */
  name: string;
  logoUrl: string | null;
  uploading?: boolean;
  onFile: (file: File) => void;
  /** Tailwind size classes for the square tile. Defaults to h-24 w-24. */
  size?: string;
  className?: string;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * The org logo as an interactive tile. Shared by the tenant (admin) and
 * superadmin org pages so both read identically.
 *
 * Two ALWAYS-VISIBLE intents (no hover-only controls — those are dead on touch
 * devices and easy to miss on the banner-floating tile):
 *   • the tile itself → opens a contained preview popup (Dialog box, NOT a
 *     full-screen cover) when a logo exists, or the file picker when it doesn't.
 *   • a persistent camera badge on the corner → always opens the file picker,
 *     so changing the logo is one click/tap from any device.
 * Drag-and-drop still works in every state.
 */
export function LogoUploader({
  name,
  logoUrl,
  uploading = false,
  onFile,
  size = 'h-24 w-24',
  className,
}: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState(false);

  const hasLogo = !!logoUrl;
  const openPicker = () => inputRef.current?.click();

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) onFile(f);
  };

  return (
    <>
      <div className="relative shrink-0">
        {/* The tile: view (has logo) or add (no logo). A real button so it's
            keyboard- and touch-accessible without any hover dependency. */}
        <button
          type="button"
          onClick={() => (hasLogo ? setViewing(true) : openPicker())}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          aria-label={hasLogo ? 'View logo' : 'Add logo'}
          className={cn(
            'group relative grid place-items-center overflow-hidden rounded-2xl border bg-card shadow-elevated outline-none transition-all duration-200',
            'hover:shadow-glow focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            dragging && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
            size,
            className,
          )}
        >
          {logoUrl ? (
            <img src={`${API_BASE}${logoUrl}`} alt="" className="h-full w-full object-contain p-2.5" />
          ) : (
            <span className="bg-gradient-to-br from-primary to-primary/55 bg-clip-text text-3xl font-bold text-transparent">
              {name.charAt(0).toUpperCase()}
            </span>
          )}

          {/* Transient overlay — only for the uploading spinner and the drop
              hint. The change action lives in the always-visible badge below. */}
          {uploading || dragging ? (
            <div className="absolute inset-0 grid place-items-center bg-background/75 backdrop-blur-[2px]">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-[11px] font-medium text-primary">
                  <ImagePlus className="h-5 w-5" />
                  Drop image
                </span>
              )}
            </div>
          ) : null}
        </button>

        {/* Persistent "change" badge — always visible, so replacing the logo is
            never hidden behind hover. Sits on the tile's bottom-right corner. */}
        <button
          type="button"
          onClick={openPicker}
          disabled={uploading}
          aria-label={hasLogo ? 'Change logo' : 'Add logo'}
          title={hasLogo ? 'Change logo' : 'Add logo'}
          className={cn(
            'absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full border bg-card text-foreground shadow-md outline-none ring-1 ring-border transition-colors',
            'hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      {/* Preview popup — a contained Dialog box, not a full-screen cover. */}
      <Dialog open={viewing && hasLogo} onOpenChange={setViewing}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate">{name} logo</DialogTitle>
            <DialogDescription>PNG, JPEG, WebP or GIF, up to 2 MB.</DialogDescription>
          </DialogHeader>
          <div className="grid place-items-center rounded-xl border bg-muted/30 p-6">
            <img
              src={`${API_BASE}${logoUrl}`}
              alt={`${name} logo`}
              className="max-h-64 max-w-full object-contain"
            />
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setViewing(false);
                openPicker();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Replace
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
