import styles from "./landing.module.css";

/**
 * Lines of text, each in a mask so it can slide up when its chapter enters. The reveal itself is
 * a CSS transition toggled by the scroll layer (`.in` on the block). With `still`, the lines are
 * just there: poster mode and reduced motion.
 */
export function Lines({
  lines,
  offset = 0,
  still = false,
}: {
  lines: string[];
  /** Stagger index the first line starts at, so a body can follow a headline. */
  offset?: number;
  still?: boolean;
}) {
  return lines.map((line, i) => (
    <span key={i} className={styles.mask}>
      <span
        className={styles.line}
        style={still ? { transform: "none" } : ({ "--i": i + offset } as React.CSSProperties)}
      >
        {line}
      </span>
    </span>
  ));
}
