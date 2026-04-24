import os
from pathlib import Path

import torch

from model import GRID_SIZE, MAX_CELLS, PolicyValueNet, encode_board, total_cells


def test_total_cells():
    assert total_cells(5) == 15
    assert total_cells(13) == 91


def test_encode_board_returns_spatial_grid_and_board_norm():
    board = [1, 2, 0, 0, 1, 2]
    spatial, board_norm = encode_board(board, board_size=3, current_player=0)

    assert spatial.shape == (6, GRID_SIZE, GRID_SIZE)
    assert board_norm == 3 / GRID_SIZE

    assert spatial[0, 0, 0].item() == 1.0
    assert spatial[1, 1, 0].item() == 1.0
    assert spatial[2, 1, 1].item() == 1.0
    assert spatial[3, 0, 0].item() == 1.0
    assert spatial[4, 2, 2].item() == 1.0
    assert spatial[5, 2, 0].item() == 1.0


def test_policy_value_net_forward_shapes():
    net = PolicyValueNet(channels=16, num_res_blocks=2)
    spatial = torch.zeros(2, 6, GRID_SIZE, GRID_SIZE)
    board_norm = torch.tensor([[5 / GRID_SIZE], [7 / GRID_SIZE]], dtype=torch.float32)

    policy, value = net(spatial, board_norm)

    assert policy.shape == (2, MAX_CELLS)
    assert value.shape == (2, 1)


def test_policy_value_net_predict_returns_trimmed_policy():
    net = PolicyValueNet(channels=16, num_res_blocks=2)
    board = [0] * total_cells(5)

    policy, value = net.predict(board, board_size=5, current_player=0)

    assert len(policy) == total_cells(5)
    assert abs(sum(policy) - 1.0) < 1e-5
    assert -1.0 <= value <= 1.0


def test_save_and_load_roundtrip_preserves_weights():
    net = PolicyValueNet(channels=16, num_res_blocks=2)
    tmp_dir = Path("training/tmp/test-artifacts")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    path = tmp_dir / "test_model.pt"

    net.save(str(path))
    assert os.path.exists(path)

    loaded_net = PolicyValueNet.load(str(path), channels=16, num_res_blocks=2)
    assert loaded_net is not None

    original = net.state_dict()
    loaded = loaded_net.state_dict()
    assert original.keys() == loaded.keys()
    for key in original:
        assert torch.equal(original[key], loaded[key]), key

    path.unlink(missing_ok=True)
