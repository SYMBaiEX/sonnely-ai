// spec/app/site/index.md, "Story: Check the service status"

function observeScene(element: HTMLDivElement) {
  if (!element.parentElement) return;
  const parent = element.parentElement;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let frame: number | null = null;
  function paint() {
    frame = null;
    if (media.matches) {
      element.style.removeProperty("--scene-offset");
      return;
    }
    const bounds = parent.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= innerHeight) return;
    const distance = Math.min(bounds.height, Math.max(0, -bounds.top));
    element.style.setProperty("--scene-offset", `${distance}px`);
  }
  function update() {
    if (frame === null) frame = requestAnimationFrame(paint);
  }
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update, { passive: true });
  media.addEventListener("change", update);
  update();
  return () => {
    removeEventListener("scroll", update);
    removeEventListener("resize", update);
    media.removeEventListener("change", update);
    if (frame !== null) cancelAnimationFrame(frame);
  };
}

export function Scene({ variant = "banner" }: { variant?: "hero" | "banner" | "feature" }) {
  return (
    <div ref={observeScene} className={"scene scene-" + variant} aria-hidden="true">
      <div className="scene-image" />
      <div className="scene-mist" />
      {variant === "hero" && (
        <div className="scene-embers">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <i key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
