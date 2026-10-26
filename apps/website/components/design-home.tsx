import { practices } from "@jesus-in-practice/content";
import {
  ArrowRightIcon,
  ChatBubbleIcon,
  CheckIcon,
  HeartIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";

import MessagePreview from "@/components/message-preview";
import PhotoCredit from "@/components/photo-credit";
import PracticeCard from "@/components/practice-card";
import { memberUrl } from "@/lib/site";

const featuredPractices = [practices[0], practices[1], practices[4]];

const steps = [
  {
    title: "Choose what you learn",
    text: "Begin with the KJV Bible. Add the Book of Mormon if you choose. Every practice identifies and links its source.",
  },
  {
    title: "Make room in your day",
    text: "Explore email, SMS, or both. Choose your days, your time, and a pace that works for your life.",
  },
  {
    title: "Put the idea into practice",
    text: "Try one thoughtful action. Save a lesson, write a reflection, and return when you are ready.",
  },
];

function HeroActions({ primary = "Explore the preview" }: { primary?: string }) {
  return (
    <div className="button-row design-actions">
      <Link className="button" href="/signup">
        {primary} <ArrowRightIcon aria-hidden="true" />
      </Link>
      <a className="button button-secondary" href="#try-a-lesson">
        Try a lesson
      </a>
    </div>
  );
}

function Lesson({ title, description }: { title: string; description: string }) {
  return (
    <section className="design-lesson" id="try-a-lesson">
      <div className="container">
        <div className="design-section-heading">
          <div>
            <p className="eyebrow">A lesson you can use</p>
            <h2>{title}</h2>
          </div>
          <p>{description}</p>
        </div>
        <MessagePreview />
      </div>
    </section>
  );
}

function PracticeCollection({ title }: { title: string }) {
  return (
    <section className="container design-collection">
      <div className="design-section-heading">
        <div>
          <p className="eyebrow">For everyday moments</p>
          <h2>{title}</h2>
        </div>
        <Link className="text-link design-arrow-link" href="/practices">
          Explore all practices <ArrowRightIcon aria-hidden="true" />
        </Link>
      </div>
      <div className="practices-grid">
        {featuredPractices.map((practice) => (
          <PracticeCard key={practice.id} practice={practice} />
        ))}
      </div>
    </section>
  );
}

function Rhythm({ title }: { title: string }) {
  return (
    <section className="design-rhythm">
      <div className="container design-rhythm-inner">
        <div className="design-rhythm-heading">
          <p className="eyebrow">Your sources. Your schedule.</p>
          <h2>{title}</h2>
          <Link className="text-link design-arrow-link" href="/how-it-works">
            See how it works <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
        <ol className="design-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="design-step-number" aria-hidden="true">
                0{index + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Invitation({ title }: { title: string }) {
  return (
    <section className="design-invitation">
      <div className="container">
        <div className="design-invitation-copy">
          <p className="eyebrow">Start where you are</p>
          <h2>{title}</h2>
          <p>
            Bring your faith, your questions, or your curiosity. You do not need to know the books
            or belong to a church to begin.
          </p>
        </div>
        <div className="design-invitation-actions">
          <a href={memberUrl()} className="button">
            Open the member preview <ArrowRightIcon aria-hidden="true" />
          </a>
          <p className="fine-print">No account needed. No messages sent or payments taken.</p>
          <Link className="text-link" href="/about">
            Our independent purpose & approach
          </Link>
        </div>
      </div>
    </section>
  );
}

function Vespers() {
  return (
    <>
      <section className="vespers-hero">
        <div className="vespers-image-frame">
          <Image
            src="/images/cross-sunset.webp"
            alt="Two people walking beside a cross at sunset"
            fill
            sizes="(max-width: 900px) 100vw, 67vw"
            priority
            className="vespers-hero-image"
          />
        </div>
        <div className="container vespers-hero-inner">
          <div className="vespers-hero-copy">
            <p className="eyebrow">A moment for what matters</p>
            <h1>
              Let your faith
              <br />
              <em>meet your life.</em>
            </h1>
            <p>
              The teachings of Jesus, brought into the everyday. A passage to understand. An action
              to try. A thought to carry with you.
            </p>
            <HeroActions primary="Begin your practice" />
          </div>
        </div>
        <div className="vespers-photo-credit design-photo-credit">
          Photograph:{" "}
          <a
            href="https://unsplash.com/photos/two-people-standing-in-front-of-a-cross-at-sunset-a2F5f8aXu_w"
            target="_blank"
            rel="noreferrer"
          >
            Luis Georg Müller / Unsplash<span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </div>
      </section>
      <div className="vespers-purpose container">
        <span>Read with understanding.</span>
        <span>Reflect with honesty.</span>
        <span>Act with compassion.</span>
      </div>
      <Lesson
        title="A quiet moment. A practical next step."
        description="Read the reference, understand the meaning, and see what it could look like in your life. Explore a real example from the prepared collection."
      />
      <PracticeCollection title="Faith, in ordinary moments." />
      <Rhythm title="A practice that fits the life you live." />
      <Invitation title="Take one thought into tomorrow." />
    </>
  );
}

function Olive() {
  return (
    <>
      <section className="container olive-journal">
        <div className="olive-masthead">
          <span>A journal for everyday faith</span>
          <span>Scripture · Reflection · Action</span>
        </div>
        <h1>
          A daily page.
          <br />
          <em>A life put into practice.</em>
        </h1>
        <div className="olive-editorial">
          <div className="olive-index">
            <p className="eyebrow">In these pages</p>
            <a href="#try-a-lesson">01 &nbsp; Read & reflect</a>
            <a href="#olive-practices">02 &nbsp; Put it into practice</a>
            <Link href="/about">03 &nbsp; Our purpose</Link>
            <p className="olive-margin-note">A thoughtful beginning is enough.</p>
          </div>
          <div className="olive-introduction">
            <p className="olive-dropcap">
              Faith belongs in the ordinary parts of life. In how we listen. In the help we offer.
              In the patience we choose when the day does not go to plan.
            </p>
            <p>
              Jesus in Practice connects a scripture passage with a simple explanation, a familiar
              situation, and one thing you can do today.
            </p>
            <HeroActions primary="Start a new practice" />
            <p className="fine-print">Bible by default. Book of Mormon only if you choose it.</p>
          </div>
          <figure className="olive-photo">
            <Image
              src="/images/prayer.webp"
              alt="A man pauses to pray beside an open Bible"
              width={1200}
              height={1800}
              sizes="(max-width: 700px) 90vw, 34vw"
              priority
            />
            <figcaption>
              <PhotoCredit photo="prayer" />
            </figcaption>
          </figure>
        </div>
      </section>
      <Lesson
        title="Read it. Sit with it. Try it."
        description="An original reflection, with its source in view. Take the idea with you, or follow the reference to read the passage in context."
      />
      <section className="container olive-practices" id="olive-practices">
        <div className="design-section-heading">
          <div>
            <p className="eyebrow">From the practice notebook</p>
            <h2>Good intentions, given a next step.</h2>
          </div>
          <Link className="text-link design-arrow-link" href="/practices">
            Browse the collection <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
        <div className="olive-practice-list">
          {featuredPractices.map((practice, index) => (
            <article key={practice.id}>
              <div className="olive-practice-category">
                <span aria-hidden="true">0{index + 1}</span>
                {practice.category}
              </div>
              <div>
                <h3>
                  <Link href={`/practices/${practice.id}`}>{practice.title}</Link>
                </h3>
                <a href={practice.sourceUrl} target="_blank" rel="noreferrer">
                  Bible · KJV / {practice.reference}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
              <p>{practice.plainMeaning}</p>
              <Link className="olive-read-link" href={`/practices/${practice.id}`}>
                Read practice <ArrowRightIcon aria-hidden="true" />
                <span className="sr-only">: {practice.title}</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
      <Rhythm title="Make it part of your own rhythm." />
      <Invitation title="There is room for a new beginning." />
    </>
  );
}

function Light() {
  return (
    <>
      <section className="container light-hero">
        <div className="light-hero-copy">
          <p className="eyebrow">Scripture, made usable</p>
          <h1>
            Understand it.
            <br />
            <span>Live it.</span>
          </h1>
          <p>
            Discover what a passage means and what you can do with it. Clear explanations. Real-life
            examples. One practical next step.
          </p>
          <HeroActions />
        </div>
        <figure className="light-photo">
          <div className="light-photo-label">
            <span>The source is always in view.</span>
            <ArrowRightIcon aria-hidden="true" />
          </div>
          <Image
            src="/images/scripture.webp"
            alt="An open King James Bible showing a page from Jeremiah"
            width={1200}
            height={900}
            sizes="(max-width: 700px) 90vw, 40vw"
            priority
          />
          <figcaption>
            <PhotoCredit photo="scripture" />
          </figcaption>
        </figure>
      </section>
      <div
        className="container light-learning-strip"
        role="group"
        aria-label="The learning sequence"
      >
        <span>
          <b>01</b> Find the passage
        </span>
        <span>
          <b>02</b> Understand the idea
        </span>
        <span>
          <b>03</b> Put it into practice
        </span>
      </div>
      <Lesson
        title="Start with a real example."
        description="Select your scripture source and message format. Every example links to the passage and distinguishes our explanation from scripture."
      />
      <Rhythm title="Choose. Receive. Practise." />
      <PracticeCollection title="Useful ideas. Everyday situations." />
      <Invitation title="Your next step starts here." />
    </>
  );
}

function Living() {
  return (
    <>
      <section className="container living-hero">
        <div className="living-hero-copy">
          <p className="living-welcome">
            <SunIcon aria-hidden="true" /> Open to faith. Open to curiosity.
          </p>
          <h1>
            Make room
            <br />
            for faith
            <br />
            <span>in real life.</span>
          </h1>
          <p>
            In a kind word. A patient reply. A helping hand. Explore the teachings of Jesus through
            simple ideas you can put into practice today.
          </p>
          <HeroActions primary="Find your first practice" />
          <div className="living-reassurance">
            <CheckIcon aria-hidden="true" /> Your sources, your pace, your choice.
          </div>
        </div>
        <div className="living-photo-composition">
          <figure className="living-photo">
            <Image
              src="/images/jesus-garden.webp"
              alt="A sculpture of Jesus in a green garden"
              width={1200}
              height={1800}
              sizes="(max-width: 700px) 90vw, 45vw"
              priority
            />
            <figcaption className="design-photo-credit">
              Sculpture of Jesus. Photograph:{" "}
              <a
                href="https://www.pexels.com/photo/a-statue-of-jesus-in-a-park-26742263/"
                target="_blank"
                rel="noreferrer"
              >
                Maria Cobuz / Pexels<span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </figcaption>
          </figure>
          <Link href={`/practices/${practices[0].id}`} className="living-practice-note">
            <HeartIcon aria-hidden="true" />
            <div>
              <span>An idea to begin with</span>
              <strong>Notice your neighbour.</strong>
              <span>Bible · KJV / {practices[0].reference}</span>
            </div>
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
      </section>
      <nav className="container living-moments" aria-label="Explore a moment of practice">
        <span>Start with a moment of…</span>
        <Link href={`/practices/${practices[0].id}`}>
          <HeartIcon aria-hidden="true" /> Kindness
        </Link>
        <Link href={`/practices/${practices[1].id}`}>
          <ChatBubbleIcon aria-hidden="true" /> Patience
        </Link>
        <Link href={`/practices/${practices[4].id}`}>
          <SunIcon aria-hidden="true" /> Gratitude
        </Link>
      </nav>
      <Lesson
        title="Meet your next everyday practice."
        description="A passage, a plain-language meaning, and an example from ordinary life. Try the action in a way that fits your circumstances."
      />
      <Rhythm title="A rhythm that belongs to you." />
      <PracticeCollection title="A little more care in the everyday." />
      <Invitation title="Bring your whole, everyday self." />
    </>
  );
}

export default function DesignHome({ design }: { design: string }) {
  const pages = { vespers: Vespers, olive: Olive, light: Light, living: Living };
  const Page = Object.hasOwn(pages, design) ? pages[design as keyof typeof pages] : undefined;
  if (!Page) return null;
  return (
    <div className="design-home" data-design={design}>
      <Page />
    </div>
  );
}
