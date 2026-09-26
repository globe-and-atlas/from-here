# Decisions

## Initial Decision

- Template profile: `hybrid-geospatial`
- Deploy target: `iis`
- Runtime: `hybrid`

## 2026-09-26 From Here architecture
- **Phone draws, watch shows.** Each view is drawn on the phone into a 2-bit image. The watch draws the image plus overlays. This keeps geography out of watch memory and avoids watch-side trig, which has caused physical-watch bugs in time-at-hand. Alternatives were sending vector geometry, or tiles the watch projects itself.
- **One place grid instead of line data.** Tiles hold a 0.02° place-id grid, and borders and coasts come from id changes. 0.02° matches Natural Earth 1:50m's own precision. The golden Hour frame differs from Natural Earth by 0.28% of pixels.
- **Hosting.** Static tiles on GitHub Pages, per the user (2026-09-26). Alternatives were a Vercel API or bundling data in the phone app.
- **Coordinates are 24-hour** because the hour is the degree.
- **Open water rule:** under 5% land in the default frame shows the Day view. This is tunable. At 12:00 heading SE from Spring the Hour frame is exactly 5% land (Cuba, Central America), so it stays on Hour.
- **Offline:** the watch persists home, direction and default view. With no tiles, the phone sends home only, not an "Open water" day.
