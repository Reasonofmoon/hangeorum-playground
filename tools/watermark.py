"""공개 사이트의 스크린샷(JPG/PNG)에 '© 한 걸음 서재' 워터마크를 넣는다.

사용: python tools/watermark.py site
- 이미 처리한 파일은 site/.watermarked.json 목록으로 건너뛴다.
- SVG(도식)는 건드리지 않는다.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

TEXT = "© 한 걸음 서재 · 무단 복제 금지"
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\malgunbd.ttf",
    r"C:\Windows\Fonts\malgun.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
]


def font(size):
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def mark(path: Path):
    im = Image.open(path)
    fmt = im.format
    base = im.convert("RGBA")
    w, h = base.size
    if w < 160 or h < 80:
        return False
    size = max(12, int(min(w, h) * 0.035))
    f = font(size)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bbox = d.textbbox((0, 0), TEXT, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = max(8, size // 2)
    x, y = w - tw - pad * 2, h - th - pad * 2
    d.rounded_rectangle([x - pad, y - pad // 2, x + tw + pad, y + th + pad], radius=pad, fill=(0, 0, 0, 90))
    d.text((x, y), TEXT, font=f, fill=(255, 255, 255, 215))
    # 가운데 옅은 대각선 표시 (잘라내기 방지)
    big = font(max(18, int(min(w, h) * 0.07)))
    tile = Image.new("RGBA", base.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.text((w * 0.18, h * 0.42), "한 걸음 서재", font=big, fill=(127, 127, 127, 28))
    tile = tile.rotate(18, center=(w / 2, h / 2))
    out = Image.alpha_composite(Image.alpha_composite(base, tile), layer)
    if fmt == "JPEG":
        out.convert("RGB").save(path, "JPEG", quality=86, optimize=True)
    else:
        out.save(path, "PNG", optimize=True)
    return True


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "site")
    ledger_path = root / ".watermarked.json"
    done = set(json.loads(ledger_path.read_text("utf-8"))) if ledger_path.exists() else set()
    targets = [p for p in root.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png")]
    n = 0
    for p in targets:
        rel = p.relative_to(root).as_posix()
        if rel in done or rel.startswith("apps/"):
            continue
        try:
            if mark(p):
                n += 1
            done.add(rel)
        except Exception as e:  # noqa: BLE001
            print("skip", rel, e)
    ledger_path.write_text(json.dumps(sorted(done), ensure_ascii=False, indent=0), "utf-8")
    print(f"watermarked {n} / {len(targets)}")


if __name__ == "__main__":
    main()
