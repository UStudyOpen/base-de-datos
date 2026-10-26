"""Bounded local file operations shared by course validation and installation."""
from pathlib import Path, PurePosixPath, PureWindowsPath
import os
import shutil
import tempfile


class UnsafePath(ValueError):
    pass


def checked_path(root, relative):
    """Reject traversal and every symlink component before reading or writing."""
    root = Path(root)
    if root.is_symlink():
        raise UnsafePath('Symlink root is not supported')
    if (not isinstance(relative, str) or not relative or '\\' in relative
            or any(ord(char) < 32 for char in relative)
            or PurePosixPath(relative).is_absolute() or PureWindowsPath(relative).drive
            or any(part in {'', '.', '..'} for part in relative.split('/'))):
        raise UnsafePath(f'Unsafe relative path: {relative!r}')
    current = root
    parts = PurePosixPath(relative).parts
    for index, part in enumerate(parts):
        current /= part
        if current.is_symlink():
            raise UnsafePath('Symlink component: ' + relative)
        if index < len(parts) - 1 and current.exists() and not current.is_dir():
            raise UnsafePath('Non-directory parent: ' + relative)
    return current


def project_files(root, skip=(), exclude_env=False):
    """Walk without following symlinks, excluding only deliberately ignored data."""
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise UnsafePath('Expected a regular directory: ' + str(root))
    files = []
    for directory, dirs, names in os.walk(root, followlinks=False):
        parent = Path(directory)
        keep = []
        for name in dirs:
            if name in skip or (exclude_env and name.startswith('.env')):
                continue
            path = checked_path(root, (parent / name).relative_to(root).as_posix())
            if not path.is_dir():
                raise UnsafePath('Expected directory: ' + str(path.relative_to(root)))
            keep.append(name)
        dirs[:] = keep
        for name in names:
            if name in skip or (exclude_env and name.startswith('.env')):
                continue
            path = checked_path(root, (parent / name).relative_to(root).as_posix())
            if not path.is_file():
                raise UnsafePath('Expected regular file: ' + str(path.relative_to(root)))
            files.append(path)
    return sorted(files)


def replace_directory(source, root, relative):
    """Copy completely before replacing a generated directory; restore on failure."""
    source, root = Path(source), Path(root)
    target = checked_path(root, relative)
    if target.exists() and not target.is_dir():
        raise UnsafePath('Expected output directory: ' + relative)
    project_files(source)
    stage = Path(tempfile.mkdtemp(prefix='.ustudyopen-output-', dir=root))
    preserve = False
    try:
        shutil.copytree(source, stage / 'new')
        target = checked_path(root, relative)
        had_previous = target.exists()
        try:
            if had_previous:
                os.replace(target, stage / 'previous')
            os.replace(stage / 'new', checked_path(root, relative))
        except BaseException:
            try:
                if (stage / 'previous').exists():
                    if target.exists():
                        os.replace(target, stage / 'failed-output')
                    os.replace(stage / 'previous', checked_path(root, relative))
                elif not had_previous and target.exists():
                    os.replace(target, stage / 'failed-output')
            except (OSError, UnsafePath) as error:
                preserve = True
                raise RuntimeError('Output rollback failed; previous site preserved at ' + str(stage)) from error
            raise
    finally:
        if not preserve:
            shutil.rmtree(stage)
