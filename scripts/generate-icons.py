"""Render the local-life-ops icon set to PNG/ICO with pure Pillow.

No native cairo dependency. Reads brand tokens from styles.css /
LoginView.vue directly: --accent #2563eb, --accent-dark-2 #1d4ed8, and the
login mark's blue->teal gradient #1d4ed8 -> #0f766e.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(r"E:\Program\Content Operation Platform\apps\web\public")
ICONS = ROOT / "icons"

# Brand tokens
ACCENT_TOP = (59, 130, 246)        # #3b82f6
ACCENT_BOT_BLUE = (29, 78, 216)    # #1d4ed8
ACCENT_TEAL = (15, 118, 110)       # #0f766e  (login gradient end)
WHITE = (255, 255, 255)
GOLD_TOP = (251, 191, 36)
GOLD_BOT = (245, 158, 11)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def fill_vertical_gradient(size: int, top, bot) -> Image.Image:
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        c = lerp(top, bot, t)
        for x in range(size):
            px[x, y] = c
    return img


def fill_diagonal_gradient(size: int, c1, c2) -> Image.Image:
    img = Image.new("RGB", (size, size), c1)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = lerp(c1, c2, t)
    return img


def rounded_rect_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=radius, fill=255
    )
    return m


def draw_radial_glow(size: int, alpha_peak: int = 64) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx, cy = int(size * 0.3), int(size * 0.3)
    rmax = int(size * 0.7)
    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            d = (dx * dx + dy * dy) ** 0.5
            if d >= rmax:
                continue
            t = 1 - d / rmax
            a = int(alpha_peak * (t * t))
            layer.putpixel((x, y), (255, 255, 255, a))
    return layer


def draw_grid_rings(canvas: Image.Image, cx: int, cy: int,
                    radii, alpha: int, stroke: int):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for r in radii:
        d.ellipse((cx - r, cy - r, cx + r, cy + r),
                  outline=(255, 255, 255, alpha), width=stroke)
    canvas.alpha_composite(layer)


def draw_pulse(canvas: Image.Image, cx: int, cy: int, width: int,
               stroke: int):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts_norm = [
        (-0.78, 0.30), (-0.50, 0.30), (-0.38, -0.05),
        (-0.21, 0.50), (-0.04, -0.30), (0.15, 0.30),
        (0.78, 0.30),
    ]
    pts = [(cx + int(x * width / 2), cy + int(y * width / 4))
           for x, y in pts_norm]
    d.line(pts, fill=(255, 255, 255, 235), width=stroke, joint="curve")
    canvas.alpha_composite(layer)


def draw_target(canvas: Image.Image, cx: int, cy: int, r_outer: int):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer),
              fill=(255, 255, 255, 255),
              outline=(29, 78, 216, 255),
              width=max(2, r_outer // 12))
    r_inner = max(2, r_outer // 5)
    d.ellipse((cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner),
              fill=(29, 78, 216, 255))
    cross = r_outer // 2
    sw = max(2, r_outer // 8)
    d.line((cx - cross, cy - cross, cx + cross, cy + cross),
           fill=(29, 78, 216, 255), width=sw)
    d.line((cx + cross, cy - cross, cx - cross, cy + cross),
           fill=(29, 78, 216, 255), width=sw)
    canvas.alpha_composite(layer)


def draw_gold_badge(canvas: Image.Image, x: int, y: int, size: int):
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    for yy in range(size):
        t = yy / max(1, size - 1)
        c = lerp(GOLD_TOP, GOLD_BOT, t)
        d.line((0, yy, size - 1, yy), fill=c + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=max(4, size // 5), fill=255
    )
    rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rounded.paste(badge, (0, 0), mask)
    pts = [
        (int(size * 0.22), int(size * 0.58)),
        (int(size * 0.38), int(size * 0.58)),
        (int(size * 0.48), int(size * 0.34)),
        (int(size * 0.60), int(size * 0.78)),
        (int(size * 0.72), int(size * 0.46)),
        (int(size * 0.82), int(size * 0.58)),
    ]
    ImageDraw.Draw(rounded).line(
        pts, fill=(29, 78, 216, 255),
        width=max(2, size // 14), joint="curve"
    )
    canvas.alpha_composite(rounded, dest=(x, y))


def render_full(size: int, *, maskable: bool = False) -> Image.Image:
    if maskable:
        # Full-bleed background (no rounded corners) so adaptive-icon masks
        # never crop the mark. Content kept inside the central ~64% safe area.
        canvas = fill_vertical_gradient(size, ACCENT_TOP, ACCENT_BOT_BLUE)
        canvas = canvas.convert("RGBA")
        canvas.alpha_composite(draw_radial_glow(size, alpha_peak=60))
    else:
        canvas = fill_vertical_gradient(
            size, ACCENT_TOP, ACCENT_BOT_BLUE
        ).convert("RGBA")
        mask = rounded_rect_mask(size, max(2, int(size * 0.20)))
        bg_only = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        bg_only.paste(canvas, (0, 0), mask)
        canvas = bg_only
        canvas.alpha_composite(draw_radial_glow(size, alpha_peak=70))

    cx, cy = size // 2, size // 2
    if maskable:
        draw_grid_rings(canvas, cx, cy,
                        radii=[int(size * r) for r in (0.22, 0.32)],
                        alpha=46, stroke=max(1, size // 90))
    else:
        draw_grid_rings(canvas, cx, cy,
                        radii=[int(size * r) for r in (0.34, 0.54, 0.74)],
                        alpha=46, stroke=max(1, size // 90))
    draw_pulse(canvas, cx, cy + int(size * 0.10),
               width=int(size * 0.58), stroke=max(2, size // 38))
    draw_target(canvas, cx, cy - int(size * 0.04), r_outer=int(size * 0.17))

    if not maskable:
        badge = int(size * 0.18)
        pad = int(size * 0.07)
        draw_gold_badge(canvas, pad, pad, badge)

    return canvas


def render_login(size: int) -> Image.Image:
    """Larger login mark: uses the blue->teal 135deg gradient."""
    canvas = fill_diagonal_gradient(size, ACCENT_BOT_BLUE, ACCENT_TEAL).convert(
        "RGBA"
    )
    mask = rounded_rect_mask(size, max(2, int(size * 0.30)))
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg.paste(canvas, (0, 0), mask)
    canvas = bg
    canvas.alpha_composite(draw_radial_glow(size, alpha_peak=80))
    cx, cy = size // 2, size // 2
    draw_pulse(canvas, cx, cy + int(size * 0.10),
               width=int(size * 0.66), stroke=max(2, size // 32))
    draw_target(canvas, cx, cy - int(size * 0.06), r_outer=int(size * 0.20))
    return canvas


def render_mini(size: int) -> Image.Image:
    """Simplified variant for 16/32 favicons."""
    canvas = fill_vertical_gradient(size, ACCENT_TOP, ACCENT_BOT_BLUE).convert(
        "RGBA"
    )
    mask = rounded_rect_mask(size, max(2, int(size * 0.22)))
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg.paste(canvas, (0, 0), mask)
    canvas = bg
    cx, cy = size // 2, size // 2
    draw_pulse(canvas, cx, cy, width=int(size * 0.78),
               stroke=max(2, size // 8))
    r = max(2, size // 9)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 255))
    d.ellipse((cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 2),
              fill=(29, 78, 216, 255))
    canvas.alpha_composite(layer)
    return canvas


def save_ico(images_by_size, path: Path):
    sizes = sorted(images_by_size.keys())
    first = images_by_size[sizes[0]]
    append = [images_by_size[s] for s in sizes[1:]]
    first.save(path, format="ICO", sizes=[(s, s) for s in sizes],
               append_images=append)


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    ROOT.mkdir(parents=True, exist_ok=True)

    # Standard favicon PNGs
    render_full(32).save(ROOT / "favicon-32x32.png", optimize=True)
    render_mini(16).save(ROOT / "favicon-16x16.png", optimize=True)
    render_full(180).save(ROOT / "apple-touch-icon.png", optimize=True)
    render_full(192).save(ICONS / "icon-192.png", optimize=True)
    render_full(512).save(ICONS / "icon-512.png", optimize=True)

    # ICO: 16/32/48 — use mini for the smallest sizes
    save_ico(
        {16: render_mini(16), 32: render_mini(32), 48: render_full(48)},
        ROOT / "favicon.ico",
    )

    # Maskable: safe-area variant for adaptive icons
    render_full(192, maskable=True).save(
        ICONS / "icon-maskable-192.png", optimize=True
    )
    render_full(512, maskable=True).save(
        ICONS / "icon-maskable-512.png", optimize=True
    )

    # Login mark (52x52 source-of-truth size, also export 96/128)
    render_login(96).save(ICONS / "login-mark-96.png", optimize=True)
    render_login(128).save(ICONS / "login-mark-128.png", optimize=True)

    print("Icons written:")
    for p in sorted(ROOT.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(ROOT.parent.parent)}  {p.stat().st_size} bytes")


if __name__ == "__main__":
    main()