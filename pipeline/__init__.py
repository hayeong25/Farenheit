"""Pipeline package - ensure backend is importable."""

import sys
from pathlib import Path

_project_root = Path(__file__).parent.parent
_backend_path = str(_project_root / "backend")
if _backend_path not in sys.path:
    sys.path.insert(0, _backend_path)
