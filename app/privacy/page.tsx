import type { Metadata } from "next";
import { LegalShell, Section } from "@/components/landing/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — GA3",
  description: "How GA3 handles your Google Analytics data. Read-only, never sold.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="17 June 2026">
      <Section heading="The short version">
        <p>
          GA3 helps you read and ask questions about your own Google Analytics data. We
          request <strong className="text-[color:var(--text-primary)]">read-only</strong>{" "}
          access, we never modify your analytics, we never sell your data, and we never use
          it to train any AI model. That&rsquo;s the whole spirit of this page; the rest is
          detail.
        </p>
      </Section>

      <Section heading="Who we are">
        <p>
          GA3 (&ldquo;GA3&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an independent
          analytics tool available at ga3.ai. We are not affiliated with, endorsed by, or
          sponsored by Google LLC. For any privacy question, email{" "}
          <a className="underline" href="mailto:privacy@ga3.ai">
            privacy@ga3.ai
          </a>
          .
        </p>
      </Section>

      <Section heading="What we access">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-[color:var(--text-primary)]">Your Google account
            basics</strong> — name and email address, used only to sign you in and identify
            your workspace.
          </li>
          <li>
            <strong className="text-[color:var(--text-primary)]">Your Google Analytics
            data (read-only)</strong> — reports, metrics and dimensions for the GA4
            properties you choose to connect, via the{" "}
            <code>analytics.readonly</code> scope. We cannot create, edit or delete anything
            in your Analytics account.
          </li>
          <li>
            <strong className="text-[color:var(--text-primary)]">Publicly available
            context</strong> — to make insights specific to your business, GA3 reads
            publicly accessible pages of your website, your competitors and your industry
            (the kind of pages anyone can open in a browser). We do not access private or
            authenticated pages.
          </li>
        </ul>
      </Section>

      <Section heading="Google API Services — Limited Use disclosure">
        <p>
          GA3&rsquo;s use and transfer of information received from Google APIs adheres to
          the{" "}
          <a
            className="underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. Specifically, data obtained from Google
          Analytics is used only to provide and improve the in-product features you
          requested; it is not transferred to others except as needed to provide those
          features, to comply with applicable law, or as part of a merger or acquisition; it
          is not used for advertising; and it is not used to train, and is not read by
          humans except where you give explicit consent, for security, or to comply with
          law.
        </p>
      </Section>

      <Section heading="How we use your data">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To display your analytics dashboards and real-time view.</li>
          <li>To answer the questions you ask, in natural language.</li>
          <li>To generate your daily briefings and proactive alerts.</li>
          <li>To build the business context that makes those insights specific to you.</li>
        </ul>
        <p>
          We do not use your Google Analytics data for advertising, and we do not sell it to
          anyone, ever.
        </p>
      </Section>

      <Section heading="AI processing">
        <p>
          To turn your questions into answers, relevant portions of your analytics data and
          business context are sent to our AI provider (Anthropic) and our embeddings
          provider (Voyage AI) at the moment you ask. These providers process the data to
          return a response and, per their terms, do not use it to train their models. You
          can read more at{" "}
          <a className="underline" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">
            Anthropic
          </a>{" "}
          and Voyage AI.
        </p>
      </Section>

      <Section heading="Sub-processors">
        <p>We rely on a small set of vetted providers to run GA3:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-[color:var(--text-primary)]">Google</strong> — sign-in and Analytics data source.</li>
          <li><strong className="text-[color:var(--text-primary)]">Anthropic</strong> — language model that powers answers and briefings.</li>
          <li><strong className="text-[color:var(--text-primary)]">Voyage AI</strong> — text embeddings used for search and context.</li>
          <li><strong className="text-[color:var(--text-primary)]">ScrapingDog</strong> — fetches publicly available web pages for business context.</li>
          <li><strong className="text-[color:var(--text-primary)]">Railway</strong> — application hosting and storage.</li>
        </ul>
      </Section>

      <Section heading="What we store, and for how long">
        <p>
          We store your account basics, the properties you connect, your conversation
          history, and the business context we build for you, so the product works between
          visits. Your raw Google Analytics reports are fetched on demand to answer your
          questions and are not warehoused long-term. You can delete your workspace and all
          associated data at any time by emailing{" "}
          <a className="underline" href="mailto:privacy@ga3.ai">privacy@ga3.ai</a>; we action
          deletion requests within 30 days.
        </p>
      </Section>

      <Section heading="Revoking access">
        <p>
          You are in control. You can revoke GA3&rsquo;s access to your Google account at any
          time from{" "}
          <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            your Google Account permissions
          </a>
          . Revoking access immediately stops GA3 from reading any further data.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Access tokens and your data are transmitted over encrypted connections and stored
          on access-controlled infrastructure. No system is perfectly secure, but we keep the
          attack surface small: read-only scopes, minimal retention, and no resale.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          If we make material changes, we&rsquo;ll update the date at the top and, where
          appropriate, notify you in-product. Continued use after a change means you accept
          the updated policy.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions, concerns, or deletion requests:{" "}
          <a className="underline" href="mailto:privacy@ga3.ai">privacy@ga3.ai</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
