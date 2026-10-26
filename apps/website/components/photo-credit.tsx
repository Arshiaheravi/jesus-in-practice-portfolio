const credits = {
  christus: {
    label: "Thorvaldsens Museum / Wikimedia Commons",
    href: "https://commons.wikimedia.org/wiki/File:Bertel_Thorvaldsen,_Kristus,_1821,_A82,_Thorvaldsensmuseum.png",
    note: "CC0 museum photograph",
  },
  prayer: {
    label: "Tima Miroshnichenko / Pexels",
    href: "https://www.pexels.com/photo/a-bearded-man-praying-5206043/",
    note: "Photograph",
  },
  scripture: {
    label: "Tim Wildsmith / Unsplash",
    href: "https://unsplash.com/photos/white-and-black-book-page-XB7yz-Tr_sc",
    note: "Photograph of a KJV Bible",
  },
} as const;

export default function PhotoCredit({ photo }: { photo: keyof typeof credits }) {
  const credit = credits[photo];
  return (
    <p className="photo-credit">
      {credit.note}.{" "}
      <a href={credit.href} target="_blank" rel="noreferrer">
        {credit.label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </p>
  );
}
