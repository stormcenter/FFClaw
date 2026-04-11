#!/usr/bin/env python3
"""
Generate GIF previews for ASS animation effects.
Uses Pillow (PIL) with a fixed global palette so all frames
share the same color table — essential for smooth fade animations.
"""

import os
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 320, 180
DURATION = 100      # ms per frame (10fps)
TOTAL_FRAMES = 30  # 3 seconds total

ASSETS_DIR = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(ASSETS_DIR)), 'assets', 'fonts')
OUTPUT_DIR = ASSETS_DIR

# Fixed 256-entry RGB palette shared by ALL frames.
# 0: black (background)
# 1: white (full-opacity text)
# 2..253: grey gradient from dark→light (for fade)
# 255: yellow (karaoke highlight)
_fixed_palette = bytearray(256 * 3)
_fixed_palette[0:3]          = [0, 0, 0]           # 0: black
_fixed_palette[3:6]          = [255, 255, 255]    # 1: white
for i in range(2, 254):                           # 2..253: grey gradient
    grey = max(1, int(255 * (i - 1) / 252))
    _fixed_palette[i*3:i*3+3] = [grey, grey, grey]
_fixed_palette[255*3:255*3+3] = [255, 220, 0]    # 255: yellow


def _get_font(size=28):
    for p in [
        os.path.join(FONTS_DIR, 'NotoSansCJKsc-Regular.otf'),
        os.path.join(FONTS_DIR, 'Roboto-Regular.ttf'),
        '/System/Library/Fonts/STHeiti Light.ttc',
        '/System/Library/Fonts/PingFang.ttc',
        '/System/Library/Fonts/SFNSText.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def _render_rgb(text, grey, y_off=0):
    """Render one RGB frame (black background, grey text)."""
    img = Image.new('RGB', (WIDTH, HEIGHT), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = _get_font(28)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((WIDTH - tw) // 2, (HEIGHT - th) // 2 + y_off),
              text, font=font, fill=(grey, grey, grey))
    return img


def _render_karaoke_rgb(words, sung_count):
    """
    Render karaoke frame. sung_count is a float (0..4).
    Each character has its own brightness based on how 'sung' it is:
      - If wi < sung_count: word is fully yellow
      - If wi is near sung_count: partially yellow (interpolated)
      - Otherwise: grey
    """
    img = Image.new('RGB', (WIDTH, HEIGHT), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = _get_font(36)
    total_w = sum(draw.textbbox((0, 0), w, font=font)[2] for w in words)
    x = (WIDTH - total_w) // 2
    y = (HEIGHT - 36) // 2
    for wi, word in enumerate(words):
        if wi < sung_count - 1:
            # Fully sung: bright yellow
            color = (255, 220, 0)
        elif wi < sung_count:
            # Partially sung: interpolate yellow→grey
            t = sung_count - wi  # 0..1
            g = max(0, int(150 * (1 - t)))
            color = (255, 220 - g, 0)
        else:
            # Not yet sung: dark grey
            color = (80, 80, 80)
        draw.text((x, y), word, font=font, fill=color)
        bbox = draw.textbbox((x, y), word, font=font)
        x = bbox[2]
    return img


def _quantize_to_palette(rgb_img):
    """Convert RGB PIL Image to P-mode using our fixed 256-color palette."""
    p = rgb_img.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    p.putpalette(bytes(_fixed_palette))
    return p


def _save_gif(frames, rel_path):
    path = os.path.join(OUTPUT_DIR, rel_path)
    frames[0].save(path, save_all=True, append_images=frames[1:],
                   duration=DURATION, loop=0, optimize=False)
    print(f'  {rel_path:20s}  {os.path.getsize(path):>7,} bytes')


def _fade_grey(i, n):
    """Grey level (1-255) for fade frame i out of n total frames."""
    half = n // 2
    if i < half:
        return max(1, int(255 * i / half))
    if i == half:
        return 255
    return max(1, int(255 * (n - 1 - i) / (n - half)))


def generate_fade():
    n = TOTAL_FRAMES
    frames = [_quantize_to_palette(_render_rgb('fade', grey=_fade_grey(i, n))) for i in range(n)]
    _save_gif(frames, 'fade.gif')


def generate_slide_up():
    n = TOTAL_FRAMES
    half = n // 2
    max_off = 70
    frames = []
    for i in range(n):
        off = int(max_off * max(0, 1 - i / half)) if i < half else 0
        frames.append(_quantize_to_palette(_render_rgb('slide-up', grey=_fade_grey(i, n), y_off=off)))
    _save_gif(frames, 'slide-up.gif')


def generate_karaoke():
    """30 unique frames — continuous sung_count from 0..4."""
    n = TOTAL_FRAMES
    words = ['欢', '迎', '观', '看']
    frames = []
    for i in range(n):
        # Continuous sung_count: smoothly goes from 0 to 4 over n frames
        sung_count = 4.0 * i / n  # 0.0 → 3.87
        frames.append(_quantize_to_palette(_render_karaoke_rgb(words, sung_count)))
    _save_gif(frames, 'karaoke.gif')


if __name__ == '__main__':
    print('Generating ASS animation GIF previews...')
    generate_fade()
    generate_slide_up()
    generate_karaoke()
    print('Done.')
