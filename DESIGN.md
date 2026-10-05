# OutingFold

An original project begun on 2026-10-05 UTC for DEV Hacktoberfest Week 1.

## Product contract
A reader pastes park notes they have permission to use, plus a title and optional source URL. A local open-weight model selects whole source blocks by ID and assigns them to Plan the visit, Look and listen, or Care and cautions. The deterministic core rejects IDs outside the source and preserves each selected block verbatim. The review shows every source block, including omitted blocks, and allows selection and category changes. Empty categories mean nothing selected, not nothing relevant. The reader confirms review before exporting. Source text can be wrong or old; source matching does not establish truth, completeness or safe conditions.

The deliverable is a short, four-panel, foldable page plus a self-contained HTML file with the complete source. No accounts, tracking, maps, route advice, location permission, paid service or network during offline reading. Local inference needs an installed Ollama model. The hosted example replays a clearly labeled real saved model response, never pretends to run inference. Private notes stay on the local computer. No arbitrary URL fetcher, and no remotely accessible inference server.

## Adopted direction
A practical field handout on an open desk, with the actual fold as the single expressive feature. The tool is a small static frontend with portable ES modules, a zero-dependency Node server and no build step. This is deliberately a static deliverable, not a dashboard. Four panels represent a physical paper fold, not independent feature cards. No decorative images are needed.

```
OutingFold                                             How it works
Turn park notes into a pocket field guide.
[source form, 34%]       [actual paper preview, 66%]
place / source / notes  | Plan the visit | Look and listen |
[Select with Gemma]     | Care & cautions | Field notes    |
status                 [Review selected + omitted source blocks]
                       [confirm review] [Save offline] [Print]
```

Desktop: max-width 1240px, 32px gutters, 26px gap, source column min 290px, preview fluid. Mobile: one column below 820px; paper panels stack for reading and retain 2x2 only in print. No sticky overlay. Keyboard focus stays visible. Busy, error, recorded and local-run states have distinct copy. The primary action is context-dependent: select, review, then save/print. No automatic output or fabricated success.

## Tokens and components
Canvas #f4f4ec; paper #ffffff; ink #203c2e; muted #59665d; rule #bdc8b9; accent #245b3f; warning #813c25. Georgia for paper/title, system sans for controls, system monospace only for source IDs and timestamps. Body 16px/1.5; labels 13px/1.4; page heading 36px/1.1; panel headings 21px/1.15. Solid rectangular buttons with 4px radius, 44px minimum touch height; no badges, pills, ornamental icons, gradients or animation. Paper fold uses dashed print guides with an outer thin rule. Source review is a list, with checkboxes and native category selects. Print is monochrome with no background dependency.

## Required checks
Source matching and order; unknown IDs; duplicate/reassigned IDs; malformed JSON; whitespace offsets; HTML injection in text/title/URL; no unsafe href; missing groups; omitted cautions visible; stale-result invalidation; source and card size limits; recorded provenance; API body/origin/host validation; loopback binding; model-unavailable error; keyboard flow; mobile overflow; offline export without network; paper print layout. Model evaluation is bounded and registered before inference. No outdoor field trial is claimed.
