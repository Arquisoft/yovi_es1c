# training/train.py
import argparse
import copy
import json
import os
import pickle
import random
import tempfile
from typing import Callable

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

from model import PolicyValueNet, total_cells, GRID_SIZE, MAX_CELLS, NUM_CHANNELS
from self_play import GameExample, generate_self_play_data


# ─────────────────────────────────────────────
#  Dataset
# ─────────────────────────────────────────────

class YGameDataset(Dataset):
    def __init__(self, examples: list[GameExample]):
        self.examples = examples

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        ex = self.examples[idx]

        # spatial: (6, 32, 32)
        spatial = torch.tensor(ex.encoded_state, dtype=torch.float32).view(
            NUM_CHANNELS, GRID_SIZE, GRID_SIZE
        )

        # board_norm: (1,)
        board_norm = torch.tensor([ex.board_norm], dtype=torch.float32)

        # policy target: padeamos hasta MAX_CELLS
        policy = torch.zeros(MAX_CELLS)
        policy[:len(ex.mcts_policy)] = torch.tensor(ex.mcts_policy, dtype=torch.float32)

        # value target: (1,)
        value = torch.tensor([ex.outcome], dtype=torch.float32)

        return spatial, board_norm, policy, value


# ─────────────────────────────────────────────
#  Loss  (sin cambios — sigue siendo correcta)
# ─────────────────────────────────────────────

def loss_fn(
        pred_policy:   torch.Tensor,
        pred_value:    torch.Tensor,
        target_policy: torch.Tensor,
        target_value:  torch.Tensor,
) -> torch.Tensor:
    """
    Loss AlphaZero: L = MSE(v, z) − π^T log(p)
    pred_policy:   (batch, MAX_CELLS) — log_softmax
    pred_value:    (batch, 1)         — tanh
    target_policy: (batch, MAX_CELLS) — política MCTS normalizada
    target_value:  (batch, 1)         — resultado real
    """
    value_loss  = F.mse_loss(pred_value, target_value)
    policy_loss = -(target_policy * pred_policy).sum(dim=1).mean()
    return value_loss + policy_loss


def ensure_parent_dir(path: str):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


class InvalidTrainingCheckpointError(RuntimeError):
    """Raised when a checkpoint file exists but cannot be safely resumed."""


def _atomic_torch_save(payload: dict, path: str):
    checkpoint_dir = os.path.dirname(path) or "."
    file_prefix = f".{os.path.basename(path)}."
    fd, temp_path = tempfile.mkstemp(
        prefix=file_prefix,
        suffix=".tmp",
        dir=checkpoint_dir,
    )
    os.close(fd)
    try:
        with open(temp_path, "wb") as handle:
            torch.save(payload, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def _is_corrupt_checkpoint_runtime_error(error: RuntimeError) -> bool:
    message = str(error).lower()
    return any(
        marker in message
        for marker in (
            "pytorchstreamreader failed",
            "failed finding central directory",
            "unexpected eof",
            "invalid header",
        )
    )


def _load_checkpoint_payload(path: str) -> dict:
    if os.path.getsize(path) == 0:
        raise InvalidTrainingCheckpointError(f"Checkpoint {path} is empty")

    try:
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    except (EOFError, pickle.UnpicklingError) as error:
        raise InvalidTrainingCheckpointError(
            f"Checkpoint {path} is truncated or unreadable"
        ) from error
    except RuntimeError as error:
        if _is_corrupt_checkpoint_runtime_error(error):
            raise InvalidTrainingCheckpointError(
                f"Checkpoint {path} is corrupted"
            ) from error
        raise

    if not isinstance(checkpoint, dict):
        raise InvalidTrainingCheckpointError(
            f"Checkpoint {path} has an unexpected payload type"
        )

    required_keys = {"model_state_dict", "optimizer_state_dict", "replay_buffer", "metadata"}
    missing_keys = sorted(required_keys - checkpoint.keys())
    if missing_keys:
        raise InvalidTrainingCheckpointError(
            f"Checkpoint {path} is missing required keys: {', '.join(missing_keys)}"
        )

    return checkpoint


def quarantine_checkpoint(path: str) -> str:
    candidate = f"{path}.corrupt"
    suffix = 1
    while os.path.exists(candidate):
        suffix += 1
        candidate = f"{path}.corrupt.{suffix}"
    os.replace(path, candidate)
    return candidate


def save_training_checkpoint(
        path: str,
        model: torch.nn.Module,
        optimizer: torch.optim.Optimizer,
        replay_buffer: list[GameExample],
        metadata: dict | None = None,
        accepted_model_state_dict: dict | None = None,
):
    ensure_parent_dir(path)
    payload = {
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "replay_buffer": replay_buffer,
        "metadata": metadata or {},
    }
    if accepted_model_state_dict is not None:
        payload["accepted_model_state_dict"] = accepted_model_state_dict
    _atomic_torch_save(payload, path)


def load_training_checkpoint(
        path: str,
        model_factory: Callable[[], torch.nn.Module],
        optimizer_factory: Callable[[list[torch.nn.Parameter]], torch.optim.Optimizer],
) -> tuple[torch.nn.Module, torch.optim.Optimizer, dict]:
    checkpoint = _load_checkpoint_payload(path)
    model = model_factory()
    model.load_state_dict(checkpoint["model_state_dict"])
    optimizer = optimizer_factory(list(model.parameters()))
    optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
    return model, optimizer, checkpoint


def append_training_metrics(path: str, record: dict):
    ensure_parent_dir(path)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")


# ─────────────────────────────────────────────
#  Evaluación: nuevo modelo vs anterior
# ─────────────────────────────────────────────

def evaluate_models(
        new_model:   PolicyValueNet,
        old_model:   PolicyValueNet,
        board_sizes: list[int],
        num_games:   int = 20,
        simulations: int = 50,
) -> float:
    new_wins = 0

    for i in range(num_games):
        size = random.choice(board_sizes)
        if i % 2 == 0:
            first, second = new_model, old_model
            new_is_player0 = True
        else:
            first, second = old_model, new_model
            new_is_player0 = False

        from self_play import BoardState, MctsNode, mcts_search
        state = BoardState.new(size)

        while not state.done:
            model = first if state.current_player == 0 else second
            root  = MctsNode(state)
            mcts_search(root, model, simulations)
            move  = root.most_visited_move()
            state = state.apply_move(move)

        if state.winner == (0 if new_is_player0 else 1):
            new_wins += 1

    win_rate = new_wins / num_games
    print(f"  Evaluación: nuevo={new_wins}/{num_games} ({win_rate:.1%})")
    return win_rate


# ─────────────────────────────────────────────
#  Bucle principal de entrenamiento
# ─────────────────────────────────────────────

def train(
        iterations:         int   = 20,
        games_per_iter:     int   = 30,
        simulations:        int   = 150,
        epochs_per_iter:    int   = 5,
        batch_size:         int   = 256,
        lr:                 float = 3e-4,     # conservador para fine-tuning
        board_sizes:        list  = None,
        model_path:         str   = "../gamey/models/yovi_model.pt",
        onnx_path:          str   = "../gamey/models/yovi_model.onnx",
        checkpoint_path:    str | None = None,
        metrics_path:       str | None = None,
        evaluation_games:   int   = 40,
        evaluation_simulations: int = 50,
        win_rate_threshold: float = 0.45,
        buffer_size:        int   = 50_000,
):
    if board_sizes is None:
        board_sizes = [5, 7, 9, 11]
    if iterations < 1:
        raise ValueError("iterations must be >= 1")

    ensure_parent_dir(model_path)
    ensure_parent_dir(onnx_path)
    checkpoint_path = checkpoint_path or os.path.splitext(model_path)[0] + "_checkpoint.pt"
    metrics_path = metrics_path or os.path.splitext(model_path)[0] + "_metrics.jsonl"

    def make_model() -> PolicyValueNet:
        return PolicyValueNet()

    def make_optimizer(params: list[torch.nn.Parameter]) -> torch.optim.Optimizer:
        return torch.optim.Adam(params, lr=lr, weight_decay=1e-4)

    replay_buffer: list[GameExample] = []
    start_iteration = 1

    # ── Cargar o inicializar modelo ───────────────────────────────────
    if os.path.exists(model_path):
        print(f"Cargando modelo existente desde {model_path} (warm-start)")
        model = PolicyValueNet.load(model_path)
        optimizer = make_optimizer(list(model.parameters()))
        old_model = copy.deepcopy(model)
    else:
        print("Inicializando modelo nuevo (pesos aleatorios)")
        model = make_model()
        optimizer = make_optimizer(list(model.parameters()))
        old_model = copy.deepcopy(model)

    if os.path.exists(checkpoint_path):
        print(f"Cargando checkpoint de entrenamiento desde {checkpoint_path}")
        try:
            model, optimizer, checkpoint = load_training_checkpoint(
                checkpoint_path,
                model_factory=make_model,
                optimizer_factory=make_optimizer,
            )
        except InvalidTrainingCheckpointError as error:
            quarantined_path = quarantine_checkpoint(checkpoint_path)
            print(
                "Checkpoint inv\u00e1lido o incompleto; se ignorar\u00e1 para reanudar "
                f"desde el warm-start. Copia movida a {quarantined_path}. Error: {error}"
            )
        else:
            replay_buffer = checkpoint.get("replay_buffer", [])
            start_iteration = checkpoint.get("metadata", {}).get("next_iteration", 1)
            old_model = make_model()
            old_model.load_state_dict(checkpoint.get("accepted_model_state_dict", model.state_dict()))

    end_iteration = start_iteration + iterations - 1
    if start_iteration > 1:
        print(
            f"Reanudando en iteración global {start_iteration}; "
            f"ejecutando {iterations} iteraciones nuevas hasta {end_iteration}"
        )

    for step, iteration in enumerate(range(start_iteration, end_iteration + 1), start=1):
        print(f"\n{'='*50}")
        print(f"Iteración {step}/{iterations} (global {iteration})")
        print(f"{'='*50}")

        # ── 1. Self-play ──────────────────────────────────────────────
        print(f"[1/3] Self-play ({games_per_iter} partidas)...")
        model.eval()
        new_examples = generate_self_play_data(
            model       = model,   # siempre usamos el modelo (warm-start desde iter 1)
            num_games   = games_per_iter,
            board_sizes = board_sizes,
            simulations = simulations,
        )
        replay_buffer.extend(new_examples)

        if len(replay_buffer) > buffer_size:
            replay_buffer = replay_buffer[-buffer_size:]
        print(f"  Buffer: {len(replay_buffer)} ejemplos")
        if not replay_buffer:
            raise RuntimeError("Self-play did not generate any training examples.")

        # ── 2. Entrenamiento ──────────────────────────────────────────
        print(f"[2/3] Entrenando ({epochs_per_iter} épocas)...")
        model.train()
        dataset    = YGameDataset(replay_buffer)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True, drop_last=False)

        for epoch in range(1, epochs_per_iter + 1):
            total_loss = 0.0
            batch_count = 0
            for spatials, board_norms, policies, values in dataloader:
                optimizer.zero_grad()
                pred_policy, pred_value = model(spatials, board_norms)
                loss = loss_fn(pred_policy, pred_value, policies, values)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()
                total_loss += loss.item()
                batch_count += 1
            avg_loss = total_loss / batch_count
            print(f"  Epoch {epoch}/{epochs_per_iter} - loss: {avg_loss:.4f}")

        # ── 3. Evaluación ─────────────────────────────────────────────
        print(f"[3/3] Evaluando nuevo modelo vs anterior...")
        win_rate = evaluate_models(
            model, old_model, board_sizes,
            num_games=evaluation_games, simulations=evaluation_simulations,
        )
        accepted = win_rate >= win_rate_threshold
        if win_rate >= win_rate_threshold:
            print(f"  New model accepted ({win_rate:.1%} >= {win_rate_threshold:.1%})")
            old_model = copy.deepcopy(model)
            model.save(model_path)
        else:
            print(f"  New model rejected ({win_rate:.1%} < {win_rate_threshold:.1%}), restoring previous weights")
            model = copy.deepcopy(old_model)
            optimizer = make_optimizer(list(model.parameters()))

        save_training_checkpoint(
            checkpoint_path,
            model,
            optimizer,
            replay_buffer,
            metadata={
                "next_iteration": iteration + 1,
                "board_sizes": list(board_sizes),
                "win_rate": win_rate,
                "accepted": accepted,
                "evaluation_games": evaluation_games,
                "evaluation_simulations": evaluation_simulations,
            },
            accepted_model_state_dict=old_model.state_dict(),
        )
        append_training_metrics(
            metrics_path,
            {
                "iteration": iteration,
                "avg_loss": avg_loss,
                "win_rate": win_rate,
                "accepted": accepted,
                "buffer_size": len(replay_buffer),
                "evaluation_games": evaluation_games,
                "evaluation_simulations": evaluation_simulations,
            },
        )

    # ── Exportar a ONNX ───────────────────────────────────────────────
    print(f"\nExporting ONNX model to {onnx_path}")
    model.export_onnx(onnx_path)
    print("\nTraining completed.")
    print(f"  Modelo PyTorch : {model_path}")
    print(f"  Modelo ONNX    : {onnx_path}")


# ─────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Entrenamiento AlphaZero para el juego Y")
    parser.add_argument(
        "--iterations",
        type=int,
        default=20,
        help="Número de iteraciones nuevas a ejecutar; si hay checkpoint continúa desde next_iteration",
    )
    parser.add_argument("--games-per-iter",  type=int,   default=30)
    parser.add_argument("--simulations",     type=int,   default=150)
    parser.add_argument("--epochs",          type=int,   default=5)
    parser.add_argument("--batch-size",      type=int,   default=256)
    parser.add_argument("--lr",              type=float, default=3e-4)
    parser.add_argument("--board-sizes",     type=int,   nargs="+", default=[5, 7, 9, 11])
    parser.add_argument("--model-path",      type=str,   default="../gamey/models/yovi_model.pt")
    parser.add_argument("--onnx-path",       type=str,   default="../gamey/models/yovi_model.onnx")
    parser.add_argument("--checkpoint-path", type=str,   default=None)
    parser.add_argument("--metrics-path",    type=str,   default=None)
    parser.add_argument("--eval-games",      type=int,   default=40)
    parser.add_argument("--eval-simulations", type=int,  default=50)
    parser.add_argument("--win-threshold",   type=float, default=0.45)
    parser.add_argument("--buffer-size",     type=int,   default=50_000)
    args = parser.parse_args()

    train(
        iterations        = args.iterations,
        games_per_iter    = args.games_per_iter,
        simulations       = args.simulations,
        epochs_per_iter   = args.epochs,
        batch_size        = args.batch_size,
        lr                = args.lr,
        board_sizes       = args.board_sizes,
        model_path        = args.model_path,
        onnx_path         = args.onnx_path,
        checkpoint_path   = args.checkpoint_path,
        metrics_path      = args.metrics_path,
        evaluation_games  = args.eval_games,
        evaluation_simulations = args.eval_simulations,
        win_rate_threshold= args.win_threshold,
        buffer_size       = args.buffer_size,
    )
