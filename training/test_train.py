import torch
import json
from pathlib import Path

from model import GRID_SIZE, MAX_CELLS, NUM_CHANNELS
from self_play import GameExample
import train as train_module
from train import (
    InvalidTrainingCheckpointError,
    YGameDataset,
    append_training_metrics,
    load_training_checkpoint,
    loss_fn,
    save_training_checkpoint,
)


def test_ygame_dataset_returns_spatial_board_norm_policy_and_value():
    example = GameExample(
        encoded_state=[0.0] * (NUM_CHANNELS * GRID_SIZE * GRID_SIZE),
        board_norm=5 / GRID_SIZE,
        mcts_policy=[0.5, 0.5],
        outcome=1.0,
    )

    dataset = YGameDataset([example])
    assert len(dataset) == 1

    spatial, board_norm, policy, value = dataset[0]
    assert spatial.shape == (NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
    assert board_norm.shape == (1,)
    assert policy.shape == (MAX_CELLS,)
    assert value.shape == (1,)

    assert board_norm.item() == 5 / GRID_SIZE
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


def test_training_checkpoint_roundtrip_restores_model_optimizer_and_buffer():
    example = GameExample(
        encoded_state=[0.0] * (NUM_CHANNELS * GRID_SIZE * GRID_SIZE),
        board_norm=5 / GRID_SIZE,
        mcts_policy=[1.0],
        outcome=1.0,
    )
    model = torch.nn.Linear(4, 2)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    checkpoint_dir = Path("training/tmp/test-artifacts")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / "checkpoint.pt"

    save_training_checkpoint(
        str(checkpoint_path),
        model,
        optimizer,
        [example],
        metadata={"next_iteration": 3},
    )
    restored_model, restored_optimizer, restored = load_training_checkpoint(
        str(checkpoint_path),
        model_factory=lambda: torch.nn.Linear(4, 2),
        optimizer_factory=lambda params: torch.optim.Adam(params, lr=1e-3),
    )

    for original, reloaded in zip(model.parameters(), restored_model.parameters()):
        assert torch.equal(original, reloaded)
    assert restored["metadata"]["next_iteration"] == 3
    assert len(restored["replay_buffer"]) == 1
    assert restored_optimizer.state_dict()["param_groups"][0]["lr"] == optimizer.state_dict()["param_groups"][0]["lr"]

    checkpoint_path.unlink(missing_ok=True)


def test_load_training_checkpoint_rejects_empty_checkpoint_file():
    checkpoint_dir = Path("training/tmp/test-artifacts")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / "empty-checkpoint.pt"
    checkpoint_path.write_bytes(b"")

    try:
        load_training_checkpoint(
            str(checkpoint_path),
            model_factory=lambda: torch.nn.Linear(4, 2),
            optimizer_factory=lambda params: torch.optim.Adam(params, lr=1e-3),
        )
    except InvalidTrainingCheckpointError as error:
        assert "empty" in str(error)
    else:
        raise AssertionError("empty checkpoints must be rejected")

    checkpoint_path.unlink(missing_ok=True)


def test_append_training_metrics_writes_jsonl():
    metrics_dir = Path("training/tmp/test-artifacts")
    metrics_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = metrics_dir / "metrics.jsonl"
    if metrics_path.exists():
        metrics_path.unlink()

    append_training_metrics(str(metrics_path), {"iteration": 1, "avg_loss": 0.5, "accepted": True})
    append_training_metrics(str(metrics_path), {"iteration": 2, "avg_loss": 0.25, "accepted": False})

    rows = [json.loads(line) for line in metrics_path.read_text().splitlines()]
    assert rows == [
        {"iteration": 1, "avg_loss": 0.5, "accepted": True},
        {"iteration": 2, "avg_loss": 0.25, "accepted": False},
    ]

    metrics_path.unlink(missing_ok=True)


def test_train_runs_one_iteration_and_persists_checkpoint_metrics_and_exports(monkeypatch):
    example = GameExample(
        encoded_state=[0.0] * (NUM_CHANNELS * GRID_SIZE * GRID_SIZE),
        board_norm=5 / GRID_SIZE,
        mcts_policy=[1.0],
        outcome=1.0,
    )

    def fake_self_play_data(**kwargs):
        assert kwargs["num_games"] == 1
        assert kwargs["board_sizes"] == [5]
        assert kwargs["simulations"] == 1
        return [example]

    def fake_evaluate_models(new_model, old_model, board_sizes, num_games, simulations):
        assert board_sizes == [5]
        assert num_games == 2
        assert simulations == 1
        return 1.0

    def fake_export_onnx(self, path: str):
        Path(path).write_text("stub-onnx", encoding="utf-8")

    monkeypatch.setattr(train_module, "generate_self_play_data", fake_self_play_data)
    monkeypatch.setattr(train_module, "evaluate_models", fake_evaluate_models)
    monkeypatch.setattr(train_module.PolicyValueNet, "export_onnx", fake_export_onnx)

    artifact_root = Path("training/tmp/test-artifacts/train-minimal")
    if artifact_root.exists():
        for path in sorted(artifact_root.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            else:
                path.rmdir()
    artifact_root.mkdir(parents=True, exist_ok=True)

    model_path = artifact_root / "artifacts" / "model.pt"
    onnx_path = artifact_root / "artifacts" / "model.onnx"
    checkpoint_path = artifact_root / "state" / "checkpoint.pt"
    metrics_path = artifact_root / "logs" / "metrics.jsonl"

    train_module.train(
        iterations=1,
        games_per_iter=1,
        simulations=1,
        epochs_per_iter=1,
        batch_size=4,
        board_sizes=[5],
        model_path=str(model_path),
        onnx_path=str(onnx_path),
        checkpoint_path=str(checkpoint_path),
        metrics_path=str(metrics_path),
        evaluation_games=2,
        evaluation_simulations=1,
        buffer_size=10,
    )

    assert model_path.exists()
    assert onnx_path.read_text(encoding="utf-8") == "stub-onnx"

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    assert checkpoint["metadata"]["next_iteration"] == 2
    assert checkpoint["metadata"]["evaluation_games"] == 2
    assert checkpoint["metadata"]["evaluation_simulations"] == 1

    rows = [json.loads(line) for line in metrics_path.read_text(encoding="utf-8").splitlines()]
    assert rows == [
        {
            "iteration": 1,
            "avg_loss": rows[0]["avg_loss"],
            "win_rate": 1.0,
            "accepted": True,
            "buffer_size": 1,
            "evaluation_games": 2,
            "evaluation_simulations": 1,
        }
    ]
    assert isinstance(rows[0]["avg_loss"], float)

    for path in sorted(artifact_root.rglob("*"), reverse=True):
        if path.is_file():
            path.unlink()
        else:
            path.rmdir()


def test_train_runs_requested_iterations_after_checkpoint_resume(monkeypatch):
    example = GameExample(
        encoded_state=[0.0] * (NUM_CHANNELS * GRID_SIZE * GRID_SIZE),
        board_norm=5 / GRID_SIZE,
        mcts_policy=[1.0],
        outcome=1.0,
    )
    self_play_calls = []

    def fake_self_play_data(**kwargs):
        self_play_calls.append(kwargs)
        return [example]

    def fake_evaluate_models(new_model, old_model, board_sizes, num_games, simulations):
        return 1.0

    def fake_export_onnx(self, path: str):
        Path(path).write_text("stub-onnx", encoding="utf-8")

    monkeypatch.setattr(train_module, "generate_self_play_data", fake_self_play_data)
    monkeypatch.setattr(train_module, "evaluate_models", fake_evaluate_models)
    monkeypatch.setattr(train_module.PolicyValueNet, "export_onnx", fake_export_onnx)

    artifact_root = Path("training/tmp/test-artifacts/train-resume")
    if artifact_root.exists():
        for path in sorted(artifact_root.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            else:
                path.rmdir()
    artifact_root.mkdir(parents=True, exist_ok=True)

    model_path = artifact_root / "artifacts" / "model.pt"
    onnx_path = artifact_root / "artifacts" / "model.onnx"
    checkpoint_path = artifact_root / "state" / "checkpoint.pt"
    metrics_path = artifact_root / "logs" / "metrics.jsonl"

    model = train_module.PolicyValueNet()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    save_training_checkpoint(
        str(checkpoint_path),
        model,
        optimizer,
        [example],
        metadata={"next_iteration": 3},
        accepted_model_state_dict=model.state_dict(),
    )

    train_module.train(
        iterations=2,
        games_per_iter=1,
        simulations=1,
        epochs_per_iter=1,
        batch_size=4,
        board_sizes=[5],
        model_path=str(model_path),
        onnx_path=str(onnx_path),
        checkpoint_path=str(checkpoint_path),
        metrics_path=str(metrics_path),
        evaluation_games=2,
        evaluation_simulations=1,
        buffer_size=10,
    )

    assert len(self_play_calls) == 2
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    assert checkpoint["metadata"]["next_iteration"] == 5

    rows = [json.loads(line) for line in metrics_path.read_text(encoding="utf-8").splitlines()]
    assert [row["iteration"] for row in rows] == [3, 4]
    assert onnx_path.read_text(encoding="utf-8") == "stub-onnx"

    for path in sorted(artifact_root.rglob("*"), reverse=True):
        if path.is_file():
            path.unlink()
        else:
            path.rmdir()


def test_train_quarantines_invalid_checkpoint_and_restarts_from_warm_start(monkeypatch):
    example = GameExample(
        encoded_state=[0.0] * (NUM_CHANNELS * GRID_SIZE * GRID_SIZE),
        board_norm=5 / GRID_SIZE,
        mcts_policy=[1.0],
        outcome=1.0,
    )

    def fake_self_play_data(**kwargs):
        return [example]

    def fake_evaluate_models(new_model, old_model, board_sizes, num_games, simulations):
        return 1.0

    def fake_export_onnx(self, path: str):
        Path(path).write_text("stub-onnx", encoding="utf-8")

    monkeypatch.setattr(train_module, "generate_self_play_data", fake_self_play_data)
    monkeypatch.setattr(train_module, "evaluate_models", fake_evaluate_models)
    monkeypatch.setattr(train_module.PolicyValueNet, "export_onnx", fake_export_onnx)

    artifact_root = Path("training/tmp/test-artifacts/train-invalid-checkpoint")
    if artifact_root.exists():
        for path in sorted(artifact_root.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            else:
                path.rmdir()
    artifact_root.mkdir(parents=True, exist_ok=True)

    model_path = artifact_root / "artifacts" / "model.pt"
    onnx_path = artifact_root / "artifacts" / "model.onnx"
    checkpoint_path = artifact_root / "state" / "checkpoint.pt"
    metrics_path = artifact_root / "logs" / "metrics.jsonl"
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_path.write_bytes(b"")

    train_module.train(
        iterations=1,
        games_per_iter=1,
        simulations=1,
        epochs_per_iter=1,
        batch_size=4,
        board_sizes=[5],
        model_path=str(model_path),
        onnx_path=str(onnx_path),
        checkpoint_path=str(checkpoint_path),
        metrics_path=str(metrics_path),
        evaluation_games=2,
        evaluation_simulations=1,
        buffer_size=10,
    )

    assert checkpoint_path.exists()
    quarantined = sorted(checkpoint_path.parent.glob("checkpoint.pt.corrupt*"))
    assert len(quarantined) == 1

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    assert checkpoint["metadata"]["next_iteration"] == 2

    rows = [json.loads(line) for line in metrics_path.read_text(encoding="utf-8").splitlines()]
    assert [row["iteration"] for row in rows] == [1]
    assert onnx_path.read_text(encoding="utf-8") == "stub-onnx"

    for path in sorted(artifact_root.rglob("*"), reverse=True):
        if path.is_file():
            path.unlink()
        else:
            path.rmdir()
