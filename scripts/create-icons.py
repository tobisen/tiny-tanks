"""Reproducible original pixel icons; only Python's standard library is needed."""
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'public'
for size in [192, 512]:
    rows = bytearray()
    for py in range(size):
        rows.append(0)
        for px in range(size):
            x, y = px * 512 / size, py * 512 / size
            c = (17, 30, 39)
            if math.hypot(x - 364, y - 157) < 56:
                c = (245, 213, 160)
            if y > 341 + math.sin(x / 90) * 25:
                c = (52, 86, 73)
            if (108 <= x < 404 and 294 <= y < 367) or (139 <= x < 348 and 239 <= y < 294) or (200 <= x < 324 and 183 <= y < 239) or (300 < x < 425 and abs(y - (375 - x * .55)) < 20):
                c = (213, 245, 119)
            if 319 <= y < 342 and any(a <= x < a + 43 for a in [145, 223, 301]):
                c = (17, 30, 39)
            rows.extend(c)
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    (ROOT / f'icon-{size}.png').write_bytes(png)
