"""python3 tools/package-itch.py [/tmp/dugout-itch.zip]"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys
root = Path(__file__).resolve().parents[1] / 'web'
out = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/dugout-itch.zip')
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        if path.is_file() and path.suffix != '.mjs' and path.name != 'CNAME':
            archive.write(path, path.relative_to(root))
with ZipFile(out) as archive:
    assert 'index.html' in archive.namelist()
    assert 'media/dugout-preview.png' in archive.namelist()
    assert archive.testzip() is None
print(f'{out} ({out.stat().st_size:,} bytes)')
