# -*- coding: utf-8 -*-
"""HWP 에서 글자와 '동그라미 번호 그림'을 제자리에 넣어 읽습니다.

이 연습문제 파일은 ①~⑤ 를 글자가 아니라 작은 그림으로 박아 두었습니다.
그래서 문단마다 딸린 개체(그림)를 찾아, 글자 사이 제자리에 끼워 넣습니다.
"""
import olefile, zlib, struct, sys, re, hashlib

PARA_HEADER, PARA_TEXT, CTRL_HEADER = 66, 67, 71
SHAPE_PIC, BIN_DATA = 85, 18

# 16바이트를 차지하는 제어 문자 (개체가 딸려 옵니다)
WIDE = {1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}

MARK = {'3070f151': '①', 'd1e0e70c': '②', '298cf127': '③',
        '42177df5': '④', 'a793959d': '⑤'}


def records(data):
    """(태그, 층, 내용) 을 차례대로 내놓습니다."""
    i = 0
    while i < len(data) - 4:
        h = struct.unpack('<I', data[i:i + 4])[0]
        tag = h & 0x3FF
        level = (h >> 10) & 0x3FF
        size = (h >> 20) & 0xFFF
        i += 4
        if size == 0xFFF:
            size = struct.unpack('<I', data[i:i + 4])[0]
            i += 4
        yield tag, level, data[i:i + size]
        i += size


def para_pieces(raw):
    """문단 글자를 조각으로 나눕니다. ('글', 내용) 또는 ('개체', 제어문자번호)"""
    out = []
    buf = ''
    k = 0
    while k < len(raw) - 1:
        c = struct.unpack('<H', raw[k:k + 2])[0]
        if c in WIDE:
            if buf:
                out.append(('글', buf)); buf = ''
            out.append(('개체', c))
            k += 16
        elif c in (10, 13):
            buf += '\n'; k += 2
        elif c in (30, 31):
            buf += ' '; k += 2
        elif c < 32:
            k += 2
        else:
            buf += chr(c); k += 2
    if buf:
        out.append(('글', buf))
    return out


def unpack_bin(d):
    if d[:2] != b'\xff\xd8':
        try:
            return zlib.decompress(d, -15)
        except Exception:
            pass
    return d


def read(path):
    f = olefile.OleFileIO(path)
    comp = bool(f.openstream('FileHeader').read()[36] & 1)

    streams = {}
    for n in f.listdir():
        if n[0] == 'BinData':
            m = re.search(r'BIN([0-9A-Fa-f]{4})', n[1])
            streams[int(m.group(1), 16)] = hashlib.md5(
                unpack_bin(f.openstream(n).read())).hexdigest()[:8]

    di = f.openstream('DocInfo').read()
    if comp:
        di = zlib.decompress(di, -15)
    binid = {}
    k = 0
    for tag, lv, raw in records(di):
        if tag == BIN_DATA:
            k += 1
            binid[k] = streams.get(struct.unpack('<H', raw[2:4])[0], '?')

    text = []
    for name in sorted((n for n in f.listdir() if n[0] == 'BodyText'),
                       key=lambda n: int(re.sub(r'\D', '', n[1]) or 0)):
        d = f.openstream(name).read()
        if comp:
            d = zlib.decompress(d, -15)
        rs = list(records(d))

        # 개체(CTRL_HEADER) 마다 '그림이면 어느 번호인지' 를 미리 구합니다
        art = {}
        for i, (tag, lv, raw) in enumerate(rs):
            if tag != CTRL_HEADER:
                continue
            mark = None
            for tag2, lv2, raw2 in rs[i + 1:]:
                if tag2 == CTRL_HEADER and lv2 <= lv:
                    break
                if tag2 == SHAPE_PIC and len(raw2) >= 73:
                    bid = struct.unpack('<H', raw2[71:73])[0]
                    mark = MARK.get(binid.get(bid, '?'))
                    break
            art[i] = mark

        # 문단 글자에 그 문단의 개체를 차례대로 끼워 넣습니다
        i = 0
        while i < len(rs):
            tag, lv, raw = rs[i]
            if tag != PARA_TEXT:
                i += 1
                continue
            pieces = para_pieces(raw)
            # 이 문단에 딸린 개체 목록 (같은 층의 CTRL_HEADER)
            ctrls = []
            j = i + 1
            while j < len(rs):
                t2, l2, _ = rs[j]
                if t2 == PARA_HEADER and l2 <= lv - 1:
                    break
                if t2 == PARA_TEXT and l2 <= lv:
                    break
                if t2 == CTRL_HEADER and l2 == lv:
                    ctrls.append(j)
                j += 1
            c = 0
            for kind, val in pieces:
                if kind == '글':
                    text.append(val)
                else:
                    mark = art.get(ctrls[c]) if c < len(ctrls) else None
                    if mark:
                        text.append(mark)
                    c += 1
            i += 1
    f.close()
    return ''.join(text)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        t = read(p)
        t = re.sub(r'\n{3,}', '\n\n', t)
        out = p.replace('.hwp', '-3.txt')
        open(out, 'w', errors='replace').write(t)
        print(p.split('/')[-1][:38], len(t), '글자')
