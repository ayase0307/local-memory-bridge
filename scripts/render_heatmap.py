"""Render an explanatory activity heatmap; no live data or credentials are read."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)
W, H = 1280, 690
BG = (5, 13, 23)
WHITE = (233, 243, 248)
MUTED = (128, 154, 172)
CYAN = (54, 214, 236)
MINT = (93, 237, 180)
AMBER = (255, 185, 91)
ROWS = ["PROJECT RULES", "LONG-TERM MEMORY", "CONTEXT PACKET", "DEEPSEEK WEB", "LOCAL FILE TOOLS", "BACKUP", "AUDIT LOG"]
COLORS = [CYAN, CYAN, CYAN, (137, 160, 255), MINT, AMBER, AMBER]
# One illustrative read/create/replace task: four model calls, memory reloaded per call.
ACTIVITY = [
    [1, 1, .3, 0, 0, 0, 0, 1, .3, 0, 0, 0, 1, .3, 0, 0, 0, 1, .3, 0],
    [1, 1, .3, 0, 0, 0, 0, 1, .3, 0, 0, 0, 1, .3, 0, 0, 0, 1, .3, 0],
    [.3, .7, 1, .4, 0, 0, 0, .6, 1, .4, 0, 0, .6, 1, .4, 0, 0, .6, 1, .4],
    [0, 0, .2, 1, 1, .5, 0, 0, .2, 1, .5, 0, 0, .2, 1, .5, 0, 0, .4, 1],
    [0, 0, 0, 0, 0, .4, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, .4, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, .2, 0, 0, 1, .6, 0, 0, 0, 1, 1, 0, 0, 1],
]
PHASES = [
    (0, 2, "RECALL", "Load agent.md and memory.md", "CONTEXT"),
    (2, 5.5, "REASON", "The web model requests a file read", "MODEL CALL 1 / 4"),
    (5.5, 7, "READ", "Read the selected file; return text + SHA-256", "LOCAL TOOL"),
    (7, 10, "REASON", "Reload memory; request a new file", "MODEL CALL 2 / 4"),
    (10, 12, "CREATE", "Create exclusively; record the completed operation", "LOCAL TOOL"),
    (12, 14.5, "REASON", "Reload memory; request an exact replacement", "MODEL CALL 3 / 4"),
    (14.5, 17, "MODIFY", "Check hash; back up; replace; append audit", "LOCAL TOOL"),
    (17, 21, "FINISH", "Reload memory; report the verified tool results", "MODEL CALL 4 / 4"),
]


def font(size, bold=False, mono=False):
    win = "consolab.ttf" if mono and bold else "consola.ttf" if mono else "segoeuib.ttf" if bold else "segoeui.ttf"
    paths = [Path("C:/Windows/Fonts") / win, Path("/usr/share/fonts/truetype/dejavu") / ("DejaVuSansMono.ttf" if mono else "DejaVuSans.ttf")]
    for candidate in paths:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size=size)


F = {"title": font(34, True), "small": font(13, mono=True), "body": font(17), "label": font(15, mono=True), "phase": font(19, True), "caption": font(14)}


def mix(a, b, amount):
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def frame(t, poster=False):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    for y in range(0, H, 30):
        d.line((0, y, W, y), fill=(9, 21, 34))
    for x in range(0, W, 30):
        d.line((x, 0, x, H), fill=(9, 21, 34))
    d.rounded_rectangle((18, 18, W-19, H-19), radius=18, fill=(7, 17, 29), outline=(28, 53, 71), width=1)
    d.text((48, 36), "THE MEMORY → ACTION LOOP", font=F["small"], fill=CYAN)
    d.text((48, 62), "Every turn starts with memory.", font=F["title"], fill=WHITE)
    d.text((48, 111), "The web model asks. Local code validates and acts.", font=F["body"], fill=MUTED)
    active = next((p for p in PHASES if p[0] <= t < p[1]), PHASES[-1])
    label = "ILLUSTRATIVE FLOW" if poster else active[4]
    box = d.textbbox((0, 0), label, font=F["small"])
    width = box[2] - box[0] + 30
    d.rounded_rectangle((W-48-width, 49, W-48, 80), radius=6, fill=(15, 39, 53), outline=(33, 97, 115))
    d.text((W-33-width, 57), label, font=F["small"], fill=CYAN)

    gx, gy, cw, ch, gap, rgap = 249, 202, 42, 31, 7, 12
    for col in range(20):
        d.text((gx + col*(cw+gap)+11, gy-28), f"{col+1:02}", font=F["small"], fill=(89, 115, 137))
    d.text((48, gy-28), "COMPONENT / STEP", font=F["small"], fill=(89, 115, 137))
    glow = Image.new("RGBA", (W, H))
    gd = ImageDraw.Draw(glow)
    for row, name in enumerate(ROWS):
        y = gy + row*(ch+rgap)
        d.text((48, y+6), name, font=F["label"], fill=WHITE if any(ACTIVITY[row]) else MUTED)
        for col in range(20):
            x = gx + col*(cw+gap)
            activity = ACTIVITY[row][col]
            if poster:
                intensity = activity*.72
            else:
                distance = t-col
                pulse = math.exp(-((distance-.2)/.9)**2)
                trail = .24*math.exp(-max(0, distance)/6) if distance >= 0 else 0
                intensity = activity*min(1, pulse + trail)
            d.rounded_rectangle((x, y, x+cw, y+ch), radius=5,
                                fill=mix((14, 30, 44), COLORS[row], intensity*.8),
                                outline=mix((26, 48, 64), COLORS[row], intensity*.72))
            if intensity > .5:
                gd.rounded_rectangle((x-3, y-3, x+cw+3, y+ch+3), radius=7,
                                     fill=(*COLORS[row], round(100*intensity)))
                d.line((x+8, y+ch-6, x+cw-8, y+ch-6), fill=mix(COLORS[row], WHITE, .4), width=2)
    im = Image.alpha_composite(im.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(10))).convert("RGB")
    d = ImageDraw.Draw(im)
    if not poster:
        cursor = min(19, max(0, t))
        cx = gx + cursor*(cw+gap) + cw/2
        d.line((cx, gy-7, cx, gy+7*(ch+rgap)-rgap+6), fill=(111, 219, 230), width=1)
        d.ellipse((cx-4, gy-12, cx+4, gy-4), fill=WHITE)

    d.line((48, 528, W-48, 528), fill=(31, 52, 71))
    phase_color = AMBER if active[2] in ("MODIFY", "FINISH") else MINT if active[2] in ("READ", "CREATE") else CYAN
    d.rounded_rectangle((48, 548, 170, 585), radius=7, fill=mix((11, 25, 38), phase_color, .13), outline=mix((11, 25, 38), phase_color, .55))
    phase = "WORKFLOW" if poster else active[2]
    d.text((63, 554), phase, font=F["phase"], fill=phase_color)
    desc = "Recall → reason → validate → act → record. Repeat for each tool call." if poster else active[3]
    d.text((193, 555), desc, font=F["body"], fill=WHITE)
    d.text((48, 612), "COOL = IDLE    HOT = ACTIVE", font=F["small"], fill=MUTED)
    for n in range(60):
        d.line((350+n*3, 616, 352+n*3, 626), fill=mix((17, 34, 49), MINT, n/59), width=3)
    d.text((W-485, 614), "SCHEMATIC ACTIVITY · NOT LIVE TELEMETRY", font=F["small"], fill=MUTED)
    d.line((48, 652, W-48, 652), fill=(19, 40, 57))
    d.line((48, 652, 48+int((W-96)*min(t/20, 1)), 652), fill=CYAN, width=2)
    return im


if __name__ == "__main__":
    frames = [frame(i/8) for i in range(160)]
    # A shared palette keeps unchanged text identical across frames, allowing compact GIF deltas.
    palette_sample = Image.new("RGB", (W, H*5))
    for idx, chosen in enumerate([frames[0], frames[40], frames[80], frames[120], frame(19.5, poster=True)]):
        palette_sample.paste(chosen, (0, idx*H))
    palette = palette_sample.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    images = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in frames]
    images[0].save(OUT / "flow-heatmap.gif", save_all=True, append_images=images[1:], duration=100, loop=0, optimize=True, disposal=1)
    frame(19.5, poster=True).save(OUT / "flow-heatmap-static.png", optimize=True)
    print(f"Saved {len(images)} animation frames: {W}x{H}, 16.0 seconds, infinite loop.")
