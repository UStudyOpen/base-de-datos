# SPDX-FileCopyrightText: 2026 ngulloa
# SPDX-License-Identifier: MIT
"""Fail closed before building; only main push or confirmed manual runs may publish."""
from pathlib import Path
import json
import os


def authorized(course, event, ref, enabled, confirm):
    if enabled != 'true' or ref != 'refs/heads/main':
        return False
    if event == 'push':
        return course.get('pages_automation_approved') is True
    return event == 'workflow_dispatch' and confirm == 'PUBLICAR'


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    course = json.loads((root / 'course.yml').read_text())['course']
    if not authorized(course, os.getenv('GITHUB_EVENT_NAME'), os.getenv('GITHUB_REF'),
                      os.getenv('USO_PAGES_ENABLED'), os.getenv('USO_PAGES_CONFIRM')):
        raise SystemExit('Publication is not authorized for this event, branch or course')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write('authorized=true\n')
