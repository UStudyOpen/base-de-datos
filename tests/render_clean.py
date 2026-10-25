"""Rebuild from an isolated source copy; never read, delete or rewrite docs/."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

from safe_paths import checked_path, project_files, replace_directory

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', '.quarto', '_site', 'docs', 'artifacts', 'review', 'node_modules', '__pycache__', '.venv',
        'libros_referencia', 'clases_referencia', '.cache'}


def main():
    if subprocess.check_output(['quarto', '--version'], text=True).strip() != '1.10.18':
        raise SystemExit('Use Quarto 1.10.18')
    checked_path(ROOT, '_site')
    project_files(ROOT, SKIP, exclude_env=True)
    subprocess.run(['python3', 'tests/platform_validate.py', '--source-only'], cwd=ROOT, check=True)
    out = checked_path(ROOT, 'artifacts/platform')
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ustudyopen-build-') as temp:
        work = Path(temp) / 'course'
        shutil.copytree(ROOT, work, ignore=lambda directory, names: [n for n in names if n in SKIP or n.startswith('.env')])
        with checked_path(ROOT, 'artifacts/platform/render.log').open('w') as log:
            result = subprocess.run(['quarto', 'render'], cwd=work, env=dict(os.environ, XDG_CACHE_HOME=str(Path(temp) / 'cache')),
                                    stdout=log, stderr=subprocess.STDOUT)
        if result.returncode:
            raise SystemExit(f'Render failed ({result.returncode}); see artifacts/platform/render.log; previous _site preserved')
        with checked_path(ROOT, 'artifacts/platform/isolated-validation.log').open('w') as log:
            result = subprocess.run(['python3', 'tests/platform_validate.py'], cwd=work, stdout=log, stderr=subprocess.STDOUT)
        if result.returncode:
            raise SystemExit('Isolated output invalid; see artifacts/platform/isolated-validation.log; previous _site preserved')
        expected = len(json.loads((ROOT / 'course.yml').read_text())['course']['pages'])
        count = len(list((work / '_site').rglob('*.html')))
        if count != expected:
            raise SystemExit(f'Expected {expected} pages, got {count}; previous _site preserved')
        replace_directory(work / '_site', ROOT, '_site')
    print(f'PASS: isolated Quarto 1.10.18 render, {count} pages; docs untouched')


if __name__ == '__main__':
    main()
