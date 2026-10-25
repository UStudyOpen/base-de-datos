"""Summarize the eight completed existing suites; reject missing/failed evidence."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
evidence = ROOT / 'artifacts/design-v0.2'
results = []
for theme in ('light', 'dark'):
    for suite in ('bplus', 'hashing', 'query-plan', 'buffer'):
        path = evidence / f'{suite}-{theme}.log'
        text = path.read_text()
        decoder = json.JSONDecoder()
        reports = []
        for i, char in enumerate(text):
            if char == '{':
                try:
                    value, _ = decoder.raw_decode(text[i:])
                    if isinstance(value, dict) and 'checkedSnapshots' in value and 'screenshots' in value:
                        reports.append(value)
                except json.JSONDecodeError:
                    pass
        if not reports:
            raise SystemExit(f'No completed report in {path.name}')
        report = reports[-1]
        if report['errors'] or report['failed']:
            raise SystemExit(f'Browser errors in {path.name}: {report}')
        screenshots = sorted(str(p.relative_to(ROOT)) for p in Path(report['screenshots']).glob('*.png'))
        results.append({'suite': suite, 'theme': theme, 'snapshots': report['checkedSnapshots'],
                        'screenshots': screenshots, 'errors': report['errors'], 'failed_resources': report['failed']})
result = {'suites': results, 'completed_suites': len(results),
          'snapshots': sum(r['snapshots'] for r in results),
          'screenshots': sum(len(r['screenshots']) for r in results)}
(evidence / 'regression-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k:v for k,v in result.items() if k != 'suites'}, indent=2))
