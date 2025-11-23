#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pathlib import Path
import re

# Configuration
BASE_DATE = "2025-11-23"
HOUR = 10
SECOND = 45


def has_frontmatter(text: str) -> bool:
    # Skip leading whitespace then check if starts with frontmatter marker
    return text.lstrip().startswith('---')


def minute_from_name(stem: str) -> int:
    # Extract leading sequence number like "01" or "2" from filename stem
    m = re.match(r"^(\d{1,2})", stem)
    if m:
        return int(m.group(1))
    return 0


def process_file(p: Path) -> bool:
    try:
        text = p.read_text(encoding='utf-8')
    except Exception:
        print(f"ERROR reading: {p.name}")
        return False

    if has_frontmatter(text):
        print(f"SKIP (has frontmatter): {p.name}")
        return False

    stem = p.stem
    minute = minute_from_name(stem)
    minute_str = f"{minute:02d}"
    date = f"{BASE_DATE} {HOUR:02d}:{minute_str}:{SECOND:02d}"

    front = f"---\ntitle: \"{stem}\"\ndate: {date}\n---\n\n"

    try:
        p.write_text(front + text, encoding='utf-8')
    except Exception:
        print(f"ERROR writing: {p.name}")
        return False

    print(f"Updated: {p.name} -> date minute {minute_str}")
    return True


def main():
    cwd = Path('.')
    files = sorted(cwd.glob('*.md'))
    if not files:
        print("No .md files found in current directory.")
        return

    for f in files:
        process_file(f)


if __name__ == '__main__':
    main()
