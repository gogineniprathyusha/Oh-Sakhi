import { LegalLinks } from "../components/LegalLinks.tsx";
import { Brand } from "../components/Brand.tsx";
import { useEffect } from "react";
import { informationPages, type InformationPage } from "../lib/information.ts";
export function Information({ page }: { page: InformationPage }) {
  useEffect(() => {
    document.title = `${informationPages[page]} | Her Hobby Hour — Oh Sakhi!`;
  }, [page]);
  return (
    <div className="information-shell">
      <a className="skip-link" href="#information">
        Skip to content
      </a>
      <header className="information-header">
        <a className="brand" href="/">
          <Brand />
        </a>
        <a className="link-btn" href="/">
          ← Back to community
        </a>
      </header>
      <main
        id="information"
        className="content information-content"
        tabIndex={-1}
      >
        <span className="eyebrow">HER HOBBY HOUR — OH SAKHI! · RICHMOND</span>
        <h1 className="page-title">{informationPages[page]}</h1>
        {page !== "contact" && (
          <p className="detail-note">
            Pre-launch draft · Updated October 17, 2026. These pages describe
            the current application and need the operator’s review before public
            launch.
          </p>
        )}
        {page === "contact" ? (
          <>
            <p className="section-intro">
              For community questions, accessibility assistance, privacy
              requests or help with your account, contact:
            </p>
            <div className="box">
              <h2>Prathyusha Gogineni</h2>
              <a className="contact-email" href="mailto:whiteperall@gmail.com">
                whiteperall@gmail.com
              </a>
              <p>Her Hobby Hour — Oh Sakhi! · Richmond, Virginia</p>
            </div>
            <p>
              Please include the event title or relevant account email when
              helpful. Never send your password, authentication links, or API
              keys.
            </p>
            <p>
              You can report an event from its details page when signed in. This
              inbox is not an emergency service; contact local emergency
              services for immediate danger.
            </p>
          </>
        ) : page === "privacy" ? (
          <>
            <h2>Who operates the community</h2>
            <p>
              Her Hobby Hour — Oh Sakhi! is operated by Prathyusha Gogineni. For
              privacy questions or requests, email{" "}
              <a href="mailto:whiteperall@gmail.com">whiteperall@gmail.com</a>.
            </p>
            <h2>Information we handle</h2>
            <p>
              Accounts use your email address and Supabase authentication.
              Passwords are handled by Supabase Auth, not stored in community
              profile tables. Profiles contain the display name, optional photo
              and bio, interests, city and optional neighborhood you provide. We
              also store events, RSVPs, reports, and administrative actions.
            </p>
            <h2>How information is used and shared</h2>
            <p>
              We use this information to provide accounts, display events,
              reserve seats, manage attendance, respond to support requests and
              moderate the community. Published event details and covers can be
              public. Profile photos are publicly visible by default, including
              photos uploaded before this update. Removing or replacing a photo
              changes which image the website displays; previously downloaded
              copies may remain. Other profile details, including your email,
              bio, interests and neighborhood, are not public; authorised
              administrators can access profile information. Organisers and
              administrators can view attendee display names, member
              identifiers, RSVP states and registration times, and download
              these as CSV. Contact email addresses are not included in attendee
              exports.
            </p>
            <p>
              Event descriptions and organiser labels are public content: avoid
              putting private contact information in them. Reports and review
              notes are restricted to authorised administrators. People who
              previously downloaded or copied information may retain their
              copies.
            </p>
            <h2>Storage, service providers and local data</h2>
            <p>
              Supabase provides authentication, database and file storage. The
              app currently loads fonts from Google Fonts, which receives
              network requests from your browser. Our hosting and infrastructure
              providers may process technical logs needed to operate the
              service. Resend processes recipient email addresses and event
              details to deliver RSVP confirmations, date/time/venue changes,
              cancellations and reminders. Organisers receive publication,
              own-event cancellation confirmations and new-attendee notices;
              new-attendee notices include the attendee's display name. These
              are service messages for events you join or organise. Cancel an
              active RSVP in My plans to stop its future updates and reminders.
              Delivery records help us retry failures and stop sending to
              addresses that bounce or report spam. We do not implement
              advertising trackers.
            </p>
            <p>
              Your browser stores session information to keep you signed in.
              Event reservations and profile changes are saved to your account
              through Supabase.
            </p>
            <h2>Deletion and retention</h2>
            <p>
              Signed-in members can request permanent deletion from My profile.
              Cancel upcoming published events first. Deletion removes the Auth
              account, profile, uploaded profile photos, RSVPs, submitted
              reports, and hosted events with their attendee records and covers.
              Seats reserved at other events are released. If cleanup is
              interrupted, access remains locked and deletion can be retried.
              Administrator accounts require the operator to transfer
              responsibilities and remove the role first.
            </p>
            <p>
              Security and moderation audit records may remain with an account
              identifier; actor links are cleared when an account is deleted.
              Free-text audit notes may contain information supplied during
              moderation. Provider logs, backups and copies previously
              downloaded by others are not instantly erased by the in-app
              deletion process. The operator must finalise and review retention
              periods and backup handling before public launch. Contact us for
              assistance, including if you cannot sign in.
            </p>
            <h2>Your choices</h2>
            <p>
              You can update your profile, remove your photo, cancel your RSVP,
              delete your account, or clear browser session data. Contact us
              about access, correction or deletion questions. We will review
              requests and verify identity where appropriate.
            </p>
          </>
        ) : page === "terms" ? (
          <>
            <h2>Using Her Hobby Hour — Oh Sakhi!</h2>
            <p>
              These draft terms describe participation in the community operated
              by Prathyusha Gogineni. Use your own account, provide accurate
              event details, keep your password secure and follow our{" "}
              <a href="/guidelines">Community guidelines</a>.
            </p>
            <h2>Events and reservations</h2>
            <p>
              Members organise gatherings and publish events directly. An RSVP
              confirms a seat immediately when capacity remains and registration
              is open. Cancel your spot if you cannot attend. Organisers may
              edit or cancel their events; review the latest event details
              before attending. Event update emails and reminders are not
              currently available.
            </p>
            <p>
              Meet in appropriate public venues, respect the venue’s rules and
              consider your own access, transport and personal needs. An event
              listing or RSVP does not guarantee the organiser’s identity, an
              event’s quality or another participant’s conduct.
            </p>
            <h2>Your content and community access</h2>
            <p>
              Share only information and images you have permission to use. By
              posting event content, you allow the service to display it for
              community purposes. You remain responsible for your content.
              Administrators may remove violating events or suspend access and
              record reasons for those decisions. Contact us if you want a
              decision reviewed.
            </p>
            <h2>Leaving the community</h2>
            <p>
              You may stop participating or delete your account. Cancellation
              preserves event history; account deletion permanently removes your
              hosted events and associated attendee records. Read the{" "}
              <a href="/privacy">Privacy Policy</a> for deletion, provider and
              retention details.
            </p>
            <h2>Questions and changes</h2>
            <p>
              Contact{" "}
              <a href="mailto:whiteperall@gmail.com">whiteperall@gmail.com</a>{" "}
              about these terms. The operator will review these pages before
              launch and publish updates when the service or rules change.
            </p>
          </>
        ) : (
          <>
            <h2>Be welcoming and respectful</h2>
            <p>
              Her Hobby Hour — Oh Sakhi! is a women’s friendship and experiences
              community, welcoming different cultures and backgrounds. Respect
              people’s boundaries and choices. Harassment, discrimination,
              threats, spam and unwanted romantic or commercial approaches do
              not belong here.
            </p>
            <h2>Protect privacy</h2>
            <p>
              Do not share another person’s contact details, photos or personal
              information without permission. Attendee lists and exports are for
              authorised event coordination; do not publish, sell or use them
              for unsolicited outreach.
            </p>
            <h2>Host responsibly</h2>
            <p>
              Choose suitable public venues, provide accurate details and update
              your event when plans change. Respect capacity, venue rules and
              accessibility needs. Cancel events you can no longer host, and
              cancel your RSVP when you cannot attend.
            </p>
            <h2>Report concerns</h2>
            <p>
              Use Report this event on another member’s event or email{" "}
              <a href="mailto:whiteperall@gmail.com">whiteperall@gmail.com</a>.
              Include enough detail for review. Administrators may remove an
              event or suspend access for violations. For immediate danger,
              contact local emergency services.
            </p>
          </>
        )}
      </main>
      <footer className="information-footer">
        <LegalLinks />
      </footer>
    </div>
  );
}
