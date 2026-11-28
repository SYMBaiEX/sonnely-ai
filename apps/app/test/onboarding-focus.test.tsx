// @vitest-environment happy-dom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
import { afterEach, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Onboarding } from "../src/web/areas/console/onboarding.tsx";
import { NavigationContext } from "../src/web/shell/navigation.tsx";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  document.body.innerHTML = "";
});

function mount(el: HTMLDivElement, root: ReturnType<typeof createRoot>) {
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
}

function renderOnboarding() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(
      <NavigationContext value={() => {}}>
        <Onboarding
          wallet="So11111111111111111111111111111111111111112"
          settings={undefined}
          cluster="mainnet"
          canFund={false}
          onSignIn={() => Promise.resolve(true)}
          onSignOut={() => Promise.resolve(true)}
          onSaveProfile={() => Promise.resolve(true)}
          onAcceptTerms={() => Promise.resolve(true)}
          onFinish={() => Promise.resolve(true)}
          onChooseTheme={() => Promise.resolve(true)}
          close={() => {}}
        />
      </NavigationContext>,
    );
  });
  mount(el, root);
  return el;
}

function type(input: HTMLInputElement, value: string) {
  const prototype = window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// spec/app/console/index.md, "Story: Set up the workspace profile"
it("keeps the profile input focused while typing", () => {
  const el = renderOnboarding();
  const input = document.body.querySelector<HTMLInputElement>("form[data-onboarding-form] input");
  if (!input) throw new Error("profile input did not render");
  input.focus();
  expect(document.activeElement).toBe(input);
  act(() => type(input, "A"));
  expect(input.value).toBe("A");
  expect(document.activeElement).toBe(input);
});

// spec/app/console/index.md, "Story: Set up the workspace profile"
it("moves focus to the step heading when the step changes", async () => {
  const el = renderOnboarding();
  const form = document.body.querySelector("form[data-onboarding-form]");
  if (!form) throw new Error("profile form did not render");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  expect(document.activeElement).toBe(document.body.querySelector("[data-onboarding-step] h2"));
});

function renderOnboardingWithFinish(onFinish: () => Promise<boolean>, close: () => void, openPath: (path: string) => void = () => {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(
      <NavigationContext value={openPath}>
        <Onboarding
          wallet="So11111111111111111111111111111111111111112"
          settings={undefined}
          cluster="mainnet"
          canFund
          onSignIn={() => Promise.resolve(true)}
          onSignOut={() => Promise.resolve(true)}
          onSaveProfile={() => Promise.resolve(true)}
          onAcceptTerms={() => Promise.resolve(true)}
          onFinish={onFinish}
          onChooseTheme={() => Promise.resolve(true)}
          close={close}
        />
      </NavigationContext>,
    );
  });
  mount(el, root);
  return el;
}

// spec/app/console/index.md, "Story: Set up the workspace profile": a failed finish keeps the
// setup open so the choice is not lost — closing early would drop the workspace back into the
// pending onboarding state with no way to see why.
it("stays open and surfaces the failure when finishing the setup fails", async () => {
  let closed = false;
  let opened = "";
  const el = renderOnboardingWithFinish(
    () => Promise.resolve(false),
    () => { closed = true; },
    (path) => { opened = path; },
  );
  const form = document.body.querySelector("form[data-onboarding-form]");
  if (!form) throw new Error("profile form did not render");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const addCredits = [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("Add credits"));
  if (!addCredits) throw new Error("funding step did not render");
  await act(async () => {
    addCredits.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect({ closed, opened, errorShown: document.body.querySelector("[role=alert]")?.textContent ?? "" }).toEqual({
    closed: false,
    opened: "",
    errorShown: "Could not save your setup choice. Check your connection and try again.",
  });
});

it('opens the funding destination through the navigator when setup finishes (spec/app/console/index.md, "Story: Set up the workspace profile"; spec/app/nav.md, "Story: Move around")', async () => {
  const events: string[] = [];
  const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  try {
    renderOnboardingWithFinish(
      async () => {
        await Promise.resolve();
        events.push("finished");
        return true;
      },
      () => {},
      (path) => { events.push(path); },
    );
    const form = document.body.querySelector("form[data-onboarding-form]");
    if (!form) throw new Error("profile form did not render");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    const addCredits = [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("Add credits"));
    if (!addCredits) throw new Error("funding step did not render");
    await act(async () => {
      addCredits.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect([events, assign.mock.calls.length]).toEqual([["finished", "/console/billing#buy-credits"], 0]);
  } finally {
    assign.mockRestore();
  }
});
