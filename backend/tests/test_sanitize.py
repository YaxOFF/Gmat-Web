from pathlib import Path

import pytest

from app import config
from app.engine.sanitize import ScriptRejected, sanitize

OUT = Path("C:/tmp/run-x")


def test_absolute_output_path_is_rewritten_to_run_dir():
    src = ("Create ReportFile RF;\n"
           "RF.Filename = 'C:\\Windows\\System32\\evil.txt';  % comentario\n"
           "Create EphemerisFile E;\nE.Filename = /etc/passwd;\n")
    out = sanitize(src, OUT)
    assert "RF.Filename = 'C:/tmp/run-x/evil.txt';  % comentario" in out
    assert "E.Filename = 'C:/tmp/run-x/passwd';" in out
    assert "System32" not in out and "/etc/" not in out


def test_list_of_output_files_and_input_types():
    src = ("Create TrackingFileSet T;\nT.FileName = {'../a/b.gmd', 'c.gmd'};\n"
           "Create Simulator Sim;\nSim.AddData = {T};\n"
           "Create ThrustHistoryFile TH;\nTH.FileName = '../samples/x.thf';\n"
           "Sat.DryMass = 850;\n")
    out = sanitize(src, OUT)
    assert "T.FileName = {'C:/tmp/run-x/b.gmd', 'C:/tmp/run-x/c.gmd'};" in out  # el Simulator escribe
    assert "TH.FileName = '../samples/x.thf';" in out  # solo lectura y no existe: se deja
    assert "Sat.DryMass = 850;" in out


def test_tracking_file_without_simulator_is_input():
    src = "Create TrackingFileSet T;\nT.FileName = {'../a/b.gmd'};\nCreate BatchEstimator B;\n"
    assert "T.FileName = {'../a/b.gmd'};" in sanitize(src, OUT)


def test_relative_input_found_from_samples_becomes_absolute(monkeypatch, tmp_path):
    (tmp_path / "samples" / "SupportFiles").mkdir(parents=True)
    (tmp_path / "samples" / "SupportFiles" / "m.txt").write_text("x")
    monkeypatch.setattr(config, "GMAT_HOME", str(tmp_path))
    src = ("Create GroundStation G;\nG.HorizonMaskFileName = '../samples/SupportFiles/m.txt';\n"
           "Create TrackingFileSet T;\nT.FileName = {'SupportFiles/m.txt', 'none.gmd'};\n"
           "Create ReportFile RF;\nRF.Filename = '../samples/SupportFiles/m.txt';\n")
    out = sanitize(src, OUT)
    abs_ = (tmp_path / "samples" / "SupportFiles" / "m.txt").resolve().as_posix()
    assert f"G.HorizonMaskFileName = '{abs_}';" in out
    assert f"T.FileName = {{'{abs_}', 'none.gmd'}};" in out
    assert "RF.Filename = 'C:/tmp/run-x/m.txt';" in out  # salida: nunca fuera de la corrida


@pytest.mark.parametrize("line", [
    "SystemCommand 'rm -rf /';",
    "System('del *');",
    "CallPythonFunction foo;",
    "[x] = Python.os.system('ls');",
    "Create MatlabFunction f;",
    "Create GmatFunction g;",
    "#Include 'other.script'",
])
def test_forbidden_commands_are_rejected_with_line(line):
    with pytest.raises(ScriptRejected) as e:
        sanitize(f"Create Spacecraft Sat;\n{line}\n", OUT)
    assert e.value.line == 2


def test_forbidden_words_in_comments_and_strings_are_ok():
    out = sanitize("% SystemCommand en un comentario\nCreate CoordinateSystem CS;\n"
                   "Create ReportFile R;\nR.Filename = 'System.txt';\n", OUT)
    assert "CoordinateSystem CS" in out


def test_gui_only_viewers_are_commented_keeping_line_numbers():
    src = "Create OrbitView OV;\nOV.Add = {Sat};\nBeginMissionSequence;\nToggle OV On;\n"
    out = sanitize(src, OUT)
    lines = out.splitlines()
    assert len(lines) == 4
    assert all(lines[i].startswith("% [gmat-web]") for i in (0, 1, 3))
    assert lines[2] == "BeginMissionSequence;"


def test_size_limit():
    with pytest.raises(ScriptRejected):
        sanitize("%" * 600_000, OUT)
