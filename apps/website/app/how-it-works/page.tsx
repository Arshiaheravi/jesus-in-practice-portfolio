import Image from "next/image";
import Link from "next/link";

import Cta from "@/components/cta";
import MessagePreview from "@/components/message-preview";
import PageHeading from "@/components/page-heading";
import PhotoCredit from "@/components/photo-credit";
import { liveMode, pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "How it works",
  "Choose your scripture sources, explore email or SMS reminders, and turn one idea into an everyday practice. See how Jesus in Practice works.",
  "/how-it-works",
);

export default function HowItWorks() {
  return (
    <>
      <div className="container">
        <PageHeading
          eyebrow="Simple enough for everyday life"
          title="From a passage to a practical step."
        >
          <p>
            You do not need a perfect routine. Start with one idea that fits the life you are
            already living.
          </p>
        </PageHeading>
        <section className="split-section section" style={{ paddingTop: 10 }}>
          <div>
            <Image
              className="editorial-photo"
              src="/images/prayer.webp"
              alt="A man sitting in prayer with an open Bible in front of him"
              width={1200}
              height={1800}
              sizes="(max-width: 800px) 90vw, 45vw"
            />
            <PhotoCredit photo="prayer" />
          </div>
          <div>
            <p className="eyebrow">Make it your own</p>
            <h2>Your learning. Your schedule.</h2>
            <div className="steps">
              <div className="step">
                <span className="step-number" aria-hidden="true">
                  1
                </span>
                <div>
                  <h3>Choose your starting point</h3>
                  <p>
                    Start with the King James Bible. Add the Book of Mormon if you want, or explore
                    it on its own. Choose topics you care about, from compassion to gratitude.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="step-number" aria-hidden="true">
                  2
                </span>
                <div>
                  <h3>Choose a schedule that works</h3>
                  <p>
                    Choose email, SMS, or both. Set a time in your time zone, select your days, or
                    explore a surprise within your chosen hours. You can always change your mind.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="step-number" aria-hidden="true">
                  3
                </span>
                <div>
                  <h3>Put one thing into practice</h3>
                  <p>
                    Read the reflection, try the suggested action, and notice what you learn. Save a
                    favourite or write a reflection
                    {liveMode ? " in your account when you choose to save it" : " in your browser"}.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="split-section section">
          <div>
            <p className="eyebrow">A message with a purpose</p>
            <h2>
              One idea.
              <br />
              Something you can do.
            </h2>
            <p className="lead">
              Each lesson has a linked scripture reference, an explanation in plain language, a
              realistic example, and an action to try. Read the full passage whenever you want more
              context.
            </p>
            <div className="values-grid">
              <div className="value">
                <h3>Go at your own pace</h3>
                <p>There is no penalty for missing a day. Return when you are ready.</p>
              </div>
              <div className="value">
                <h3>Keep your choices</h3>
                <p>
                  Pause reminders, change sources, or reduce frequency. Your routine belongs to you.
                </p>
              </div>
            </div>
            <Link className="text-link section-link" href="/practices">
              Explore practices <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <MessagePreview />
        </section>
        <div className="notice">
          {liveMode ? (
            <>
              <strong>Free to begin:</strong> accounts and practice emails are free. SMS is
              optional, uses prepaid credit and needs a verified Canadian number and separate
              consent. The member app shows current service availability, limits and the CAD rate
              before payment. No recurring subscription.
            </>
          ) : (
            <>
              <strong>What works in this preview:</strong> explore lessons, try your setup, save
              practices, and test settings in this browser. There are no scheduled messages,
              charges, or background reminders. Live accounts and provider delivery are separate
              from this demo.
            </>
          )}
        </div>
      </div>
      <Cta />
    </>
  );
}
