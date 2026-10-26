import PageHeading from "@/components/page-heading";
import PracticeLibrary from "@/components/practice-library";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "Explore practical scripture lessons",
  "Find a thoughtful practice for everyday life. Browse compassion, patience, rest, and more in the KJV Bible or optional Book of Mormon collection.",
  "/practices",
);

export default function Practices() {
  return (
    <div className="container">
      <PageHeading eyebrow="The practice library" title="Understand it. Then try it.">
        <p>
          Find a clear explanation of a scripture passage, see what it looks like in a real-life
          situation, and choose an action to try. Every lesson links back to its source.
        </p>
      </PageHeading>
      <PracticeLibrary />
    </div>
  );
}
