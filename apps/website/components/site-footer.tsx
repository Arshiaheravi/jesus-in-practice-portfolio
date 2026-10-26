import Link from "next/link";

import Brand from "@/components/brand";
import { supportEmail } from "@/lib/operator";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid container">
        <div>
          <Brand />
          <p className="footer-intro">
            Faith in everyday life.
            <br />
            Learn, reflect, and put it into practice.
          </p>
          <p className="fine-print">
            Made with everyday life in mind.
            <br />
            For Canada, and for the curious.
          </p>
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/practices">Practice library</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div>
          <h2>About</h2>
          <Link href="/about">Our purpose</Link>
          <Link href="/about#sources">Scripture & sources</Link>
          <Link href="/support">Help & answers</Link>
          {supportEmail && <a href={`mailto:${supportEmail}`}>Email support</a>}
        </div>
        <div>
          <h2>The details</h2>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms of use</Link>
          <Link href="/accessibility">Accessibility</Link>
        </div>
      </div>
      <div className="footer-bottom container">
        <p>© {new Date().getFullYear()} Jesus in Practice</p>
        <p>An independent project. Not affiliated with a church or denomination.</p>
      </div>
    </footer>
  );
}
