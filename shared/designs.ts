export type DesignId = "heritage" | "vespers" | "olive" | "light" | "living";

export interface Design {
  readonly id: DesignId;
  readonly number: number;
  readonly name: string;
  readonly description: string;
  readonly palette: readonly string[];
  readonly paletteLabel: string;
  readonly previewImage: string;
}

export const designs: readonly Design[] = [
  {
    id: "heritage",
    number: 1,
    name: "Heritage",
    description:
      "Literary headings, an ivory canvas, and burgundy details. A quiet reading experience with Christ at its centre.",
    palette: ["#FAF7F0", "#6B303D", "#B59A64", "#292522"],
    paletteLabel: "Ivory, burgundy, gold, and charcoal",
    previewImage: "/images/design-previews/heritage.webp",
  },
  {
    id: "vespers",
    number: 2,
    name: "Vespers",
    description:
      "Midnight navy, warm gold, and a cross against the evening sky. A cinematic setting for reflection.",
    palette: ["#142330", "#E5C78F", "#F6F4ED", "#D7E1E7"],
    paletteLabel: "Midnight navy, warm gold, ivory, and slate",
    previewImage: "/images/design-previews/vespers.webp",
  },
  {
    id: "olive",
    number: 3,
    name: "Olive & Stone",
    description:
      "Parchment, olive, and the feel of a reading journal. An unhurried space for scripture and everyday practice.",
    palette: ["#F4F1E8", "#3E4A36", "#D5D8C9", "#262C23"],
    paletteLabel: "Parchment, olive, stone, and forest",
    previewImage: "/images/design-previews/olive.webp",
  },
  {
    id: "light",
    number: 4,
    name: "Clear Light",
    description:
      "White space, bold type, and a focused teal accent. A direct, modern approach that puts each lesson first.",
    palette: ["#FFFFFF", "#182125", "#075E63", "#E3F2EF"],
    paletteLabel: "White, charcoal, teal, and pale mint",
    previewImage: "/images/design-previews/light.webp",
  },
  {
    id: "living",
    number: 5,
    name: "Living Faith",
    description:
      "Warm cream, terracotta, and generous, welcoming type. A lively invitation to bring faith into ordinary life.",
    palette: ["#FFF6EC", "#9B3F29", "#EFC4A7", "#30221D"],
    paletteLabel: "Warm cream, terracotta, apricot, and dark brown",
    previewImage: "/images/design-previews/living.webp",
  },
];

export function isDesignId(value: unknown): value is DesignId {
  return typeof value === "string" && designs.some((design) => design.id === value);
}

export function getDesign(id: string): Design | undefined {
  return designs.find((design) => design.id === id);
}
