#!/usr/bin/env python3
"""Generate icons for the Workout Planner PWA: a stylized kettlebell.

Outputs:
  icons/icon-192.png        (any-purpose)
  icons/icon-512.png        (any-purpose)
  icons/icon-maskable.png   (512x512, with safe-area padding)
  icons/apple-touch-icon.png (180x180)

Run from the docs/ folder:  python3 generate_icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent / "icons"

BG = (247, 243, 234)            # --bg
KB_BODY = (180, 83, 9)          # --accent (copper)
KB_DARK = (146, 64, 14)         # --accent-hover
KB_HIGHLIGHT = (217, 119, 38)
INK = (32, 23, 17)              # --ink


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))

    pad = int(size * (0.12 if maskable else 0.06))
    inner = size - 2 * pad
    cx = size / 2
    cy = size / 2

    draw_kettlebell(img, cx, cy, inner)
    return img


def draw_kettlebell(img: Image.Image, cx: float, cy: float, inner: float):
    # Layout: ball (body) ~62% of inner; handle sits on top.
    ball_d = inner * 0.62
    ball_r = ball_d / 2
    # Vertical centering: handle (top) + ball (bottom) together fill inner.
    handle_outer_w = inner * 0.50
    handle_outer_h = inner * 0.30
    total_h = handle_outer_h + ball_d * 0.92  # handle slightly overlaps ball
    top = cy - total_h / 2

    handle_top = top
    handle_bottom = handle_top + handle_outer_h
    handle_left = cx - handle_outer_w / 2
    handle_right = cx + handle_outer_w / 2

    ball_cy = handle_bottom + ball_r * 0.85  # overlap
    ball_top = ball_cy - ball_r
    ball_bottom = ball_cy + ball_r
    ball_left = cx - ball_r
    ball_right = cx + ball_r

    outline_w = max(3, int(inner * 0.012))

    # Soft drop shadow under the ball.
    shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.ellipse(
        [ball_left + inner * 0.02, ball_top + inner * 0.04,
         ball_right + inner * 0.02, ball_bottom + inner * 0.04],
        fill=(74, 42, 15, 70),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=max(2, inner * 0.014)))
    img.alpha_composite(shadow_layer)

    draw = ImageDraw.Draw(img)

    # Handle: rounded rectangle outline with thick border. Fill the rim color, then
    # punch out the inner area by drawing the bg color inside.
    draw.rounded_rectangle(
        [handle_left, handle_top, handle_right, handle_bottom],
        radius=int(handle_outer_h * 0.5),
        fill=KB_DARK,
        outline=INK,
        width=outline_w,
    )
    # Inner cutout to make it look like an open handle.
    inner_inset = handle_outer_h * 0.28
    draw.rounded_rectangle(
        [handle_left + inner_inset, handle_top + inner_inset,
         handle_right - inner_inset, handle_bottom - inner_inset * 0.4],
        radius=int((handle_outer_h - 2 * inner_inset) * 0.5),
        fill=BG,
        outline=INK,
        width=max(2, int(inner * 0.008)),
    )

    # Neck: short trapezoid connecting handle to ball.
    neck_top_w = handle_outer_w * 0.55
    neck_bot_w = ball_d * 0.45
    neck_top_y = handle_bottom - inner * 0.005
    neck_bot_y = ball_top + ball_r * 0.10
    neck_pts = [
        (cx - neck_top_w / 2, neck_top_y),
        (cx + neck_top_w / 2, neck_top_y),
        (cx + neck_bot_w / 2, neck_bot_y),
        (cx - neck_bot_w / 2, neck_bot_y),
    ]
    draw.polygon(neck_pts, fill=KB_DARK, outline=INK)
    # Re-draw the neck outline crisply by stroking the two side edges.
    side_w = max(2, int(inner * 0.010))
    draw.line([neck_pts[0], neck_pts[3]], fill=INK, width=side_w)
    draw.line([neck_pts[1], neck_pts[2]], fill=INK, width=side_w)

    # Ball.
    draw.ellipse(
        [ball_left, ball_top, ball_right, ball_bottom],
        fill=KB_BODY,
        outline=INK,
        width=outline_w,
    )

    # Highlight crescent on the ball for a glossy hint.
    hl_offset_x = -ball_r * 0.32
    hl_offset_y = -ball_r * 0.32
    hl_r = ball_r * 0.55
    hl_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl_layer)
    hd.ellipse(
        [cx + hl_offset_x - hl_r, ball_cy + hl_offset_y - hl_r,
         cx + hl_offset_x + hl_r, ball_cy + hl_offset_y + hl_r],
        fill=KB_HIGHLIGHT + (180,),
    )
    hl_layer = hl_layer.filter(ImageFilter.GaussianBlur(radius=max(2, inner * 0.010)))
    img.alpha_composite(hl_layer)


def save_all():
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ]
    for name, size, maskable in sizes:
        img = draw_icon(size, maskable=maskable)
        path = OUT / name
        img.save(path, format="PNG", optimize=True)
        print(f"wrote {path}  ({size}x{size}{' maskable' if maskable else ''})")


if __name__ == "__main__":
    save_all()
