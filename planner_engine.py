"""Legacy planner compatibility shim.

Realworld Planner now runs fully in the browser for GitHub Pages deployment.
The previous Python planner implementation is preserved in `legacy_backend/planner_engine.py`.
"""

from legacy_backend.planner_engine import *  # noqa: F401,F403
