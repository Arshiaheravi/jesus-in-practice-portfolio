# Image and dependency provenance

## Current photographs

Downloaded from the original sources and visually reviewed on 2026-10-16. These are real photographs, not AI-generated pictures. The sculpture is a depiction of Jesus by an artist, not a historical photograph of Jesus. The photographed person is not represented as a member, testimonial, or endorser.

| Asset            | Photographer/source                                                                                                                                                                     | Reuse terms                                       | Delivery format                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------- |
| `christus.webp`  | Thorvaldsens Museum, [Christ, Bertel Thorvaldsen (1821), via Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Bertel_Thorvaldsen,_Kristus,_1821,_A82,_Thorvaldsensmuseum.png) | Source lists CC0 1.0                              | 1200 × 1800 WebP, 148,494 bytes |
| `prayer.webp`    | Tima Miroshnichenko, [A Bearded Man Praying](https://www.pexels.com/photo/a-bearded-man-praying-5206043/)                                                                               | [Pexels license](https://www.pexels.com/license/) | 1200 × 1800 WebP, 127,052 bytes |
| `scripture.webp` | Tim Wildsmith, [KJV Bible open to Jeremiah 29](https://unsplash.com/photos/white-and-black-book-page-XB7yz-Tr_sc)                                                                       | [Unsplash license](https://unsplash.com/license)  | 1200 × 900 WebP, 339,702 bytes  |

Used assets live in the apps' `public/images` directories. Original downloaded references remain in ignored local output. The existing reviewed `sharp` dependency resized the photos to 1200px wide and encoded WebP at quality 85, preserving the full image aspect ratio. CSS may crop the presentation; no generative alteration was performed. Next.js provides responsive variants. No new image library, CDN account, or external runtime image dependency was added.

Keep photographer/source links with the imagery. Do not imply museum, church, photographer, or pictured-person endorsement. Pexels and Unsplash permit website use subject to their restrictions; a stock-photo licence is not permission to invent testimonials or use a person or artwork as the service's trademark. The prayer image includes a rosary; do not describe it as representing every Christian tradition. The Bible image illustrates the collection generally, not the precise passage of an unrelated practice.

Lora replaces Manrope for display headings; Inter remains the body font. Both are bundled through `next/font`. Lora's published [SIL Open Font License](https://github.com/google/fonts/blob/main/ofl/lora/OFL.txt) permits use and redistribution subject to that license. Each app serves Lora and Inter notices at `/font-licenses.txt`. Font choice is visual design, not a claim about reading outcomes.

## Additional comparison photographs

Downloaded and visually inspected on 2026-10-17 for the four alternative design previews. Both source pages identify camera photographs. The pictured people are not testimonials or endorsers.

| Asset               | Photographer/source                                                                                                                                               | Reuse terms                                       | Delivery format                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------- |
| `cross-sunset.webp` | Luis Georg Müller, [Two people standing in front of a cross at sunset](https://unsplash.com/photos/two-people-standing-in-front-of-a-cross-at-sunset-a2F5f8aXu_w) | [Unsplash license](https://unsplash.com/license)  | 1600 × 1060 WebP, 31,462 bytes  |
| `jesus-garden.webp` | Maria Cobuz, [A Statue of Jesus in a Park](https://www.pexels.com/photo/a-statue-of-jesus-in-a-park-26742263/)                                                    | [Pexels license](https://www.pexels.com/license/) | 1200 × 1800 WebP, 101,238 bytes |

Encoded with the existing `sharp` dependency at WebP quality 83, with orientation normalized and original aspect ratio retained. No generative alteration was performed. Both files are stored locally in each application's `public/images` folder. Keep source links with the photographs and preserve the cross, figures, and open hands in responsive crops.

The five `apps/website/public/images/design-previews/*.webp` images are 1200 × 800 browser screenshots of this application's actual homepage previews, encoded as WebP. Their embedded photography retains the sources and restrictions recorded here. They are comparison thumbnails, not AI-generated concepts.

## Added tooling

Reviewed the published metadata, source ownership, licenses, engine/peer requirements, and lifecycle scripts before installation:

- `@radix-ui/react-icons` 1.3.2: MIT, [Radix Icons](https://github.com/radix-ui/icons), React 19 compatible, no install lifecycle hooks.
- `@playwright/test` 1.64.1: Apache-2.0, [Microsoft Playwright](https://github.com/microsoft/playwright), Node >=20. Development and browser testing only.
- `@axe-core/playwright` 4.14.0: MPL-2.0, [Deque axe-core integration](https://github.com/dequelabs/axe-core-npm), Node >=22.12. Development accessibility checks only; not included in product bundles.

The existing pnpm policy permits dependency build scripts only for the previously reviewed `sharp` and `unrs-resolver` packages. No new MCP server or global skill installation was necessary. Skill discovery confirmed the existing Vercel React, Taste, frontend-design, and UI UX guidance already cover this task.
