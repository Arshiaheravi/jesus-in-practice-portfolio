import Image from "next/image";
import Link from "next/link";

import Cta from "@/components/cta";
import PageHeading from "@/components/page-heading";
import PhotoCredit from "@/components/photo-credit";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "Our purpose and scripture sources",
  "Jesus in Practice helps people turn scripture into everyday actions. Learn about our independent purpose, source choices, and approach to practical reflections.",
  "/about",
);

export default function About() {
  return (
    <>
      <div className="container">
        <PageHeading eyebrow="Our purpose" title="Faith is something we practise.">
          <p>
            Reading can give us an idea. Putting it into practice is how that idea meets the world.
          </p>
        </PageHeading>
        <section className="split-section section" style={{ paddingTop: 10 }}>
          <div>
            <h2>Understand the idea. See how to use it.</h2>
            <p className="lead">
              Jesus in Practice began with a simple question: what if learning from scripture came
              with one useful thing to do today?
            </p>
            <p className="lead">
              A conversation handled with more patience. A neighbour offered practical help. A
              moment taken to give thanks. These are small things, and they are worth making room
              for.
            </p>
            <p className="lead">
              This project is for people who follow Jesus, people finding their way back to
              scripture, and people who are simply curious. You do not have to arrive with all the
              answers.
            </p>
          </div>
          <div>
            <Image
              className="editorial-photo scripture-photo"
              src="/images/scripture.webp"
              alt="An open King James Bible showing a page from Jeremiah"
              width={1200}
              height={900}
              sizes="(max-width: 800px) 90vw, 45vw"
            />
            <PhotoCredit photo="scripture" />
          </div>
        </section>
        <section className="section" id="sources">
          <p className="eyebrow">Scripture & sources</p>
          <h2>Know what you are learning from.</h2>
          <div className="values-grid">
            <div className="value">
              <h3>The Bible, King James Version</h3>
              <p>
                The Bible collection draws on the Old and New Testaments in the King James Version.
                Every practice includes a reference and a link to the surrounding passage.
              </p>
              <p>
                The Bible is the default collection. You can explore the whole experience without
                adding another scripture source.
              </p>
            </div>
            <div className="value">
              <h3>The Book of Mormon</h3>
              <p>
                The Book of Mormon is a distinct scripture in the Latter-day Saint tradition. It is
                offered as a separate, optional collection, with its source clearly shown on every
                practice.
              </p>
              <p>
                Christian traditions differ in how they understand this book. You decide whether you
                want to include it.
              </p>
            </div>
            <div className="value">
              <h3>Reflections, with context</h3>
              <p>
                Our summaries, actions, and reflection questions are original writing inspired by
                the passages. They are not quotations, authoritative interpretations, or a
                substitute for reading scripture in context.
              </p>
              <p>
                The starting collection still needs independent editorial and theological review
                before live messaging launches.
              </p>
            </div>
            <div className="value">
              <h3>An independent project</h3>
              <p>
                Jesus in Practice does not represent a church, denomination, or religious
                institution. Links to scripture hosts help you find the source; they do not imply
                affiliation or endorsement.
              </p>
              <p>
                The Word of Wisdom is in Doctrine and Covenants 89, outside these two collections,
                so it is not presented as a Bible or Book of Mormon lesson here.
              </p>
            </div>
          </div>
        </section>
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="notice">
            <strong>Practice with care.</strong> Adapt any suggestion to your circumstances,
            consent, safety, and means. Forgiveness does not require unsafe contact. Generosity does
            not require giving what you cannot afford. These reflections do not replace medical,
            mental health, financial, or other professional support.
          </div>
          <Link className="text-link section-link" href="/practices">
            Explore practices <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </div>
      <Cta />
    </>
  );
}
