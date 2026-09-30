"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { OVERLAY_LABELS } from "../overlay-labels";
import { stage } from "../scroll-store";

/**
 * Pins the page's overlay labels to their scene points: projects each world position through
 * the camera every frame and writes the screen position and opacity straight to the DOM.
 */
export function Projector() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const els = React.useRef<(HTMLElement | null)[]>([]);
  const v = React.useMemo(() => new Vector3(), []);

  React.useEffect(() => {
    els.current = OVERLAY_LABELS.map((l) => document.querySelector<HTMLElement>(`[data-label="${l.id}"]`));
  }, []);

  useFrame(() => {
    const p = stage.p;
    OVERLAY_LABELS.forEach((l, i) => {
      const el = els.current[i];
      if (!el) return;
      const o = l.opacity(p);
      if (o < 0.01) {
        if (el.style.opacity !== "0") el.style.opacity = "0";
        return;
      }
      v.set(l.at[0], l.at[1], l.at[2]).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = (v.z < 1 ? o : 0).toFixed(3);
    });
  });

  return null;
}
