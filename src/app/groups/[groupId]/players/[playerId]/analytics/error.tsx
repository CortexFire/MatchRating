"use client";

import { MobileShell } from "@/components/app/mobile-shell";
import styles from "./error.module.css";

export default function AnalyticsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <MobileShell active="Groups">
      <section className={styles.card} role="alert">
        <h1>Analytics couldn’t load</h1>
        <p>Something unexpected happened. Your ratings and matches are safe.</p>
        <button type="button" onClick={reset}>Try again</button>
      </section>
    </MobileShell>
  );
}
