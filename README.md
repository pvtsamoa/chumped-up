# CHUMPED UP

Static, browser-only CHUMP image generator for the X community.

## Workflow
1. Add an image.
2. The image is processed in-browser with background removal, then composited onto a neon-green `#00C805` background.
3. Position / scale the base photo and optionally lock it.
4. Optionally toggle the fixed rooster-C ring frame overlay (always rendered on top).
5. Add any number of:
   - Beak: Closed / Open
   - Tie: Straight / Flying
   - Feather: Orange CHUMP / Green Robinhood-CHUMP
6. Add one movable `+1 $CHUMP` badge.
7. Select objects by tapping/clicking them on the canvas or from Layers.
8. Edit each object independently:
   - Drag to move
   - Pinch to resize on touch devices
   - Two-finger twist to rotate on touch devices
   - Size and rotation sliders with `− / +` fine controls
   - Left/right and up/down perspective tilt sliders
   - Fine position nudges and center
   - Flip horizontally
   - Lock / unlock
   - Duplicate (except badge)
   - Bring forward / send backward
   - Reset / delete
   - Tie length control
9. Undo / redo.
10. Use **Preview Final** to inspect the clean image without editing guides.
11. Export:
   - CHUMPIFY & POST: 1080 × 1080
   - USE AS X PFP: circular safe-area editing preview, 400 × 400 square download

## Mobile editing
The editor uses the same tools on desktop and mobile. On smaller screens the image preview stays visible while the controls scroll underneath it. The padded border around the canvas is a safe touch area for page scrolling so the image or CHUMP parts are not moved accidentally.

## X PFP note
The circle is an editing preview only. The downloaded profile image remains square. The PFP exporter checks the 2 MB limit; if a PNG exceeds it, it falls back to JPEG.

## Privacy
The selected image is processed only in the visitor's browser. There is no account, upload endpoint, database, gallery, or saved image history. Closing/reloading the page discards the edit unless the user downloaded it.

Background removal model/runtime files are served from this repository (`assets/vendor/`) so no third-party inference endpoint is used.

## Deployment
No build step and no backend are required. Deploy the repository root to any static host such as Netlify.

## Files
- `index.html`
- `styles.css`
- `app.js`
- `assets/`
  - `chump-banner.jpg`
   - `chump-ring-emblem.png`
  - `beak-closed.png`
  - `beak-open.png`
  - `tie-straight.png`
  - `tie-flying.png`
  - `feather-orange.png`
  - `feather-green.png`
  - `plus1-chump.png`
   - `vendor/`
      - `background-removal/`
      - `background-removal-data/`
      - `onnxruntime-web/`
