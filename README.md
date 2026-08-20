CHUMPED UP
==========

Static, browser-only CHUMP image generator for the X community.

WORKFLOW
1. Add an image.
2. Position / scale the base photo and optionally lock it.
3. Add any number of:
   - BEAK: Closed / Open
   - TIE: Straight / Flying
   - FEATHER: Orange CHUMP / Green Robinhood-CHUMP
4. Add one movable +1 $CHUMP badge.
5. Edit each object independently:
   - Move
   - Size (10%–300%)
   - Rotate
   - Turn left / right
   - Tilt up / down
   - Flip horizontally
   - Duplicate (except badge)
   - Bring forward / send backward
   - Reset / delete
   - Tie length control
6. Undo / redo.
7. Export:
   - CHUMPIFY & POST: 1080 × 1080
   - USE AS X PFP: circular safe-area preview, 400 × 400 square download

X PFP NOTE
The circle is an editing preview only. The downloaded profile image remains square.
The PFP exporter checks the 2 MB limit; if a PNG exceeds it, it falls back to JPEG.

PRIVACY
The selected image is processed only in the visitor's browser.
There is no account, upload endpoint, database, gallery, or saved image history.
Closing/reloading the page discards the edit unless the user downloaded it.

DEPLOYMENT
No build step and no backend are required.
Upload this folder to a normal static web host, e.g. /chumped-up/ on cc21b.meme.

FILES
index.html
styles.css
app.js
assets/
  chump-banner.jpg
  beak-closed.png
  beak-open.png
  tie-straight.png
  tie-flying.png
  feather-orange.png
  feather-green.png
  plus1-chump.png
