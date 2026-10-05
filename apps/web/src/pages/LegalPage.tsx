import type { ReactNode } from 'react';

type LegalPageProps = {
  title: string;
  intro: string;
  children: ReactNode;
};

export function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <main className="shell">
      <header className="topbar"><a className="brand-link" href="/">DropLink</a><a className="back-link" href="/">Back to DropLink</a></header>
      <article className="legal-panel">
        <p className="eyebrow">DropLink</p>
        <h1>{title}</h1>
        <p className="legal-intro">{intro}</p>
        {children}
        <p className="legal-contact">Questions: YOUR_EMAIL@example.com</p>
      </article>
    </main>
  );
}

export function TermsPage() {
  return <LegalPage title="Terms of Service" intro="Simple rules for using DropLink, a temporary device-to-device sharing service.">
    <LegalSection title="The service"><p>DropLink provides temporary peer-to-peer communication and file transfer between devices. No account is required. Rooms and sessions are temporary and may expire or be interrupted.</p></LegalSection>
    <LegalSection title="Your responsibility"><p>You are responsible for the content you send and for the people with whom you share a room. Do not use DropLink for illegal activity, unauthorized access, attacks, abuse, disruption, or attempts to compromise another user's room or session.</p></LegalSection>
    <LegalSection title="Availability and changes"><p>DropLink is provided as a small service without a guarantee of availability, continuity, or error-free operation. The service may be modified, suspended, or discontinued. These terms may be updated as the service changes.</p></LegalSection>
    <LegalSection title="Liability"><p>To the extent permitted by applicable law, DropLink is provided without warranties and liability is limited for a free service. You should keep independent copies of anything important and use reasonable care when sharing files.</p></LegalSection>
  </LegalPage>;
}

export function AcceptableUsePage() {
  return <LegalPage title="Acceptable Use Policy" intro="DropLink must not be used to harm people, systems, or the service.">
    <LegalSection title="Prohibited use"><p>You must not use DropLink for illegal content or activities, malware, viruses, ransomware, malicious software, stolen credentials or personal data, unauthorized access, phishing, scams, copyright infringement, harassment, threats, or abuse.</p><p>You must not attack, overload, probe, disrupt, or attempt to bypass controls protecting DropLink or another user's systems. Do not distribute harmful or malicious content.</p></LegalSection>
    <LegalSection title="Abuse response"><p>DropLink may take reasonable action against abuse and security threats, including limiting access, invalidating rooms, preserving necessary technical records, or cooperating with lawful requests. No monitoring promise is made beyond what is needed to operate and protect the service.</p></LegalSection>
  </LegalPage>;
}

export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" intro="This page describes the information used by the current DropLink implementation.">
    <LegalSection title="What is not required"><p>DropLink does not require an account, name, email address, or phone number. Files and messages are intended to travel over WebRTC directly between peers where possible and are not intentionally stored permanently by DropLink.</p></LegalSection>
    <LegalSection title="Temporary service data"><p>Temporary room and participant session information, including random room and session identifiers, may be stored to coordinate room membership, reconnection, expiration, and WebRTC signaling. Redis-backed room data is temporary and does not contain file contents or chat history.</p><p>WebRTC traffic may pass through a configured relay when direct connectivity is unavailable. The browser stores a random visitor ID and temporary room session data so refresh recovery and anonymous visitor counting can work.</p></LegalSection>
    <LegalSection title="Analytics and infrastructure"><p>Anonymous analytics use a random visitor ID to maintain an aggregated visitor count. They are not intended to contain names, contact details, message contents, or file contents. Normal hosting, network, security, and infrastructure providers may process technical information such as request and connection logs needed to operate the service.</p></LegalSection>
    <LegalSection title="Retention and choices"><p>Room and participant data expires or is removed as sessions end and configured TTLs pass. Browser session data can be cleared from the browser at any time. Avoid sending highly sensitive information when you do not trust the recipient or the surrounding infrastructure.</p></LegalSection>
  </LegalPage>;
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="legal-section"><h2>{title}</h2>{children}</section>;
}
