"use client";

import * as React from "react";
import { observeOnce } from "./observe";

type TextRevealProps = Omit<React.HTMLAttributes<HTMLHeadingElement>, "children"> & {
  /** The heading text. Plain text only: it is split into words. */
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** rise: words slide up out of a mask (default). blur: also unblurs, used only for 6 words or fewer. */
  variant?: "rise" | "blur";
};

const ref = (el: HTMLElement | null) => (el ? observeOnce(el) : undefined);

/**
 * Masked word reveal for a page's one signature headline. The words stay real text in one element, so the
 * accessible name and textContent are exactly `text` (getByRole("heading", { name }) keeps working).
 * Static under reduced motion and without JavaScript.
 */
function TextReveal({ text, as = "h1", variant = "rise", ...props }: TextRevealProps) {
  const Tag = as as "h1";
  const words = text.split(/\s+/).filter(Boolean);
  const mode = variant === "blur" && words.length <= 6 ? "blur" : "rise";
  return (
    <Tag ref={ref} data-text-reveal={mode} {...props}>
      {words.map((word, i) => (
        <React.Fragment key={i}>
          {i > 0 ? " " : null}
          <span className="tr-word">
            <span className="tr-inner" style={{ "--w": i } as React.CSSProperties}>
              {word}
            </span>
          </span>
        </React.Fragment>
      ))}
    </Tag>
  );
}

export { TextReveal, type TextRevealProps };
