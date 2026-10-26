# Five visual directions

Open [the local comparison gallery](http://127.0.0.1:3000/designs) while both apps are running. The current design is retained as option 1. Four alternatives change composition, typography, colour, photography, and the Today workspace while preserving the existing content and preview behaviour.

| Option | Name          | Website                                                     | Today dashboard                                             |
| ------ | ------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| 1      | Heritage      | [/designs/heritage](http://127.0.0.1:3000/designs/heritage) | [/designs/heritage](http://127.0.0.1:3001/designs/heritage) |
| 2      | Vespers       | [/designs/vespers](http://127.0.0.1:3000/designs/vespers)   | [/designs/vespers](http://127.0.0.1:3001/designs/vespers)   |
| 3      | Olive & Stone | [/designs/olive](http://127.0.0.1:3000/designs/olive)       | [/designs/olive](http://127.0.0.1:3001/designs/olive)       |
| 4      | Clear Light   | [/designs/light](http://127.0.0.1:3000/designs/light)       | [/designs/light](http://127.0.0.1:3001/designs/light)       |
| 5      | Living Faith  | [/designs/living](http://127.0.0.1:3000/designs/living)     | [/designs/living](http://127.0.0.1:3001/designs/living)     |

## What to compare

View the homepage at desktop and phone widths, scroll to its working message example, then use the comparison toolbar to open the matching dashboard. Try email/SMS examples and the scripture source selector. On Today, save a practice, try another, and inspect the reference, meaning, example, and action. These interactions use the same existing local preview model as the main app.

The gallery thumbnails are screenshots of the actual homepage previews. All photographs are real source photographs; credits and reuse terms are in [asset credits](asset-credits.md). Photographs of sculptures represent artwork depicting Jesus, not historical photographs or endorsements.

## Scope and boundaries

- Each choice covers the homepage and Today screen. Normal navigation to the library, preferences, setup, and other product routes returns to the current Heritage design. The comparison toolbar explains this scope.
- Option 1 reuses the existing homepage and Today components. Normal `/` and `/dashboard` remain the default experience.
- No visual choice is saved as an account preference and no design-selection submission is sent. Tell the developer which option to carry through the remaining frontend after comparing.
- Saves and practice activity in dashboard previews use the existing browser-local storage at port 3001; they share that state with the regular dashboard. There is no server account or real message delivery.
- Routes validate the five supported IDs and return 404 for unknown IDs. Comparison pages explicitly remain noindex, even if public indexing is later enabled.

## Maintenance

`shared/designs.ts` is the single catalogue of IDs, names, descriptions, palettes, and thumbnail paths. Website previews compose `components/design-home.tsx`; dashboard previews reuse `TodayView` and `AppShell` with optional visual properties. Separate `design-variants.css` files scope their rules to `data-design` wrappers, including root theme tokens through `:has()`. `design-gallery.css` supplies the website gallery and comparison toolbar.

Gallery thumbnails live in `apps/website/public/images/design-previews/`. Regenerate them from the actual local homepage previews at a 1200 × 800 viewport after a material design change, waiting for fonts and visible images. Hide only the temporary `.design-preview-toolbar` while taking the thumbnail, so the image shows the product design. Save optimized WebP files with the same IDs. Restart a production preview after adding new static files. Do not substitute generated mockups.

Run the normal repository gates and `tests/e2e/design-comparison.spec.ts` after changes. The comparison suite exercises navigation, source/channel controls, dashboard persistence, responsive overflow, image loading, noindex, missing routes, and configured axe checks. Executed results are recorded separately from these instructions.

Once the owner chooses a direction, carry that design across the remaining routes, recheck the full journey, and retire or retain comparison routes deliberately. A selected visual direction does not make the backend production-ready.
