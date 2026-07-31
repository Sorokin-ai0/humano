import Link from "next/link";

interface EditorialHeaderProps {
  note: string;
}

export function EditorialHeader({ note }: EditorialHeaderProps) {
  return (
    <header className="editorial-nav">
      <Link className="editorial-wordmark" href="/" aria-label="Humano homepage">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        <span>
          <strong>Humano</strong>
          <small>{note}</small>
        </span>
      </Link>
      <nav aria-label="Humano journal">
        <Link href="/meet-humano-1">Meet Humano-1</Link>
        <Link href="/inside-humano">Inside the system</Link>
        <Link className="editorial-enter" href="/">
          Enter Humano
        </Link>
      </nav>
    </header>
  );
}
