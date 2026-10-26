# Jesus in Practice design system

## Direction

A welcoming Christian reading experience that connects Jesus's teachings with ordinary decisions. The current direction follows the owner's request for a recognisable connection to Jesus, real internet photography, and the ivory/burgundy visual study. Use literary headings, warm reading surfaces, restrained burgundy actions, and real photographs. The earlier blue/Manrope/generated-illustration direction is superseded.

Preserve Next.js, React, TypeScript, Tailwind CSS, the two-app workspace, and tested interactions. This is a visual and editorial redesign, not a live AI/messaging integration.

Taste dials: design variance 6, motion intensity 2, visual density 4 on the public website and 5 in member workflows. Let layout and typography supply character. Avoid decorative animation, generic business metrics, fabricated testimonials, spiritual scores, and guilt-based streaks.

UI UX Pro Max's targeted typography searches returned literary/editorial and Lora pairings, along with less relevant poster and wellness directions. Use the reading hierarchy guidance; the owner's visual brief governs the palette and imagery. Lora headings connect the interface to books and scripture, while existing Inter body text and controls remain easy to scan. This is a design judgement, not a tested psychological or learning claim.

## Colour and typography

| Role               | Light value | Dark value             |
| ------------------ | ----------- | ---------------------- |
| Background         | `#FAF7F0`   | `#1C1817`              |
| Surface            | `#FFFDFA`   | `#26211F`              |
| Main text          | `#292522`   | `#F8F3EC`              |
| Secondary text     | `#6A6057`   | `#C5B8AB`              |
| Primary action     | `#6B303D`   | `#E8B6BE`              |
| Text on primary    | `#FFFFFF`   | `#382029`              |
| Decorative divider | `#D8CEC1`   | `#504039`              |
| Control outline    | `#8A7669`   | `#AB9384`              |
| Soft surface       | `#E9E1D5`   | `#3B292C`              |
| Decorative gold    | `#B59A64`   | Restrained warm accent |

These colours are an art-direction choice, not a claim that a colour produces trust, happiness, or spiritual growth. Use burgundy consistently for navigation and action, with a lighter rose primary in dark mode. Gold is decorative; do not use it for small text on ivory or as the only distinction between states. Verify rendered text, focus, and control contrast.

Use **Lora** display headings and **Inter** body/interface text, loaded through `next/font`. Use italic Lora sparingly for headline emphasis, regular or medium headings, and restrained corners. Keep body copy around 16px with generous spacing. Avoid all-caps paragraphs, long centred explanations, and excessive pills. Use the existing Radix icon family. Keep branding consistent across apps and favicons; icon-only controls require accessible names.

## Visual comparison routes

The default design remains **Heritage**. Four alternative directions are isolated under `/designs/[design]` in each app, with a public comparison gallery at `/designs`. They are homepage and Today dashboard previews for choosing a direction, not five versions of every product page.

| ID         | Direction     | Visual approach                                                           |
| ---------- | ------------- | ------------------------------------------------------------------------- |
| `heritage` | Heritage      | Current ivory, burgundy, Lora, museum Christ sculpture                    |
| `vespers`  | Vespers       | Deep navy, warm gold, cinematic cross photograph, spacious reading        |
| `olive`    | Olive & Stone | Parchment, olive, printed-journal typography and structure                |
| `light`    | Clear Light   | White, charcoal, teal, bold Inter, direct lesson-first layout             |
| `living`   | Living Faith  | Warm cream, terracotta, open-armed garden statue, welcoming rounded forms |

These routes do not save a global theme preference. Their scoped CSS intentionally shows each proposed palette consistently; existing appearance preferences still apply to normal app routes. All options retain exact scripture references, original explanations, practical examples, accessible controls, and truthful local-preview labels. Shared definitions live in `shared/designs.ts`. Selection and rollout guidance is in [design comparison](../docs/design-comparison.md).

## Message anatomy

Every complete practice presents:

1. **Scripture reference:** Bible · KJV or Book of Mormon, with an exact passage link.
2. **In plain language:** a brief original explanation of the principle.
3. **In real life:** an explicitly illustrative, relatable situation.
4. **Try this today:** one manageable action, respecting consent, ability, resources, and safe boundaries.
5. Optional passage context and a reflection question for deeper exploration.

Keep scripture, original interpretation, and invented everyday examples distinguishable. A reference is not proof that every modern action appears verbatim in the passage. Use shared content so public pages, email examples, SMS examples, and member screens stay consistent.

SMS previews use a shorter attributed version with a meaning and concrete example/action. Do not claim one billable SMS segment; provider encoding and service text affect length. Email can show the full learning sequence.

Random preview selection draws only from the selected collection and applicable topics, avoiding adjacent repeats when alternatives exist. It is not generated AI content. See [AI content design](../docs/ai-content-design.md) for the proposed verified-corpus workflow.

## Imagery

Use locally stored real photographs: Thorvaldsen's Christ sculpture for the homepage and setup, a person praying beside an open Bible, and a KJV Bible detail. No AI-generated images are used in the current frontend. Caption the sculpture as artwork rather than a historical photograph of Jesus. Photographers, the museum, and pictured people are not endorsers or customer testimonials. The photographed Bible is open to Jeremiah 29; it is supporting imagery, not a representation of every lesson's passage.

Preserve faces, open hands, and the Bible in responsive crops. Prefer an uncrowded split hero with the sculpture on the right and clear practical copy on the left. Supporting images connect scripture with everyday reflection. Reading takes priority over photography in the dashboard.

Use responsive Next.js images, reserved dimensions, and concise informative alt text. See [asset credits](../docs/asset-credits.md).

## Interaction and accessibility

- Visible focus, semantic links/buttons, explicit labels, and comfortable touch targets.
- Errors near fields, announced outcomes, and no colour-only meaning.
- Content remains usable without motion; respect reduced-motion preferences.
- Inspect at 320, 390, 768, 1024, and 1440px; avoid page overflow.
- Preserve native controls and existing Headless UI primitives before adding dependencies.
- Bible is the default; Book of Mormon and both collections are deliberate choices.
- Preview status remains truthful: no fake generation, payment, authentication, sends, or activity.
- Preserve storage recovery, explicit reset, draft-conflict handling, and persistence feedback.

## Research and limits

[W3C's readability technique](https://www.w3.org/WAI/WCAG21/Techniques/general/G153.html) supports short sentences, familiar words, clear relationships, and consistent labels. [W3C's writing guidance](https://www.w3.org/WAI/tips/writing/) supports meaningful headings, instructions, link text, and image alternatives. Applying these to the learning sequence is a design inference, not evidence that this product improves learning or behaviour.

No user study, theological approval, accessibility certification, or clinical outcome has been established. Executed browser and automated checks belong in the verification report with their coverage and limits.
