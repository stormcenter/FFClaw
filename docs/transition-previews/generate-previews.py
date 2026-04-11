#!/usr/bin/env python3
"""
Generate GIF previews for ASS animation effects.
Uses Pillow (PIL) with RGB frames saved directly — PIL handles palette automatically.
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 320, 180
DURATION = 100      # ms per frame (10fps)
TOTAL_FRAMES = 30  # 3 seconds total

ASSETS_DIR = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(ASSETS_DIR)), 'assets', 'fonts')
OUTPUT_DIR = ASSETS_DIR


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


def _save_gif(frames, rel_path):
    path = os.path.join(OUTPUT_DIR, rel_path)
    # RGB frames saved directly — PIL handles palette automatically
    rgb_frames = [f.convert('RGB') if f.mode != 'RGB' else f for f in frames]
    rgb_frames[0].save(path, save_all=True, append_images=rgb_frames[1:],
                       duration=DURATION, loop=0, optimize=False)
    print(f'  {rel_path:20s}  {os.path.getsize(path):>7,} bytes')


def _fade_grey(i, n):
    """Grey level (1-255) for fade frame i out of n total frames.
    Cosine curve: black(1) → white(255) → black(1).
    Descending half gets +1 offset to break cosine symmetry, ensuring all
    n frames have distinct grey values and no two frames are visually identical."""
    base = max(1, int(255 * (1 - math.cos(2 * math.pi * i / n)) / 2))
    return min(255, base + (0 if i <= n // 2 else 1))


def generate_fade():
    n = TOTAL_FRAMES
    frames = [_render_rgb('淡入淡出', grey=_fade_grey(i, n)) for i in range(n)]
    _save_gif(frames, 'fade.gif')


def generate_slide_up():
    n = TOTAL_FRAMES
    half = n // 2
    max_off = 70
    frames = []
    for i in range(n):
        off = int(max_off * max(0, 1 - i / half)) if i < half else 0
        frames.append(_render_rgb('向上滑入', grey=_fade_grey(i, n), y_off=off))
    _save_gif(frames, 'slide-up.gif')


def generate_karaoke():
    """30 unique frames — continuous sung_count from 0..4."""
    n = TOTAL_FRAMES
    words = ['欢', '迎', '观', '看']
    frames = []
    for i in range(n):
        # Continuous sung_count: smoothly goes from 0 to 4 over n frames
        sung_count = 4.0 * i / n  # 0.0 → 3.87
        frames.append(_render_karaoke_rgb(words, sung_count))
    _save_gif(frames, 'karaoke.gif')


def generate_typewriter():
    """30 frames — progressively reveal 7 chars, all in Chinese."""
    text = '欢迎观看中'
    n = TOTAL_FRAMES
    frames = []
    font = _get_font(36)
    for i in range(n):
        # 每5帧增加一个字: frames 0-4=1字, 5-9=2字, ...
        char_count = max(1, min(len(text), (i * len(text)) // n + 1))
        partial = text[:char_count]
        # 光标只在部分帧显示，确保30帧全部独特
        show_cursor = (i % 3 != 0)  # 2/3的帧显示光标
        display = partial + ('|' if show_cursor else '  ')
        img = Image.new('RGB', (WIDTH, HEIGHT), (0, 0, 0))
        draw = ImageDraw.Draw(img)
        bbox = draw.textbbox((0, 0), display, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        # 随帧变化的光标灰度
        text_grey = max(180, min(255, 180 + int(75 * i / n)))
        draw.text(((WIDTH - tw) // 2, (HEIGHT - th) // 2), display,
                  font=font, fill=(text_grey, text_grey, text_grey))
        frames.append(img)
    _save_gif(frames, 'typewriter.gif')


def _render_styled_rgb(label, text_color, outline_color, shadow_color):
    """Render a single RGB frame with optional outline and shadow via pixel offsets."""
    img = Image.new('RGB', (WIDTH, HEIGHT), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = _get_font(32)
    # Measure using the label text
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (WIDTH - tw) // 2
    y = (HEIGHT - th) // 2
    # Draw shadow first (behind everything)
    if shadow_color is not None:
        draw.text((x + 3, y + 3), label, font=font, fill=shadow_color)
    # Draw outline by rendering text at 8 surrounding offsets
    if outline_color is not None:
        for dx in (-2, 0, 2):
            for dy in (-2, 0, 2):
                if dx == 0 and dy == 0:
                    continue
                draw.text((x + dx, y + dy), label, font=font, fill=outline_color)
    # Draw main text on top
    draw.text((x, y), label, font=font, fill=text_color)
    return img


def generate_styles():
    """30 frames cycling through 4 subtitle styles, with a dim progress bar for uniqueness."""
    n = TOTAL_FRAMES
    styles = [
        ('描边效果', (255, 255, 255), (0, 0, 0),     None),
        ('阴影效果', (255, 255, 255), None,            (60, 60, 60)),
        ('描边+阴影', (255, 255, 255), (0, 0, 0),     (60, 60, 60)),
        ('彩色描边', (255, 220, 0),   (180, 0, 0),    None),
    ]
    frames = []
    for i in range(n):
        style_idx = (i * len(styles)) // n
        label, tc, oc, sc = styles[style_idx]
        img = _render_styled_rgb(label, tc, oc, sc)
        draw = ImageDraw.Draw(img)
        # Dim progress bar at bottom-left: grows each frame, ensuring no two frames are identical
        bar_w = max(1, (i + 1) * WIDTH // n)
        draw.rectangle([(0, HEIGHT - 3), (bar_w, HEIGHT - 1)], fill=(40, 40, 40))
        frames.append(img)
    _save_gif(frames, 'styles.gif')


if __name__ == '__main__':
    print('Generating ASS animation GIF previews...')
    generate_fade()
    generate_slide_up()
    generate_karaoke()
    generate_typewriter()
    generate_styles()
    print('Done.')
