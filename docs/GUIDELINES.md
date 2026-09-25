# Guidelines

How to work in this codebase.

## Boundaries

**React does not touch three.js.** Engine classes in `src/engine/` are plain
TypeScript. `Viewport.tsx` owns their lifecycle and pushes store slices in
through `useEffect`. If a panel needs the renderer, it goes through
`engine.stage` from `handle.ts` — it does not import three.

**The store is the single source of truth.** Anything the renderer shows is
derived from it. Drag-to-rotate, dial edits and timeline scrubbing all write to
the store; the renderer reads. This is what keeps the dials in step with a drag
without a special case.

**Everything animatable is a number in a serialisable slice.** If it cannot be
written to JSON and merged over a default, it does not belong in `Project`.

## Adding state

1. Add the field and its default in `src/engine/types.ts`.
2. If the slice is nested, make sure it goes through the recursive merge — a
   shallow spread silently drops later additions.
3. If you rename or move anything, write a `migrate*` beside `migrateLighting`.
   **Never bump `STORAGE_KEY`**; that throws away the user's project.
4. `PROJECT_KEYS` is the one list persistence, export and import all derive from.

## Adding a control

Use the primitives in `src/ui/kit.tsx` — `Section`, `Row`, `Slider`,
`NumberInput`, `Segmented`, `ColorField`, `FileButton`. They already handle
strings, enums and booleans.

**Do not route non-numeric values through DialKit's sync.** Its `near`/`differs`
helpers are numeric-only; a single colour makes `differs` return true forever and
produces an unbounded store↔dial loop with debounced writes behind it.

## Adding to the render path

Anything that must appear in an export has to be drawn **inside the WebGL
canvas**. A DOM element behind the canvas will look right on screen and vanish
from every exported file.

Anything derived from the device transform, camera or frame goes in
`Stage.relayout()`, not in `applyStage` — export calls `applyTransform` per frame
but never `applyStage`.

## Asynchronous work

`Stage.render()` is synchronous and must stay that way. Media that rasterises
asynchronously gets two paths: a fire-and-forget `seek()` for the preview, where
being a few milliseconds behind is invisible, and an awaited `prepare()` that
export uses before capturing. `LottieLayer` is the worked example.

**Never introduce an `await` between a render and its capture.**

## Performance

The rAF loop runs every frame and calls `relayout()`. Anything you put on that
path costs 60 times a second. Before measuring anything on the renderer from the
console, set `exporting: true` to stand the loop down — otherwise it overwrites
the value under test between your assignment and your read. That mistake has
already produced one round of invalid measurements.

## Verification

State results, not intentions. Before claiming something works:

- Run it in the browser, not just `tsc`.
- Prefer a swept invariant over a spot check.
- For anything visual, read pixels back rather than eyeballing a screenshot —
  a legitimate silhouette edge and a clipping bug look identical at a glance.
- For export, decode the file you produced.

`npx tsc --noEmit -p tsconfig.app.json`, `npx oxlint src` and `npm run build`
should all be clean. One `exhaustive-deps` warning in `Dials.tsx` is deliberate
and documented in place.

## Comments

Explain **why**, and only where the reason is not evident from the code. The
valuable comments in this codebase are the ones recording a trap: why the
background is a WebGL pass, why the timeline is seeked rather than played, why
`shadowSide` is pinned. Do not narrate what the line already says.

## Git

The default branch is `main` and Vercel deploys from it automatically — a push
is a deploy. Commit only when asked.

## Tests

Vitest, `npm test` in `app/`. Adopted late — most of the codebase predates it
and is covered only by browser verification. That is the honest state, not a
target to defend.

**From here, new behaviour is test-first.** Write the failing test, watch it
fail for the right reason, then write the smallest thing that passes it. A test
that passes the moment you write it has proved nothing: it may be asserting the
arithmetic rather than the code. One was caught doing exactly that —
`1 + 0.30000000000000004` lands on exactly `1.3`, so a quantisation test built
on it passed without quantisation existing. `0.1 + 0.2` does drift, and the
rewritten test failed properly.

**A module that cannot be imported outside a browser cannot be tested.** The
theme was applied at module scope in `state/theme.ts`, which reached `document`
the moment anything imported the store and put the whole state layer out of
reach. It is now `initTheme()`, called from `main.tsx`. Keep side effects out of
module scope for the same reason.

Pure logic belongs in `engine/` where it can be tested directly; the thin
adapter that wires it to a pointer event is browser-verified. Say which is
which when reporting.

### Characterisation tests, and proving them

Tests written after the code pass the moment they are written, so "watch it
fail" cannot be the proof they test the right thing. `npm run test:mutate` is
the substitute: it breaks each function on purpose and checks the suite
notices. A new characterisation test should come with a mutant that it catches.

A survivor is one of two things, and the difference matters:

- **A gap** — the behaviour is untested. Add the test.
- **An equivalent mutant** — the code cannot behave differently, so nothing
  could catch it. `sanitisePreset` cannot let an unknown track through, because
  it walks the registry rather than the input. The honest response was to
  rename the test to claim only what it pins, not to invent an assertion.

**The undo coalescing window is module state and leaks between tests.** A test
that resets the history stack with `setState` still inherits the previous
test's open run, and its first edit folds into nothing. `beforeEach` goes
through an action first to close the run.
