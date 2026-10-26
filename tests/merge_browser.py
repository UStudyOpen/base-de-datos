"""Combine four complete viewport runs of the identical audit and styles."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
evidence = ROOT / 'artifacts/design-v0.2'
reports = [json.loads((evidence / f'browser-{width}.json').read_text()) for width in (320,390,768,1440)]
if len({r['auditSha256'] for r in reports}) != 1:
    raise SystemExit('Audit source/styles changed between viewport runs')
merged = {'base': reports[0]['base'], 'auditSha256':reports[0]['auditSha256'], 'viewport_runs':4}
for key in ('checks','matrix','simulators','contrast','screenshots','errors'):
    merged[key] = [item for report in reports for item in report[key]]
cases = {(case['route'],case['width'],case['mode']) for case in merged['matrix']}
if len(cases) != 216 or len(merged['matrix']) != 216 or merged['errors']:
    raise SystemExit('Incomplete matrix or browser errors; original viewport evidence retained')
merged['summary'] = {'passed':sum(bool(c['pass']) for c in merged['checks']),
                     'failed':sum(not c['pass'] for c in merged['checks']),
                     'matrixCases':len(cases), 'simulatorCases':len(merged['simulators']),
                     'screenshots':len(merged['screenshots'])}
(evidence / 'browser-results.json').write_text(json.dumps(merged,indent=2)+'\n')
print(json.dumps(merged['summary'],indent=2))
raise SystemExit(bool(merged['summary']['failed']))
