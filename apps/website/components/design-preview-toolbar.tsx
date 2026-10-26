import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import Link from "next/link";

import { memberUrl } from "@/lib/site";

import { type Design, designs } from "../../../shared/designs";

export default function DesignPreviewToolbar({ design }: { design: Design }) {
  return (
    <aside className="design-preview-toolbar" aria-label="Design preview controls">
      <div className="design-preview-toolbar-inner container">
        <div className="design-preview-toolbar-heading">
          <Link className="design-preview-back" href="/designs">
            <ArrowLeftIcon aria-hidden="true" /> All five designs
          </Link>
          <p>
            <strong>{design.name}</strong> · Website preview
          </p>
          <a className="design-preview-counterpart" href={memberUrl(`/designs/${design.id}`)}>
            View dashboard <ArrowRightIcon aria-hidden="true" />
          </a>
        </div>
        <nav className="design-preview-choices" aria-label="Choose a website design">
          {designs.map((option) => (
            <Link
              key={option.id}
              href={`/designs/${option.id}`}
              aria-current={option.id === design.id ? "page" : undefined}
            >
              <span aria-hidden="true">{option.number}</span> {option.name}
            </Link>
          ))}
        </nav>
        <p className="design-preview-scope">
          Compare the homepage and Today screen. Links to other pages open the current design.
        </p>
      </div>
    </aside>
  );
}
