"""Run course-owned browser checks with Node's native WebSocket and sandboxed Chromium.

No npm dependencies, external debugging endpoint or personal browser profile.
"""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request

from safe_paths import checked_path, project_files

root = Path(__file__).resolve().parents[1]
project_files(checked_path(root, '_site'))
evidence = checked_path(root, 'artifacts/platform')
evidence.mkdir(parents=True, exist_ok=True)
binary = os.environ.get('BROWSER_EXECUTABLE') or shutil.which('google-chrome') or shutil.which('chromium')
if not binary and Path('/opt/brave.com/brave/brave').is_file():
    binary = '/opt/brave.com/brave/brave'
if not binary:
    raise SystemExit('Sandboxed Chrome/Chromium required; set BROWSER_EXECUTABLE')
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    debug_port = sock.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='ustudyopen-browser-') as temp:
    work = Path(temp)
    public = work / 'public'
    public.mkdir()
    (public / 'course').symlink_to(root / '_site', target_is_directory=True)
    handler = partial(SimpleHTTPRequestHandler, directory=str(public))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    with checked_path(root, 'artifacts/platform/browser.log').open('w') as log:
        browser = subprocess.Popen([binary, '--headless', '--disable-gpu', '--disable-dev-shm-usage',
                                    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
                                    '--password-store=basic', '--user-data-dir=' + str(work / 'profile'),
                                    '--remote-debugging-address=127.0.0.1', f'--remote-debugging-port={debug_port}', 'about:blank'],
                                   stdout=log, stderr=subprocess.STDOUT)
        try:
            endpoint = f'http://127.0.0.1:{debug_port}'
            for _ in range(100):
                if browser.poll() is not None:
                    raise SystemExit('Browser exited; inspect artifacts/platform/browser.log (sandbox stays enabled)')
                try:
                    urllib.request.urlopen(endpoint + '/json/version', timeout=1).close()
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise SystemExit('Browser did not start')
            env = dict(os.environ, COURSE_DEBUG_URL=endpoint, COURSE_TEST_BASE=f'http://127.0.0.1:{server.server_port}/course/')
            result = subprocess.run(['node', 'tests/browser-course.mjs'], cwd=root, env=env)
        finally:
            browser.terminate()
            try:
                browser.wait(timeout=10)
            except subprocess.TimeoutExpired:
                browser.kill()
                browser.wait()
            server.shutdown()
            server.server_close()
            thread.join()
    raise SystemExit(result.returncode)
