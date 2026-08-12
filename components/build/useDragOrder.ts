"use client";

import { useState } from "react";

/**
 * Drag-to-reorder, built on the HTML drag-and-drop API.
 *
 * ── IT IS AN ADDITION, NOT A REPLACEMENT ─────────────────────────────────
 * The editor already reorders activities with ↑/↓ buttons. Those are not a
 * primitive version of this to be swept away — they are the accessible one.
 * Native drag and drop is unusable from a keyboard and largely unsupported by
 * screen readers, so a redesign that "upgrades" buttons to dragging quietly
 * removes the ability to reorder a lesson from anyone who does not use a
 * mouse. Both ship: drag if you have a pointer, buttons if you do not, and the
 * buttons stay visible rather than hiding behind a hover state.
 *
 * ── WHY THE NATIVE API AND NOT A LIBRARY ─────────────────────────────────
 * The project has six runtime dependencies and no UI packages. A drag-and-drop
 * library is 10–30kB to reorder one list of at most a dozen rows. The native
 * API is fiddly in exactly two places, both handled here: `dragover` must have
 * its default prevented or no drop event ever fires, and the drag image needs
 * a grab handle or every text input inside the row becomes undraggable.
 */
export interface DragOrder {
  /** Index currently being dragged, for styling the source row. */
  dragging: number | null;
  /** Index the pointer is currently over, for the drop indicator. */
  over: number | null;
  /** Spread onto each row's container. */
  rowProps: (i: number) => {
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    "data-dragging": boolean;
    "data-drop-target": boolean;
  };
  /** Spread onto the grab handle inside the row. */
  handleProps: (i: number) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
  };
}

export function useDragOrder<T>(
  items: T[],
  onReorder: (next: T[]) => void
): DragOrder {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (from === to) return;
    const next = items.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onReorder(next);
  }

  return {
    dragging,
    over,
    rowProps: (i) => ({
      /* Without preventDefault here the browser treats the row as an invalid
         drop target and `onDrop` is never called. It is the single most common
         reason hand-rolled drag and drop silently does nothing. */
      onDragOver: (e) => {
        e.preventDefault();
        if (dragging !== null && over !== i) setOver(i);
      },
      onDrop: (e) => {
        e.preventDefault();
        if (dragging !== null) move(dragging, i);
        setDragging(null);
        setOver(null);
      },
      onDragEnd: () => {
        setDragging(null);
        setOver(null);
      },
      "data-dragging": dragging === i,
      "data-drop-target": over === i && dragging !== null && dragging !== i,
    }),
    handleProps: (i) => ({
      draggable: true,
      onDragStart: (e) => {
        setDragging(i);
        e.dataTransfer.effectAllowed = "move";
        /* Firefox refuses to start a drag unless some data is set. */
        e.dataTransfer.setData("text/plain", String(i));
      },
    }),
  };
}
