import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Sonnely">
      <span className="brand-icon" aria-hidden="true">
        <img src="/brand/sonnely-mark.svg" width={25} height={25} alt="" />
      </span>
      <span className="brand-wordmark" aria-hidden="true" />
    </Link>
  );
}
