# TUI visual target

The supplied Local Agent Control mockup is the visual direction for the terminal UI.

## Layout

1. Dense top telemetry bar: lane counts, selected model/reasoning/context and PTY count.
2. Three independently scrollable lane cards across the upper workspace. Each card has its own accent, state, goal, model/profile, cwd, baton health and transcript/action stream.
3. Lower-left activity log for cross-lane events.
4. Lower-middle lane overview and active-lane messages/context.
5. Lower-right tools/working-directory/context/model metrics panel.
6. Full-width command input and compact keyboard-help footer.

The Blessed implementation cannot reproduce browser CSS, rounded corners or pixel-level graphs exactly. It should reproduce the information hierarchy, density, accents, borders, scrolling and focus behaviour rather than imitate unsupported decoration.

## New control surfaces

PTY sessions and agent substitution remain modal overlays initially. Qualification/champion status will live in the lower-right metrics panel. Unassigned PTYs must never be silently assigned to a work lane.
