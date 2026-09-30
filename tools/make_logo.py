"""Crop and shrink the Made with Love logo for embedding.
Usage: python3 tools/make_logo.py path/to/logowhite.PNG   (writes assets/logo-white.png)
The original is a 4000 x 4000 canvas with the wordmark in the middle; this trims the empty margin
and scales it to 640 px wide, which is sharp on retina screens and in print, at a fraction of the size."""
import sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "logowhite.PNG"
out = sys.argv[2] if len(sys.argv) > 2 else "assets/logo-white.png"
im = Image.open(src).convert("RGBA")
l, t, r, b = im.split()[3].getbbox()
pad = int((r - l) * 0.02)
im = im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))
w = 640
im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
im.save(out, optimize=True)
print(out, im.size)
