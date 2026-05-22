#!/usr/bin/env python3
"""Compatibility wrapper for the git-aware CHR checker."""

from __future__ import annotations

import pathlib
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import chr as chr_cli  # noqa: E402


def main() -> int:
    return chr_cli.main(["check", *sys.argv[1:]])


if __name__ == "__main__":
    raise SystemExit(main())
