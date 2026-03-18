import pytest
import torch
from train import YGameDataset, loss_fn
from self_play import GameExample
from model import PolicyValueNet

def test_ygame_dataset():
    example = GameExample(
        encoded_state=[0.0] * 274,
        mcts_policy=[0.5, 0.5],
        outcome=1.0
    )

    dataset = YGameDataset([example], max_cells=PolicyValueNet.MAX_CELLS)
    assert len(dataset) == 1

    state, policy, value = dataset[0]
    assert state.shape == (274,)
    assert policy.shape == (PolicyValueNet.MAX_CELLS,)
    assert value.shape == (1,)

    assert policy[0].item() == 0.5
    assert policy[1].item() == 0.5
    assert policy[2].item() == 0.0
    assert value.item() == 1.0

def test_loss_fn():
    pred_policy = torch.tensor([[-0.1, -2.3, -2.3]])
    pred_value = torch.tensor([[0.8]])
    target_policy = torch.tensor([[1.0, 0.0, 0.0]])
    target_value = torch.tensor([[1.0]])
    loss = loss_fn(pred_policy, pred_value, target_policy, target_value)

    assert loss.item() > 0
    assert not torch.isnan(loss)
