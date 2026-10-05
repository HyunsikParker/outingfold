# OutingFold design

## Purpose and workflow

A reader turns source notes into a small field guide. The landing page shows the object and offers a recorded example or the reader's own notes. The editor has three stages: Source, Review and Save. Only the active controls are shown, beside the live guide on desktop. Mobile puts the controls first and provides a link to the guide preview.

The review lists every source line, including omitted lines. Readers can include, remove or reclassify excerpts. Changing the source or a selection clears review confirmation. Saving remains disabled until the current selection meets the size limits and review is confirmed. Empty model output opens the same review with nothing selected; it never creates a substitute answer.

## Visual decisions

The woodland image establishes the outdoor purpose; the paper overlay shows what the app produces. The image is generated illustration, not a claim about the example location. It stays out of offline and printed exports.

The canvas is #f7faf5, paper #ffffff, ink #183f35, accent #e6f2a8, muted text #637469 and warning text #91412c. Type uses Avenir Next, Avenir, Segoe UI and system sans-serif fallbacks. A large landing headline gives way to smaller task headings and restrained controls. Dashed rules on the four-panel guide are actual fold guides. Print styles use monochrome text without depending on background graphics.

The layout has breakpoints at 1100, 820, 570 and 360 px. Keyboard focus remains visible. Stage changes focus the heading. Reduced-motion settings disable smooth scrolling and button transitions. Status messages distinguish recorded output, live selection, manual selection and failure. Model setup is available in a disclosure on the Source step.

## Technical boundaries

Plain browser modules and a zero-dependency Node server keep the public demo static and the offline file self-contained. Local Gemma returns source IDs and categories; application code copies the original substrings and rejects invalid output. Exact copying does not establish truth, completeness or current conditions. The offline HTML retains the full pasted notes, while the printout has only selected excerpts.

No account, analytics, location access or persistent browser storage is used. Local inference needs an installed Ollama model. The hosted example replays a labeled saved response. There is no arbitrary source-URL fetcher or remotely accessible inference server.

## Validation

Nine software tests cover source copying, selection validation, output limits, offline escaping and local API boundaries. Browser checks cover stage transitions, manual selection, adding omitted excerpts, changing sections, review invalidation, keyboard focus and exports. The 320 px and 390 px layouts have no horizontal overflow. The edited park example fits one A4 page. No outdoor field trial or physical printer test is claimed.
