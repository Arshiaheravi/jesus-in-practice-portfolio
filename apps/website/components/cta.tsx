import Link from "next/link";

import { liveMode } from "@/lib/site";

export default function Cta() {
  return (
    <section className="section container">
      <div className="cta-panel">
        <div>
          <p className="eyebrow">Start where you are</p>
          <h2>Learn something. Put it into practice.</h2>
          <p>Choose your sources and your schedule. Start with a practice you can use today.</p>
        </div>
        <div>
          <Link href="/signup" className="button">
            Get started <span aria-hidden="true">↗</span>
          </Link>
          <p className="fine-print">
            {liveMode
              ? "Free account and email. Add prepaid SMS when you choose."
              : "Try the interactive preview. No account needed."}
          </p>
        </div>
      </div>
    </section>
  );
}
