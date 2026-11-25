// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, Inbox } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Input, Textarea } from "@repo/ui";
import { SiteLead } from "./chrome.tsx";
import { entryActions, pages, supportTopics } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import { PlatformLinks } from "./products.tsx";
import { buttonAccent, caption, panel, selectClass, textLink, wrap } from "./ui.ts";

const supportEmail = "sonnely@symbaiex.com";

function ContactForm() {
  const [topic, setTopic] = useState("Workspace support");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string, fallback: string) => {
      const value = form.get(name);
      return typeof value === "string" && value ? value : fallback;
    };
    const subject = field("topic", topic);
    const message = field("message", "");
    const email = field("email", "");
    location.href =
      "mailto:" +
      supportEmail +
      "?subject=" +
      encodeURIComponent("[Sonnely] " + subject) +
      "&body=" +
      encodeURIComponent(message + "\n\nFrom: " + email);
  }

  return (
    <div className="grid items-start gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" id="support-form">
      <aside className={panel + " grid gap-5"}>
        <h2 className="text-lg font-medium">Choose a support topic</h2>
        <div className="grid gap-2" role="group" aria-label="Choose a support topic">
          {supportTopics.map(([icon, label, description]) => (
            <button
              type="button"
              key={label}
              aria-pressed={topic === label}
              onClick={() => setTopic(label)}
              className={
                "flex items-center gap-3 rounded-sm border px-3.5 py-3 text-start transition-colors duration-base " +
                (topic === label
                  ? "border-ring bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              <ProductIcon name={icon} size={21} />
              <span>
                <strong className="block text-sm font-medium text-foreground">{label}</strong>
                <span className="text-xs">{description}</span>
              </span>
              <ArrowUpRight size={15} aria-hidden="true" className="ms-auto" />
            </button>
          ))}
        </div>
        <div className="grid gap-2.5 border-t border-border pt-5">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
            Before you submit
          </h3>
          <p className="text-sm text-muted-foreground">
            For API issues, include the status code, model ID and approximate time. For billing,
            include the payment reference or public transaction signature. Keep API keys, wallet
            recovery phrases and private prompt text out of the request.
          </p>
          <a className={textLink} href="/docs/troubleshooting">
            API troubleshooting <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a className={textLink} href="/console/billing">
            Billing history <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a className={textLink} href={"mailto:" + supportEmail}>
            Email support without signing in <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a className={textLink} href="https://x.com/sonnelyai">
            Sonnely on X <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      </aside>
      <form
        className={panel + " grid gap-4"}
        onSubmit={submit}
        aria-labelledby="support-request"
      >
        <div>
          <Inbox size={20} aria-hidden="true" />
          <h2 id="support-request" className="mt-2 text-lg font-medium">
            Send a support request
          </h2>
          <p className={caption + " mt-1.5"}>
            Signed-in workspaces can file a ticket from Support in the console. This form opens a
            support email with your topic and message.
          </p>
        </div>
        <label className="grid gap-1.5 text-sm">
          Email
          <Input
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Topic
          <select
            name="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className={selectClass}
          >
            <option>Workspace support</option>
            <option>Infrastructure partnership</option>
            <option>Billing</option>
            <option>Product feedback</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Message
          <Textarea name="message" rows={6} maxLength={3000} required placeholder="How can we help?" />
        </label>
        <button type="submit" className={buttonAccent + " w-fit"}>
          Submit request
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

export function ContactPage() {
  const [title, description] = pages.contact;
  const entry = entryActions.contact;
  return (
    <div className={wrap + " pt-6"}>
      <SiteLead
        title={title}
        description={description}
        brief={{
          title: "Contact Sonnely",
          rows: [
            ["Workspace", "Access and API support"],
            ["Billing", "Payments and usage charges"],
            ["Partners", "Infrastructure partnerships"],
          ],
        }}
      >
        <div className="mt-5.5 flex items-center gap-4">
          <a href={entry.section} className={buttonAccent}>
            {entry.label} <ArrowDown size={15} aria-hidden="true" />
          </a>
          <a href={entry.next} className={textLink}>
            {entry.action} <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </SiteLead>
      <ContactForm />
      <PlatformLinks compact />
    </div>
  );
}
