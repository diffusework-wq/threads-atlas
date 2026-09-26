"""Build a deterministic, source-only ZIP for Chrome's Load unpacked workflow."""
from pathlib import Path
import json
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    'manifest.json', 'background.mjs', 'library.mjs', 'dom-helpers.js',
    'collector.js', 'bridge.js', 'popup.html', 'popup.css', 'popup.mjs', 'README.md',
)


def build():
    folder = ROOT / 'extension'
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    referenced = {manifest['background']['service_worker'], manifest['action']['default_popup']}
    referenced.update(name for entry in manifest['content_scripts'] for name in entry['js'])
    if not referenced.issubset(FILES):
        raise ValueError('Manifest contains a file missing from the explicit package allowlist')
    output = ROOT / 'site' / 'downloads' / 'threads-atlas-extension.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
        for name in FILES:
            info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, (folder / name).read_bytes())
    with ZipFile(output) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(FILES)
    print(f'Packaged {len(FILES)} source files: {output.name} ({output.stat().st_size:,} bytes)')


if __name__ == '__main__':
    build()
