import json
from pathlib import Path

from model import GRID_SIZE, encode_board


FIXTURE_PATH = Path(__file__).with_name("fixtures").joinpath("encoder_contract_cases.json")


def test_python_encoder_matches_shared_contract_fixture():
    cases = json.loads(FIXTURE_PATH.read_text())

    for case in cases:
        spatial, board_norm = encode_board(
            case["board_state"],
            case["board_size"],
            case["current_player"],
        )

        assert abs(board_norm - case["board_norm"]) < 1e-6, case["name"]

        expected = {
            (entry["channel"], entry["row"], entry["col"]): entry["value"]
            for entry in case["non_zero"]
        }

        observed = {}
        for channel in range(spatial.shape[0]):
            for row in range(case["board_size"]):
                for col in range(row + 1):
                    value = float(spatial[channel, row, col])
                    if abs(value) > 1e-9:
                        observed[(channel, row, col)] = value

        assert observed.keys() == expected.keys(), case["name"]
        for key, expected_value in expected.items():
            assert abs(observed[key] - expected_value) < 1e-6, (case["name"], key)

        assert spatial.shape == (6, GRID_SIZE, GRID_SIZE)
