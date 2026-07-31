import type { ReactNode } from "react";
import Link from "next/link";
import { EditorialHeader } from "./EditorialHeader";

interface PolicyPageProps {
  eyebrow: string;
  title: string;
  summary: string;
  effectiveDate?: string;
  children: ReactNode;
}

export function PolicyPage({
  eyebrow,
  title,
  summary,
  effectiveDate = "Effective July 30, 2026",
  children,
}: PolicyPageProps) {
  return (
    <main className="editorial-page policy-page">
      <EditorialHeader note="Research preview · policy" />

      <article className="policy-article">
        <header className="policy-hero">
          <p className="editorial-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <div className="policy-deck">
            <p>{summary}</p>
            <span>{effectiveDate}</span>
          </div>
        </header>

        <div className="policy-body">{children}</div>

        <footer className="policy-footer">
          <p>Humano limited research preview</p>
          <nav aria-label="Policy pages">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/research-preview">Preview policy</Link>
            <Link href="/">Return home</Link>
          </nav>
        </footer>
      </article>
    </main>
  );
}
