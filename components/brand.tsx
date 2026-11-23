import Link from "next/link";

export function BrandMark() {
  return <span className="brand-icon" aria-hidden="true" />;
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="Sonnely">
      <BrandMark />
      <span className="brand-wordmark" aria-hidden="true" />
    </Link>
  );
}
