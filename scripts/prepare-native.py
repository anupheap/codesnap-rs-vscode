"""Download and verify the pinned native renderer for the chosen VSIX target."""
import argparse
import hashlib
import json
import platform
import shutil
import tarfile
import urllib.request
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'scripts/native-targets.json').read_text())


def host_target():
    system = {'Windows': 'win32', 'Linux': 'linux'}.get(platform.system(), platform.system().lower())
    machine = {'AMD64': 'x64', 'x86_64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(platform.machine(), platform.machine())
    return f'{system}-{machine}'


def prepare(target):
    config = CONFIG['targets'][target]
    build = ROOT / '.build'
    build.mkdir(exist_ok=True)
    archive = build / config['asset']
    if not archive.exists():
        url = f"https://github.com/codesnap-rs/codesnap/releases/download/v{CONFIG['version']}/{config['asset']}"
        request = urllib.request.Request(url, headers={'User-Agent': 'codesnap-rs-vscode-build'})
        with urllib.request.urlopen(request, timeout=90) as response, archive.open('wb') as output:
            shutil.copyfileobj(response, output)
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != config['sha256']:
        raise SystemExit(f'Checksum mismatch for {archive.name}. Delete the archive and try again.')
    destination = build / 'native' / target / config['filename']
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Extract only the expected executable, never paths from the archive.
    if archive.suffix == '.zip':
        with ZipFile(archive) as package:
            executable = package.read(config['filename'])
    else:
        with tarfile.open(archive, 'r:gz') as package:
            members = [member for member in package.getmembers()
                       if member.isfile() and Path(member.name).name == config['filename']]
            if len(members) != 1:
                raise SystemExit('Expected exactly one native renderer in the archive.')
            executable = package.extractfile(members[0]).read()
        expected_machine = 62 if target == 'linux-x64' else 183
        if executable[:4] != b'\x7fELF' or int.from_bytes(executable[18:20], 'little') != expected_machine:
            raise SystemExit(f'Unexpected ELF architecture for {target}.')
    destination.write_bytes(executable)
    destination.chmod(0o755)
    if target == host_target():
        local = ROOT / 'bin' / config['filename']
        local.parent.mkdir(exist_ok=True)
        shutil.copy2(destination, local)
        local.chmod(0o755)
    print(f'Verified CodeSnap CLI {CONFIG["version"]} for {target}.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', choices=CONFIG['targets'], default=host_target())
    args = parser.parse_args()
    if args.target not in CONFIG['targets']:
        parser.error(f'Unsupported host {args.target}; pass --target explicitly.')
    prepare(args.target)
