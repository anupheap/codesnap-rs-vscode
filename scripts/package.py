"""Build a self-contained VSIX from an explicit file list (Python standard library)."""
import hashlib
import argparse
import json
import platform
import sys
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
metadata = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
native = json.loads((ROOT / 'scripts/native-targets.json').read_text())
architecture = {'AMD64': 'x64', 'x86_64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(platform.machine(), platform.machine())
host = f'{sys.platform}-{architecture}'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--target', choices=native['targets'], default=host)
args = parser.parse_args()
if args.target not in native['targets']:
    parser.error(f'Unsupported host {host}; pass --target explicitly.')
binary_name = native['targets'][args.target]['filename']
binary = ROOT / '.build/native' / args.target / binary_name
if not binary.exists() and args.target == host:
    binary = ROOT / 'bin' / binary_name
if not binary.is_file():
    raise SystemExit(f'Missing native renderer. Run python scripts/prepare-native.py --target {args.target}')
FILES = [
    'package.json', 'extension.js', 'renderer.js', 'clipboard.js', 'preview.js',
    'preview-queue.js', 'preview-html.js', 'config.json', 'README.md',
    'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
    'licenses/codesnap-MIT.txt',
]
for name in FILES:
    if not (ROOT / name).is_file():
        raise SystemExit(f'Missing source file {name}.')

manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="{metadata['name']}" Version="{metadata['version']}" Publisher="{metadata['publisher']}" TargetPlatform="{args.target}" />
    <DisplayName>{escape(metadata['displayName'])}</DisplayName>
    <Description xml:space="preserve">{escape(metadata['description'])}</Description>
    <Tags>codesnap,screenshot,rust</Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{escape(metadata['engines']['vscode'])}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui" />
      <Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true" />
    </Properties>
    <License>extension/LICENSE</License>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true" />
  </Assets>
</PackageManifest>'''
content_types = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="exe" ContentType="application/octet-stream" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="" ContentType="application/octet-stream" />
</Types>'''
destination = ROOT / 'dist'
destination.mkdir(exist_ok=True)
output = destination / f"{metadata['name']}-{metadata['version']}-{args.target}.vsix"
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    archive.writestr('[Content_Types].xml', content_types)
    archive.writestr('extension.vsixmanifest', manifest)
    for name in FILES:
        archive.write(ROOT / name, 'extension/' + name)
    executable_info = ZipInfo('extension/bin/' + binary_name)
    executable_info.create_system = 3
    executable_info.external_attr = 0o100755 << 16
    executable_info.compress_type = ZIP_DEFLATED
    archive.writestr(executable_info, binary.read_bytes())
with ZipFile(output) as archive:
    assert archive.testzip() is None, 'VSIX archive integrity check failed'
digest = hashlib.sha256(output.read_bytes()).hexdigest()
sums = [f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}\n'
        for file in sorted(destination.glob(f"{metadata['name']}-{metadata['version']}-*.vsix"))]
(destination / 'SHA256SUMS.txt').write_text(''.join(sums), encoding='utf-8')
print(f'{output.name}: {output.stat().st_size:,} bytes\nSHA-256: {digest}')
