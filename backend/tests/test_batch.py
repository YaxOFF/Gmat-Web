from app import batch

STARTUP = """PLUGIN                  = ../plugins/libFormation
PLUGIN                  = ../plugins/libEventLocator
# PLUGIN                  = ../plugins/libExternalForceModel_py312
# PLUGIN                  = ../plugins/proprietary/libMarsGRAM
"""


def test_disabled_plugins():
    assert batch.disabled_plugins(STARTUP) == {"libExternalForceModel", "libMarsGRAM"}


def test_plugin_of():
    off = batch.disabled_plugins(STARTUP)
    # plugins activos se corren: no se marcan por tipo
    assert batch.plugin_of("Create Formation F;\nCreate ContactLocator CL;", off) is None
    assert batch.plugin_of("FM.Drag.AtmosphereModel = MarsGRAM2005;", off).startswith("libMarsGRAM")
    assert batch.plugin_of("% FM.Drag.AtmosphereModel = MarsGRAM2005;", off) is None
    assert batch.plugin_of("FM.Drag.AtmosphereModel = MarsGRAM2005;", set()) is None


def test_solver_summary():
    evs = [{"type": "log"},
           {"type": "solver", "event": "start", "solver": "DC"},
           {"type": "solver", "event": "iteration", "solver": "DC", "variables": [{"name": "A", "value": 1.0}]},
           {"type": "solver", "event": "iteration", "solver": "DC", "variables": [{"name": "A", "value": 2.0}]},
           {"type": "solver", "event": "end", "solver": "DC", "status": "converged"}]
    assert batch.solver_summary(evs) == {"DC": {"runs": 1, "final": [{"A": 2.0}], "status": "converged"}}
    assert batch.solver_summary([{"type": "log"}]) is None
