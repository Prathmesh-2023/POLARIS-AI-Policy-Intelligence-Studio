"""Shared test setup.

`pythonpath = .` in pytest.ini covers pytest 7+; this keeps the suite runnable on
older pytest and when a test file is executed directly.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
