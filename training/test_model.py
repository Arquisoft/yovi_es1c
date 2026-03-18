import pytest
import torch
import os
from model import total_cells, encode_board, pad_encoded_input, PolicyValueNet

def test_total_cells():
    assert total_cells(5) == 15
    assert total_cells(13) == 91

def test_encode_board():
    board = [0] * 15
    board[0] = 1
    board[1] = 2

    encoded = encode_board(board, board_size=5, current_player=0)
    assert encoded.shape == (46,)
    assert encoded[0].item() == 1.0
    assert encoded[15 + 1].item() == 1.0
    assert encoded[30 + 2].item() == 1.0

def test_pad_encoded_input():
    encoded = torch.ones(46)
    padded = pad_encoded_input(encoded, board_size=5)
    assert padded.shape == (274,)
    assert padded[-1].item() == 1.0

def test_policy_value_net_forward():
    net = PolicyValueNet(hidden_size=64)
    x = torch.zeros(2, 274)
    policy, value = net(x)

    assert policy.shape == (2, 91)
    assert value.shape == (2, 1)

def test_policy_value_net_predict():
    net = PolicyValueNet(hidden_size=64)
    board = [0] * 15
    policy, value = net.predict(board, board_size=5, current_player=0)

    assert len(policy) == 15
    assert -1.0 <= value <= 1.0

def test_save_load_model(tmp_path):
    net = PolicyValueNet(hidden_size=64)
    path = tmp_path / "test_model.pt"

    net.save(str(path))
    assert os.path.exists(path)

    loaded_net = PolicyValueNet.load(str(path), hidden_size=64)
    assert loaded_net is not None
