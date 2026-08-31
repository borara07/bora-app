# -*- coding: utf-8 -*-
"""앱 아이콘을 한 벌로 그립니다. 512 기준 숫자를 크기에 맞춰 줄여 씁니다."""
from PIL import Image, ImageDraw

DEEP = (88, 43, 141)      # 로고 보라 (--brand-deep)
WHITE = (255, 255, 255)

# 512 기준 — 학생 어휘·문법이 세트로 보이도록 두 아이콘이 같은 값을 씁니다
PAD, LINE, RADIUS, MARK = 36, 16, 86, 284
MARK_ALONE = 316          # 테두리가 없을 때는 로고를 조금 크게

MARK_W = Image.open('logo/mark-white.png').convert('RGBA')   # 흰 로고
MARK_P = Image.open('logo/mark.png').convert('RGBA')         # 보라 로고


def draw(size, bg, mark, ring=None):
    """ring = 테두리 색 (없으면 테두리를 그리지 않습니다)"""
    k = size / 512.0
    im = Image.new('RGB', (size, size), bg)

    if ring:
        w = max(1, round(LINE * k))
        pad = round(PAD * k)
        ImageDraw.Draw(im).rounded_rectangle(
            [pad, pad, size - 1 - pad, size - 1 - pad],
            radius=round(RADIUS * k), outline=ring, width=w)

    box = (MARK if ring else MARK_ALONE) * k
    mw, mh = mark.size
    sc = box / max(mw, mh)
    m = mark.resize((max(1, round(mw * sc)), max(1, round(mh * sc))), Image.LANCZOS)
    im.paste(m, ((size - m.size[0]) // 2, (size - m.size[1]) // 2), m)
    return im


def save_set(prefix, bg, mark, ring):
    for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'),
                       (180, 'apple-touch-icon.png'), (32, 'favicon.png')]:
        draw(size, bg, mark, ring).save(prefix + name)


# 학생 어휘 — 진보라 바탕 + 흰 로고 + 가는 흰 테두리
save_set('', DEEP, MARK_W, WHITE)
# 학생 문법 — 흰 바탕 + 보라 로고 + 가는 보라 테두리 (굵기·간격 똑같음)
save_set('grammar-', WHITE, MARK_P, DEEP)
# 선생님 — 진보라 바탕 + 흰 로고, 테두리 없음
save_set('teacher-', DEEP, MARK_W, None)

print('아이콘을 새로 그렸습니다')
