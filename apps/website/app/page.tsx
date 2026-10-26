import { practices } from "@jesus-in-practice/content";
import { CheckIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";

import Cta from "@/components/cta";
import MessagePreview from "@/components/message-preview";
import PhotoCredit from "@/components/photo-credit";
import PracticeCard from "@/components/practice-card";
import { liveMode, pageMetadata, siteUrl } from "@/lib/site";

export const metadata = pageMetadata(
  "Live the teachings of Jesus, one day at a time",
  "Understand a scripture passage in plain language, see a real-life example, and try one action. Explore KJV Bible and optional Book of Mormon lessons.",
  "/",
);

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Jesus in Practice",
            url: siteUrl,
            description:
              "Scripture explained in plain language, with real-life examples and practical actions.",
            inLanguage: "en-CA",
          }).replace(/</g, "\\u003c"),
        }}
      />
      <section className="container hero">
        <div className="hero-copy">
          <p className="eyebrow">Faith in everyday life</p>
          <h1>
            Live the teachings
            <br />
            of Jesus.
            <br />
            <em>One day at a time.</em>
          </h1>
          <p className="lead">
            A scripture reference. A simple explanation. A real-life example, and one thoughtful
            action to put into practice today.
          </p>
          <div className="button-row">
            <Link className="button" href="/signup">
              Get started <span aria-hidden="true">↗</span>
            </Link>
            <a className="button button-secondary" href="#try-a-lesson">
              Try a lesson
            </a>
          </div>
          <div className="hero-benefits">
            <span>
              <CheckIcon aria-hidden="true" />
              Your scripture choice
            </span>
            <span>
              <CheckIcon aria-hidden="true" />
              Free email · optional SMS
            </span>
            <span>
              <CheckIcon aria-hidden="true" />
              Your schedule
            </span>
          </div>
        </div>
        <figure className="hero-visual">
          <Image
            className="hero-photo"
            src="/images/christus.webp"
            alt="Museum photograph of Bertel Thorvaldsen’s Christ sculpture with open arms"
            width={1200}
            height={1800}
            sizes="(max-width: 700px) 100vw, 52vw"
            priority
          />
          <figcaption className="hero-image-caption">
            <span>Christ, Bertel Thorvaldsen</span>
            <PhotoCredit photo="christus" />
          </figcaption>
        </figure>
      </section>
      <section id="try-a-lesson" className="container lesson-section">
        <div className="section-top">
          <div>
            <p className="eyebrow">See what you will learn</p>
            <h2>
              A verse is the beginning.
              <br />
              Here is the next step.
            </h2>
          </div>
          <p>
            Choose a source and explore an example. Same message, with a format that fits your day.
          </p>
        </div>
        <MessagePreview />
      </section>
      <section className="container section">
        <div className="section-top">
          <div>
            <p className="eyebrow">Useful in the moments that matter</p>
            <h2>Ideas for your actual life.</h2>
          </div>
          <Link className="text-link" href="/practices">
            Explore all practices <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="practices-grid home-practices">
          {[practices[0], practices[1], practices[4]].map((practice) => (
            <PracticeCard key={practice.id} practice={practice} />
          ))}
        </div>
      </section>
      <section className="source-section">
        <div className="container section source-layout">
          <div>
            <p className="eyebrow">A routine you choose</p>
            <h2>Learn on your terms.</h2>
            <p className="lead">
              A message should fit your day. Pick what you want to learn, when you want to hear it,
              and how you want it to arrive.
            </p>
            <Link className="text-link section-link" href="/how-it-works">
              See how it works <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="steps">
            <div className="step">
              <span className="step-number" aria-hidden="true">
                1
              </span>
              <div>
                <h3>Choose your sources</h3>
                <p>
                  The KJV Bible, the Book of Mormon, or both. The Bible is the default. Every lesson
                  identifies and links its source.
                </p>
              </div>
            </div>
            <div className="step">
              <span className="step-number" aria-hidden="true">
                2
              </span>
              <div>
                <h3>Set your time and channel</h3>
                <p>
                  Explore email, SMS, or both. Choose specific times or a surprise within a time
                  window, with a pace you control.
                </p>
              </div>
            </div>
            <div className="step">
              <span className="step-number" aria-hidden="true">
                3
              </span>
              <div>
                <h3>Try it, save it, come back to it</h3>
                <p>
                  Put the idea to use. Save useful lessons and write a reflection. You can adjust
                  your choices whenever you want.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="container section split-section">
        <div>
          <Image
            className="editorial-photo"
            src="/images/prayer.webp"
            alt="A man praying with clasped hands beside an open Bible"
            width={1200}
            height={1800}
            sizes="(max-width: 800px) 90vw, 45vw"
          />
          <PhotoCredit photo="prayer" />
        </div>
        <div>
          <p className="eyebrow">Open to you</p>
          <h2>
            Bring your faith.
            <br />
            Or your curiosity.
          </h2>
          <p className="lead">
            You do not need to know the books or belong to a church. Start with a question, read the
            context, and decide what you want to practise.
          </p>
          <p className="lead">
            Jesus in Practice is independent. The Book of Mormon is a separate, optional collection.
            Your sources are always your choice.
          </p>
          <Link className="text-link section-link" href="/about">
            Our purpose & approach <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <section className="container section faq-layout">
        <div>
          <p className="eyebrow">Clear answers</p>
          <h2>Before you begin.</h2>
          <Link className="text-link" href="/support">
            More help & answers <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="faq-list">
          <details>
            <summary>Do I have to read the whole Bible first?</summary>
            <p>
              No. Each lesson starts with a specific reference and explains the idea in everyday
              language. A concrete example shows what it could look like in real life. You can
              follow the passage link to read more context.
            </p>
          </details>
          <details>
            <summary>Will I receive Book of Mormon content?</summary>
            <p>
              Only if you choose it. The Bible and Book of Mormon are separate collections, and
              every practice names its source.
            </p>
          </details>
          <details>
            <summary>Are these lessons generated by AI?</summary>
            <p>
              The library uses a prepared collection of 24 lessons. The “Another example” button
              selects from that collection; it does not generate new text. AI-assisted lessons are a
              future possibility and would need verified scripture sources, source links, and
              editorial safeguards. They are not available here.
            </p>
          </details>
          <details>
            <summary>Can I receive messages right now?</summary>
            <p>
              {liveMode
                ? "Create a free account to see available delivery options. Email lessons are free. SMS requires a verified Canadian number, a separate opt-in and prepaid credit. Your account shows whether each delivery service is enabled; setup alone does not send a message."
                : "Not in this preview. You can explore the interface and save preferences in this browser. Nothing is sent or charged. The service model is free accounts and email, with optional prepaid SMS credit when live delivery is enabled."}
            </p>
          </details>
        </div>
      </section>
      <Cta />
    </>
  );
}
