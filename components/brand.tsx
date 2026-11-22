import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="Sonnely">
      <span className="brand-icon" aria-hidden="true">
        <img src="/brand/sonnely-crimson-192.png" width={34} height={34} alt="" />
      </span>
      <span className="brand-wordmark" aria-hidden="true" />
    </Link>
  );
}
