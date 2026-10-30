"""Build a self-contained VSIX from an explicit file list (Python standard library)."""
import hashlib
import json
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
metadata = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
FILES = [
    'package.json', 'extension.js', 'renderer.js', 'preview.js',
    'preview-queue.js', 'preview-html.js', 'config.json', 'README.md',
    'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
    'licenses/codesnap-MIT.txt', 'bin/codesnap.exe',
]
for name in FILES:
    if not (ROOT / name).is_file():
        raise SystemExit(f'Missing {name}. Run scripts/prepare-native.ps1 first.')

manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="{metadata['name']}" Version="{metadata['version']}" Publisher="{metadata['publisher']}" TargetPlatform="win32-x64" />
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
output = destination / f"{metadata['name']}-{metadata['version']}-win32-x64.vsix"
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    archive.writestr('[Content_Types].xml', content_types)
    archive.writestr('extension.vsixmanifest', manifest)
    for name in FILES:
        archive.write(ROOT / name, 'extension/' + name)
with ZipFile(output) as archive:
    assert archive.testzip() is None, 'VSIX archive integrity check failed'
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(destination / 'SHA256SUMS.txt').write_text(f'{digest}  {output.name}\n', encoding='utf-8')
print(f'{output.name}: {output.stat().st_size:,} bytes\nSHA-256: {digest}')
