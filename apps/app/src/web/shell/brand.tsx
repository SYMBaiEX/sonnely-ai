/* eslint-disable better-tailwindcss/no-unknown-classes -- shared brand uses the migrated shell class contract */
export function Brand({ href = "/", onClick }: { href?: string; onClick?: () => void }) {
  return (
    <a href={href} className="brand" aria-label="Sonnely" onClick={onClick}>
      <span className="brand-icon" aria-hidden="true" />
      <span className="brand-wordmark" aria-hidden="true" />
    </a>
  );
}
