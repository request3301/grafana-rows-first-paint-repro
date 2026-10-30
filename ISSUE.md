<!-- Draft for https://github.com/grafana/grafana/issues/new (bug report). Root cause is in grafana/scenes. -->

**Title:** Dashboards: RowsLayout paints all row titles without their panels while the dashboard loads

### What happened?

When a dashboard that uses the v2 `RowsLayout` loads, Grafana first paints every row header with an empty grid.
The page shows only a list of row titles. After that, all panels appear at once.
With 22 rows / 132 panels this frame stays on screen for 0.6–1.3 s on a desktop and ~4 s with 4x CPU throttling.
This is common for kiosk/TV clients. In kiosk mode the chevrons and navigation are hidden, so it looks like a page of
plain text.

![row titles without panels](https://raw.githubusercontent.com/request3301/grafana-rows-first-paint-repro/main/docs/row-titles-without-panels.png)

### What did you expect to happen?

Row headers and their panel grids are painted in the same frame, as with classic dashboards that use
`SceneGridRow`.

### Did this work before?

Classic (v1) dashboards with rows don't show it. It happens with every v2 `RowsLayout` dashboard we tried, on 13.1.0 and 13.3.0.

### How do we reproduce it?

Repository: https://github.com/request3301/grafana-rows-first-paint-repro

1. `docker compose up -d` (stock `grafana/grafana:13.3.0`, TestData, a generated v2 dashboard with 22 rows x 6 panels)
2. Open http://localhost:3000/d/rows-first-paint with DevTools CPU throttling 4x and the cache disabled, then reload.
3. Or run `npm install && npx playwright install chromium && npm run repro`. It checks every animation frame and
   reports frames where row headers are present but none of their grids are rendered:
   ```
   run 1: BUG - 22 row titles painted without any grid for 644 ms
   run 2: BUG - 22 row titles painted without any grid for 865 ms
   run 3: BUG - 22 row titles painted without any grid for 962 ms
   ```

### Root cause

`SceneGridLayoutRenderer` (`@grafana/scenes`) uses react-use `useMeasure()` for the grid width.
`useMeasure` reports the size only from a `ResizeObserver` callback, so on mount `width === 0` and `renderGrid()` returns `null`.
The update triggered by the observer is applied only after the browser has painted. In a `RowsLayout`, every row
renders its header and its own `SceneGridLayout`, so the first paint has all headers with 0-height grids. All grids
and panels are then rendered in a single long task, and the titles-only frame stays visible until it ends.

### Suggested fix

Measure the wrapper synchronously in `useLayoutEffect`, before paint, and keep a `ResizeObserver` for later
changes. Diff against `grafana/scenes` main (new `useMeasureBeforePaint` hook + tests; typecheck, lint and the full
scenes test suite pass):
https://github.com/request3301/grafana-rows-first-paint-repro/blob/main/proposed-fix/scenes-SceneGridLayoutRenderer.diff

We tested the same change as a yarn patch of `@grafana/scenes@8.2.6` on a Grafana v13.1.0 source build.
The titles-only frame no longer appears (0 of 5 runs at 1x/4x CPU, and on our production dashboards).
Panel geometry is unchanged for load, resize, row collapse/expand and view panel.
Time to panels is the same or better (10.4 s vs 13.1 s at 4x CPU on a 131-panel dashboard).
Happy to open a PR in grafana/scenes.

### Is the bug inside a dashboard panel?

No, it is in the dashboard layout (`RowsLayout` / `SceneGridLayout`).

### Environment

- Grafana: 13.1.0 and 13.3.0 (OSS docker images); `@grafana/scenes` 8.2.6 and current `main` (useMeasure still used)
- Browser: Chromium (headless and desktop), Chrome
- OS: Linux (Docker)
- Datasource: TestData (any datasource)
