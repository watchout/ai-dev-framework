#!/bin/bash
# ADF Pre-flight Reading Verification
# 必読資料を実際に読んだことを決定論的に検証する
set -e

READING_LIST="${1:-.framework/required-reading.json}"
REPORT_DIR=".framework/preflight"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
OUTPUT_FORMAT="${2:-text}"

if [ ! -f "$READING_LIST" ]; then
  echo "❌ required-reading.json not found: $READING_LIST" >&2
  exit 1
fi

mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/preflight-$(date +%Y%m%d-%H%M%S).md"

TASK=$(python3 -c "import json; print(json.load(open('$READING_LIST')).get('task','unknown'))" 2>/dev/null || echo "unknown")

if [ "$OUTPUT_FORMAT" = "text" ]; then
  cat > "$REPORT" << HEADER
# Pre-flight Reading Report

Generated: $TIMESTAMP
Task: $TASK

## Results

HEADER
fi

python3 << PYEOF >> ${OUTPUT_FORMAT:+$([ "$OUTPUT_FORMAT" = "text" ] && echo "$REPORT" || echo "/dev/stdout")}
import json, subprocess, hashlib, os, sys

data = json.load(open('$READING_LIST'))
output_format = '$OUTPUT_FORMAT'
results = []

for f in data.get('files', []):
    path = f['path']
    ftype = f.get('type', 'local')
    sections = f.get('sections', [])
    reason = f.get('reason', '')
    command = f.get('command', 'rclone cat')

    content = ''
    error_msg = ''
    try:
        if ftype == 'remote':
            cmd_parts = command.split() + [path]
            result = subprocess.run(cmd_parts, capture_output=True, text=True, timeout=30)
            content = result.stdout
            if result.returncode != 0:
                error_msg = result.stderr.strip()[:200]
        else:
            if os.path.exists(path):
                with open(path, 'r', errors='replace') as fh:
                    content = fh.read()
            else:
                error_msg = 'File not found'
    except Exception as e:
        error_msg = str(e)[:200]

    file_result = {
        'path': path,
        'reason': reason,
        'status': 'FAIL',
        'error': error_msg
    }

    if not content:
        results.append(file_result)
        continue

    lines = content.split('\n')
    line_count = len(lines)
    byte_count = len(content.encode('utf-8'))
    first_line = lines[0][:80] if lines else ''
    last_5 = '\n'.join(lines[-5:]) if len(lines) >= 5 else content
    last_hash = hashlib.md5(last_5.encode('utf-8')).hexdigest()

    section_results = {}
    all_found = True
    for section in sections:
        found_lines = [i+1 for i, l in enumerate(lines) if section.lower() in l.lower()]
        section_results[section] = {'found': bool(found_lines), 'line': found_lines[0] if found_lines else None}
        if not found_lines:
            all_found = False

    status = 'PASS' if (all_found or not sections) else 'PARTIAL'
    file_result.update({
        'status': status,
        'lines': line_count,
        'bytes': byte_count,
        'firstLine': first_line,
        'lastHash': last_hash,
        'sections': section_results,
        'error': ''
    })
    results.append(file_result)

summary = {
    'total': len(results),
    'pass': sum(1 for r in results if r['status'] in ('PASS', 'PARTIAL')),
    'fail': sum(1 for r in results if r['status'] == 'FAIL')
}

if output_format == 'json':
    output = {'task': data.get('task',''), 'timestamp': '$TIMESTAMP', 'files': results, 'summary': summary}
    print(json.dumps(output, indent=2, ensure_ascii=False))
else:
    for r in results:
        print(f"---\n\n### {r['path']}")
        print(f"Reason: {r['reason']}\n")
        if r['status'] == 'FAIL':
            err = r.get('error', 'unknown')
            print(f"- Status: ❌ **FAIL** ({err})\n")
            continue
        print(f"- Lines: {r['lines']}")
        print(f"- Size: {r['bytes']} bytes")
        print(f"- First line: \`{r['firstLine']}\`")
        print(f"- Last 5 lines hash: \`{r['lastHash']}\`")
        if r.get('sections'):
            print("- Key sections:")
            for sec, info in r['sections'].items():
                if info['found']:
                    print(f"  - ✅ \`{sec}\` — found (line {info['line']})")
                else:
                    print(f"  - ❌ \`{sec}\` — **not found**")
        print(f"- Status: {'✅ PASS' if r['status'] == 'PASS' else '⚠️ PARTIAL'}\n")

    print("---\n\n## Summary\n")
    print(f"| Item | Value |")
    print(f"|------|-------|")
    print(f"| Files | {summary['total']} |")
    print(f"| Pass | {summary['pass']} |")
    print(f"| Fail | {summary['fail']} |")
    print(f"| Timestamp | $TIMESTAMP |")
    print(f"\n**Present this report to the approver before starting implementation.**")
PYEOF

if [ "$OUTPUT_FORMAT" = "text" ]; then
  echo ""
  cat "$REPORT"
  echo ""
  echo "Report saved: $REPORT"
fi
