"""CI Linux x64 installer, pinned release and GitHub-published asset SHA-256.

No remote scripts, root permissions or mutable installer action are needed.
"""
from pathlib import Path
import hashlib
import os
import tarfile
import urllib.request

version = '1.10.18'
expected = 'afad071b5bd22c02f2d300695743189d3650e0537a53073e654b630cff2b0c73'
temp = Path(os.environ['RUNNER_TEMP'])
archive = temp / f'quarto-{version}.tar.gz'
url = f'https://github.com/quarto-dev/quarto-cli/releases/download/v{version}/quarto-{version}-linux-amd64.tar.gz'
urllib.request.urlretrieve(url, archive)
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit('Quarto download checksum mismatch')
with tarfile.open(archive) as tar:
    tar.extractall(temp / 'ustudyopen-tools', filter='data')
binary = temp / 'ustudyopen-tools' / f'quarto-{version}' / 'bin'
if not (binary / 'quarto').is_file():
    raise SystemExit('Unexpected Quarto archive structure')
with open(os.environ['GITHUB_PATH'], 'a') as target:
    target.write(str(binary) + '\n')
print(f'Quarto {version}: SHA-256 verified; installed without root')
