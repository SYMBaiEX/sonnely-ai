// @vitest-environment happy-dom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
import { expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Onboarding } from "../src/web/areas/console/onboarding.tsx";

function renderOnboarding() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(
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
      />,
    );
  });
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
  const input = el.querySelector<HTMLInputElement>("form.onboarding-form input");
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
  const form = el.querySelector("form.onboarding-form");
  if (!form) throw new Error("profile form did not render");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  expect(document.activeElement).toBe(el.querySelector("#onboarding-title"));
});
