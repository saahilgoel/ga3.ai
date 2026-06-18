import type { Metadata } from "next";
import { LegalShell, Section } from "@/components/landing/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service — GA3",
  description: "The terms for using GA3.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="17 June 2026">
      <Section heading="Acceptance">
        <p>
          By connecting your Google Analytics account to GA3 or otherwise using ga3.ai (the
          &ldquo;Service&rdquo;), you agree to these terms. If you don&rsquo;t agree, please
          don&rsquo;t use the Service.
        </p>
      </Section>

      <Section heading="What GA3 does">
        <p>
          GA3 provides a conversational and dashboard interface over your own Google
          Analytics data. We request{" "}
          <strong className="text-[color:var(--text-primary)]">read-only</strong> access and
          never modify your analytics. GA3 is an independent product and is not affiliated
          with, endorsed by, or sponsored by Google LLC.
        </p>
      </Section>

      <Section heading="Early access">
        <p>
          The Service is offered in early access. Features may change, break, or disappear,
          and it is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis
          without warranties of any kind. Analytics insights are provided for convenience and
          should not be treated as the sole basis for material business decisions.
        </p>
      </Section>

      <Section heading="Your responsibilities">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Only connect Google Analytics accounts you are authorised to access.</li>
          <li>Keep your sign-in credentials secure.</li>
          <li>
            Don&rsquo;t misuse the Service — no attempts to break, overload, reverse-engineer,
            or access data that isn&rsquo;t yours.
          </li>
        </ul>
      </Section>

      <Section heading="Your data">
        <p>
          You retain all rights to your Google Analytics data. You grant GA3 permission to
          access and process it solely to provide the Service to you, as described in our{" "}
          <a className="underline" href="/privacy">Privacy Policy</a>. You can revoke access
          at any time from your Google Account permissions.
        </p>
      </Section>

      <Section heading="Intellectual property">
        <p>
          The Service, including its software, design and branding, belongs to GA3. These
          terms don&rsquo;t grant you any right to our trademarks or to copy the Service.
        </p>
      </Section>

      <Section heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, GA3 is not liable for any indirect,
          incidental, or consequential damages, or for any loss of profits, data, or business
          arising from your use of the Service. Our total liability for any claim is limited
          to the amount you paid us for the Service in the prior twelve months (which, during
          free early access, may be zero).
        </p>
      </Section>

      <Section heading="Termination">
        <p>
          You may stop using the Service and revoke access at any time. We may suspend or end
          access if these terms are breached or if we discontinue the Service.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by the laws of India, and the courts of New Delhi will
          have exclusive jurisdiction over any dispute.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We may update these terms; we&rsquo;ll revise the date above when we do. Continued
          use after a change means you accept the updated terms.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms:{" "}
          <a className="underline" href="mailto:hello@ga3.ai">hello@ga3.ai</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
