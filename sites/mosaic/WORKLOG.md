# Worklog

## 2026-10-16 — dist rebuilt for Netlify (current version)

- **What:** `dist/` recreated from scratch: `index.html`, `mosaic.js`, `analysis.js`, `ui.js`, `assets/runner.webp` (296 KB; the old `video.js` is gone); `mosaic-dist.zip` 242 KB, index.html at the root.
- **Why:** previous dist still had the video mode and the old UI.
- **Verified:** served `dist/` alone on :8744: all 4 files 200, 6682 tiles, 19 sliders, view toggle / Open / Download present, `exportPNG()` → image/png 17.8 MB, no errors (only the browser's `/favicon.ico` 404). `unzip -l` lists 6 entries. Not deployed by me.
- **Left:** dist is still a manual copy; no favicon.

## 2026-10-16 — Motion pass (Kowalski / Krehel rules), single view toggle

- **What:** `index.html` styles rewritten for motion: section header fixed at 28px, spacing above the first control moved inside the collapsing part (`.sec-body::before` + gap); collapse = grid rows + content fade/−6px, drawer curve, 260ms open / 200ms close; chevron `rotate` on the same curve; buttons press `scale: 0.97` (100ms in, 160ms out), named transition properties; hover only under `(hover: hover) and (pointer: fine)`; slider hover brightening via a fading overlay (gradients don't interpolate); drop overlay fades; card radius 23 (= 13 + 10, concentric), zoom bar 40px tall; `prefers-reduced-motion` keeps fades, drops movement. `ui.js`: double-click reset eases the fill (240ms), drag/keys stay instant. `mosaic.js`: one view toggle with both icons in the DOM cross-fading (scale .25→1, blur 4→0, `cubic-bezier(0.2, 0, 0, 1)`, 220ms); camera moves from buttons/Fit/double-click ease over 220ms (zoom in log space); wheel, drag and key 0 stay instant and cancel a running move.
- **Why:** user: check micro-animations against Emil Kowalski's and Jakub Krehel's skills; section contents jerked on collapse; one icon for the view switch. Sources: github.com/emilkowalski/skill (emil-design-eng SKILL.md), github.com/jakubkrehel/make-interfaces-feel-better (SKILL.md).
- **Verified:** before: on click the header lost 8px instantly and the first slider jumped 101.9 → 93.9 in one frame. After (rAF trace): header 28px in every frame, slider moves 6px total, max 1.8px/frame, card 316 → 50 smoothly, opacity 1 → 0. Icon cross-fade frames interpolate opacity/scale/blur; "+" eases 80 → 100%, Fit eases back and lights up. No errors. Reduced-motion and press scale not exercised (no emulation / real pointer). No automated tests.
- **Left:** card radius is 23, not 20, to keep radii concentric; `dist/` and the zip are stale.

## 2026-10-16 — Fit centred in the window; Open/Download without wrappers

- **What:** `mosaic.js`: `freeW` and the menu-width offset removed; fit scale and centre use the whole window, zoom buttons zoom around the window centre. Open/Download buttons are inserted straight into the menu (`#open` first, `#save` last). `index.html`: `#head`/`#savebar` cards removed; `#open`/`#save` 40px, radius 16; `#open` has the card background + 32px blur; `#save` is the sticky bottom item.
- **Why:** user: centring left of the menu was a leftover; the buttons don't need a card around them.
- **Verified:** browser pane: image margins 141px left and right in a 995px window; menu children open → controls → err → save; Download bottom 965 = 977 − 12; no errors. No automated tests.
- **Left:** `dist/` and the zip are stale.

## 2026-10-16 — View icons in the zoom bar, sticky Download card, +4 radii, superellipse corners

- **What:** `mosaic.js`: top card = "Open image" only; "Download PNG" in its own `#savebar` card; view switch = two icon buttons (Mosaic / Original) at the left of the zoom bar, Cells only on key 3 (4–6 internal maps); `segmented` no longer imported. `index.html`: `#savebar { position: sticky; bottom: 0 }` inside the scrolling menu; every radius +4 (cards 20, sliders/buttons 13, zoom bar 16 / its buttons 12, drop 20); `corner-shape: superellipse(2)` on all elements; icon and separator styles.
- **Why:** user: simpler view switch as icons next to zoom, Open on top, Download as the bottom card that behaves like a card when the menu fits and sticks to the bottom inset when it doesn't; rounder squircle corners.
- **Verified:** Chrome 152 in the pane supports `corner-shape: superellipse(2)` (computed). Menu tall: Download bottom at 965 = 977 − 12, menu scrolls; menu short (sections collapsed): Download 10px after the last card. Radii computed 20/20/13/13/16. Original icon switches the canvas (pixel 218,175,140 → 182,143,99) and back. No errors. No automated tests.
- **Left:** `dist/` and the zip are stale; `.seg` styles and `segmented()` remain unused.

## 2026-10-16 — English UI, black page, lighter controls, PNG download; video mode removed

- **What:** `video.js` deleted. `analysis.js`: optical flow, warping, temporal blending in `analyze` removed. `mosaic.js`: video state `T`, frame API, warm-frame rules (split/death, colour inertia, damping, eased size/angle), colour/flow carry-over removed; row-count hysteresis (`S.m`) kept, photo uses it. Output split into screen (`resizeOutput`, camera) and export (`renderOutput({w,h,target})` into an offscreen FBO); `exportPNG` = whole image, long side 4096 px, rows flipped from GL. UI in English; first block = Open image / Download PNG + Mosaic/Original/Cells; "New layout" moved into Tiles; zoom bar bottom-left (− % + Fit). `index.html`: page and out-of-image background #000, lighter cards/tracks/fills, section titles normal case 13px, slider marker 1px.
- **Why:** user's list: English, black background, lighter controls, normal-case titles, thinner marker, cleaner first block, download button, drop video entirely.
- **Verified:** browser pane: computed body bg rgb(0,0,0), panel text only 13px, no Cyrillic text or titles, title `text-transform: none 13px`, marker `-1px inset`; `6682` tiles, no errors; `exportPNG()` → image/png 3089×4096, 17.8 MB, 630 ms, sky at the top; zoom + 70→87%, Fit back to 70%. Real download click not done by me. No automated tests.
- **Left:** `dist/` and `mosaic-dist.zip` are stale (still contain the video code); `assets/test/` (test clips, copy of the user's clip) still in the project.

## 2026-10-16 — dist for Netlify

- **What:** `dist/` = `index.html`, `mosaic.js`, `analysis.js`, `video.js`, `ui.js`, `assets/runner.webp` (306 KB); `mosaic-dist.zip` (248 KB, index.html at the root) for Netlify Drop. No build step: plain ES modules with relative imports. Test videos, user clip, koi reference, WORKLOG and `.claude` are not included. `.claude/launch.json`: added `mosaic-dist` (port 8744, serves `dist/`).
- **Why:** user wants to deploy to Netlify.
- **Verified:** served `dist/` alone on :8744: all 5 files 200, `6682` tiles, 21 sliders, no errors (only the browser's own `/favicon.ico` 404). `unzip -l` lists the 7 entries. Not deployed by me.
- **Left:** `dist/` is a manual copy, so rebuild it after source changes. No favicon.

## 2026-10-16 — Full-screen camera, floating blurred menu, no status line

- **What:** `index.html`: stage `position: fixed; inset: 0`; menu `aside` fixed top-right over it (316px, own scroll, gaps click-through), cards semi-transparent with `backdrop-filter: blur(32px)`; status line removed, `#err` only shows when non-empty. `mosaic.js`: `updateStats`/`statsEl` removed; `freeW()` = window width minus the menu; "fit" and `fitBox` centre the image in that free area while the canvas covers the whole window.
- **Why:** user: the camera area must be the whole screen with the menu on top; the picture was being cut at the menu edge. Status line not wanted.
- **Verified:** browser pane: canvas 1057×977 = window, menu at x 729–1045, computed `blur(32px) saturate(1.4)`; after zooming the picture continues under the menu and is blurred there (screenshot); dblclick fits back; no errors on the page. No automated tests.
- **Left:** fit leaves the area under the menu empty by design; on windows narrower than menu + 240px fit uses the full width.

## 2026-10-16 — Canvas camera: Option+wheel zoom, drag pan

- **What:** `mosaic.js`: `cam` (fit flag, k = CSS px per image px, centre); the canvas fills the stage and only the visible window is rendered at screen resolution (`uWin` in the site and composite shaders; composite maps screen px → image px, draws background outside the image, grout/texture noise now in image coordinates). Controls: Option/Alt + wheel and trackpad pinch (ctrl + wheel) zoom around the cursor (0.5× fit … 40×), plain wheel / two-finger scroll and drag pan, double-click and key 0 = fit, 1×/2×/3× presets keep the centre; zoom % in the status line. Video frames still render the whole image at a fixed scale, but only while processing; `fitBox` positions the frame and the preview canvas. `index.html`: stage cursor grab/grabbing, canvases absolutely positioned. `video.js`: preview box via `api.fitBox`, `T.scale` reset after load/processing.
- **Why:** user asked for proper canvas navigation; rendering the visible window keeps deep zoom sharp instead of upscaling a capped bitmap.
- **Verified:** browser pane: user dragged the image (pan works, 78% kept); 12 synthetic Alt+wheel notches → 1386%, crisp tile edges by screenshot, "Вписать" un-highlighted; dblclick → 78% + "Вписать"; video: frame canvas 1440 px fitted during processing, full stage after, preview canvas fitted; no console errors. Real mouse/trackpad zoom not tried by me. No automated tests.
- **Left:** wheel zoom speed is a guess (~27% per mouse notch); no pan/zoom on the video preview canvas.

## 2026-10-16 — Panel cleanup: fewer settings, fill-bar sliders, two type sizes, collapsible blocks

- **What:** new `ui.js` (fill-bar `slider` with drag/arrows/double-click reset, `section` collapsible with state in localStorage, `segmented`, `button`, `colorRow`). `index.html` rewritten: cards, 13px/11px only, view and zoom as segmented switches. `mosaic.js`: SCHEMA cut to 18 sliders + grout colour in 3 blocks (Тессеры / Ряды и контуры / Поверхность), `to/from` mapping so "Детализация" and "Контуры" read higher = more; ↻ button = new seed; keys 1–6 switch views (4–6 = debug maps, no longer in the UI); compact stats line. Outline is one "Обводка" slider (0 = off): `outlineRows` 1, `outlineStrength` 0. `video.js`: panel on the same components; one "Стабильность" slider drives both inertias (edge = 0.4 + 0.6v, colour = v; 0.5 = previous defaults); iterations per frame fixed at 4.
- **Removed from UI, fixed in P:** detailBlur 12, sizeJitter 0.12, edgeBlur 3, edgeMinLen 80, block on, guard 4, rowsReach 40, seamAlign 1, angleJitter 0.08, outline side/min length/min contrast, irrFreq 1.25, iterations 30, seed (→ ↻ button).
- **Verified:** browser pane: only 13px and 11px computed in the panel; drag set grout 3.8, double-click reset to 0.7; section collapse/expand + stored state; video panel processed 24 frames from the new buttons; clean reload `6682 тессер`, no console errors. No automated tests.
- **Left:** sliders don't re-sync when P is changed from the console; the ✕ close button was clicked but its result was not read back (same handler as the old "К фото", verified earlier).

## 2026-10-16 — Exported WebM → MP4 (outside the project)

- **What:** `~/Downloads/mosaic.webm` → `~/Downloads/mosaic.mp4`: H.264, CRF 16, yuv420p, faststart, no audio, re-timed to exactly 24 fps (`setpts=N/24/TB`). `mosaic (1).webm` is an identical duplicate (same MD5), left untouched.
- **Why:** user asked for an MP4 without audio. MediaRecorder writes real-time, uneven timestamps (nominal 60 fps, 11.465 s for 276 frames); re-timing by frame number removes that jitter.
- **Verified:** ffprobe: one video stream, 1440×1080, 24/1, 276 frames, 11.500 s, 51.2 MB; frames 60 and 200 checked visually.
- **Left:** file is large because of the mosaic texture; CRF 20–22 would roughly halve it if needed.

## 2026-10-16 — Video mode on the user's clip; seek fixes

- **What:** `video.js`: `loadVideo` fetches non-blob URLs into a Blob before playing; `grabAt` re-seeks with a pause (up to 3 retries) when a grabbed frame is bit-identical to the previous one and counts such frames in the status. User clip copied to `assets/test/user-clip.mp4` (960×720, 30 fps, 11.5 s, knight falling off a horse, no hard cuts: max ffmpeg scene score 0.14); `assets/test/test-dup.mp4` (12 fps upsampled to 24) added for the duplicate path.
- **Why:** the first 4 s run produced 96 identical frames. Cause: `python -m http.server` has no HTTP Range support, so the element was non-seekable (`seekable` = [0, 0]) and every seek stayed on frame 0. Files opened via the "Видео…" button are blob URLs and were not affected.
- **Verified:** after the fix `seekable` = [0, 1], `currentTime` advances; whole clip 276 frames @24 fps in 149 s (535 ms/frame), 1 frame flagged as a duplicate; tile density matches a cold layout of the same frame (3839 vs 3877); frames follow the fall (screenshots of frames 24–95, full-res crop of frame 76). No automated tests.
- **Left:** flicker on this clip not measured separately (the motion is large); WebM not exported in this check (needs a download from the page).

## 2026-10-16 — Video mode (offline, frame by frame)

- **What:** new `video.js` (panel, seek + grab, per-frame pipeline, frames stored as WebP blobs, preview at target fps, WebM export via MediaRecorder). `analysis.js`: `opticalFlow` (dense pyramidal Lucas–Kanade at 1/4 res, box-filter windows; global motion = median over textured pixels), `flowAt`, `warpBack`, `warpMask`, `lumOf`; `analyze(img, P, prev)` blends warped prev maps and keeps last frame's contour pixels at the weak threshold (temporal hysteresis). `mosaic.js`: `setImage`, `beginFrame` (cold layout or warm: advect tiles by flow, drop those leaving the frame), `relax`, `renderFrame` (fixed output scale), `exitVideo`; warm-frame rules: split/death by cell area, colour inertia, size/angle eased as tile state, weakened row attraction with frozen row width, Lloyd moves damped with a 0.5 px deadband; swirl guides move with global motion. `index.html`: "Видео…" button, panel, wrapping header row, disabled-button style. Test clips: `assets/test/test-pan.mp4`, `assets/test/test-static.mp4` (ffmpeg from runner.webp).
- **Why:** user asked for a video mode. Re-running the photo pipeline per frame re-lays every tile and flickers.
- **Verified:** LK on known shifts (2,0)/(5,0)/(0,−3)/(10,4) → median 1.98/5.09/−2.88/(9.97,3.97), global (2.00/5.11/−2.90/(10.02,3.99)), 54–71 ms. Static clip, share of pixels changing >60 levels between frames: cold re-layout 18.7%, final warm 3.95% (mean diff 12.99 → 3.91). Pan clip 48 frames ≈ 925 ms/frame; tiles follow the motion (frames 30/31/47 compared by screenshot). Export: WebM VP9, 2.76 MB, 1.96 s for 48 frames @24 fps. Photo mode reloads clean, no console errors. No automated tests.
- **Found on the way:** seeking exactly to i/fps returned the previous frame in Chrome → seek to (i+0.5)/fps. Lloyd never fully converges with row attraction + seam alignment (≈0.43 px/iteration at 60 iterations); row-count hysteresis now also applies in photo mode (6678 → 6682 tiles on the default image).
- **Left:** not real-time (~0.9 s/frame at 1024×1280); no fade-in for born tiles; scene cuts are not detected (a cut gets advected, not re-laid); outline component selection has no temporal hysteresis; export is recorded in real time, so the tab must stay visible; not tested on a real user video yet.

## 2026-10-16 — Default grout 0.7, light 0.75

- **What:** `mosaic.js` defaults: `grout` 0.6 → 0.7, `light` 0.25 → 0.75.
- **Why:** user's correction to the saved defaults.
- **Verified:** reloaded; `P.grout` 0.7, `P.light` 0.75, the sliders show the same; no console errors.
- **Left:** nothing.

## 2026-10-16 — Save user's tuned settings as defaults

- **What:** `mosaic.js` `P` defaults replaced with the values the user had set in the browser: minSize 5, guides 3, outlineStrength 0.53, aspect 2.85, roundness 9.6, irregular 0.17, irrFreq 1.25, grout 0.6, groutVar 0.82, bevel 1, light 0.25, colorVar 0.3, groutColor #181716, hueVar 7, litVar 0.01 (the rest unchanged).
- **Why:** user asked to keep the current slider state as the default look.
- **Verified:** read `mosaic.P` and all slider values from the page (they matched), reloaded, compared: all 35 parameters match; no console errors; `тессер: 6678`.
- **Left:** nothing.

## 2026-10-16 — Per-tile hue/lightness jitter, uneven grout width

- **What:** `mosaic.js`: `adjustOklab` (replaces `darkenOklab`) applies per-tile random lightness shift ("Разброс светлоты"), hue rotation plus a faint random tint ("Разброс оттенка, °"), then outline darkening, all in OKLab. The composite shader no longer does per-tile brightness jitter ("Разброс цвета смальты" renamed "Фактура поверхности", micro-texture only). Grout half-width is now per tile (hash of the tile's random) plus slow positional noise ("Разброс ширины шва").
- **Why:** user asked for more hue/lightness randomness (reference: Byzantine face mosaic, where neutral tiles also vary in hue) and for slightly uneven seams without complicating the algorithm. A per-tile half-width needs no neighbour lookup, and the seam = sum of both halves, so it varies pair to pair.
- **Verified:** browser pane, no console errors; 300% 1:1 A/B: all three at 0 vs groutVar 1 / hue 25° / lightness 0.1 — visible hue spread (greens/ochres/pinks in the grass) and thick/thin seams. Defaults: hue 14°, lightness 0.06, grout spread 0.4. No automated tests.
- **Left:** grout width varies per tile, not per seam segment, so one tile's entire perimeter is uniformly thinner or thicker (softened by the positional noise).

## 2026-10-16 — Fix jagged "teeth" on tile borders near contours

- **What:** `mosaic.js`: the edge field texture is now RGBA16F (distance + central-difference gradient). The site-shader visibility test flags a ray as blocked only when the gradient flips between two samples near the edge (`crossed`), and checks the final sample at the pixel itself; the old rule "blocked if distance < 0.6 px" is gone; up to 64 steps (was 40).
- **Why:** with the old threshold, rays running almost parallel to a contour came out blocked or visible depending on sub-pixel distance, so neighbouring rays alternated and the cell map got radial streaks that rendered as teeth at high zoom. Confirmed by toggling "Ячейки не пересекают контур" off on the same layout: the teeth disappeared.
- **Verified:** browser pane at 300%, canvas pinned 1:1 to output pixels, same area as the user's screenshot: no teeth, tiles still do not cross the figure silhouette; no console errors; Lloyd step gpu 23 ms (was ~21 ms). No automated tests.
- **Left:** a ray passing within ~0.3 px of an open contour's tip may still be flagged (possible single tooth at a contour end); not observed.

## 2026-10-16 — Mosaic v2.1: outline only on significant silhouettes, OKLab darkening

- **What:** `analysis.js` labels surviving contours (`compId`, `compLen`, `compMag` = mean gradient). `mosaic.js`: `computeOutlineField` builds a separate EDT from components passing "Мин. длина силуэта" and "Мин. контраст силуэта"; `outlineWeight` uses it; `darkenOklab` lowers OKLab lightness and keeps a/b (replaces mixing toward a fixed outline colour, picker removed); outline off by default (`outlineRows: 0`); selected silhouettes drawn orange in the "Контуры и ряды" view; stats show silhouette count.
- **Why:** user found the outline made the image worse. Comparison at 200% showed: inner folds and grass contours turned into dark blotches, and the fixed dark brown made tiles look grey. Seam alignment was checked separately and was not the cause.
- **Verified:** browser pane, no console errors; defaults select `силуэтов: 6 из 103` (figure back + arm line, no grass); with 1 row at 0.6 the tiles keep their warm hue (screenshot). No automated tests.
- **Left:** the head contour does not pass (brown on dark blue, low gradient); the outline row is still per-tile and can be ragged, because it is not laid as a separate continuous row.

## 2026-10-16 — Mosaic v2: outline rows + seam alignment

- **What:** `mosaic.js`: `halfGap` (gradient ascent on the row distance field to the medial axis / frame), `rowSpacing` (row width snapped so a whole number of rows fills the half-gap, blended by "Выравнивание швов"), per-site `wk` spacing factor applied to tile size; `outlineWeight` + `uploadColors` (first N rows along real contours tinted to outline colour, side chosen by luminance mirrored across the contour); new "Обводка контуров" group and `select` control; rows debug view uses corrected spacing. `analysis.js`: blurred luminance `lum`.
- **Why:** rows from neighbouring guides met with fractional leftovers, so seams were bands of wedge tiles; dark outline rows give silhouettes the Byzantine "drawn" contour.
- **Verified:** browser pane, no console errors; `тессер: 8552`; Lloyd step cpu 10.2 ms (was 5.5), gpu ~21 ms; side switch light/dark checked by screenshot. No automated tests.
- **Left:** a row still ends in a step where the row count in the half-gap changes; outline also lands on all grass contours (controlled by edge threshold).

## 2026-10-16 — Mosaic shader v1

- **What:** WebGL2 demo that turns an image into a mosaic. `analysis.js` (CPU: color-detail map, Di Zenzo + Canny edges, exact EDT, tangent field, fbm), `mosaic.js` (weighted anisotropic Voronoi via instanced quads + depth test, Lloyd relaxation with GPU readback, JFA border distance, grout/bevel composite, slider UI, debug views), `index.html`, `assets/runner.webp`, `.claude/launch.json`.
- **Why:** tile size follows local color detail; tiles never straddle contours (sphere-traced visibility against the edge EDT); rows of tiles follow offset curves of "guide" curves = real contours + fbm iso-lines far from contours (andamento / opus vermiculatum → musivum).
- **Verified:** served with `python3 -m http.server 8743`, opened in the browser pane; no console errors; stats `тессер: 8574 · Ллойд: готово · анализ: 223 мс`; Lloyd step ~25–40 ms (inst 1–2 ms, GPU+readback 19–31 ms, CPU 5–7 ms). Checked all views by screenshot. No automated tests.
- **Left:** grout/bevel width is in image px, so it scales with zoom; rows seam at medial axes between guides; no PNG export; sliders don't re-sync if params are changed from the console.
