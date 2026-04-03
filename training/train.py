# training/train.py
import argparse
import copy
import os
import random

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
        win_rate_threshold: float = 0.45,
        buffer_size:        int   = 50_000,
):
    if board_sizes is None:
        board_sizes = [5, 7, 9, 11]

    os.makedirs(os.path.dirname(model_path), exist_ok=True)

    # ── Cargar o inicializar modelo ───────────────────────────────────
    if os.path.exists(model_path):
        print(f"Cargando modelo existente desde {model_path} (warm-start)")
        model = PolicyValueNet.load(model_path)
    else:
        print("Inicializando modelo nuevo (pesos aleatorios)")
        model = PolicyValueNet()

    # old_model se inicializa siempre ANTES del bucle
    old_model = copy.deepcopy(model)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    replay_buffer: list[GameExample] = []

    for iteration in range(1, iterations + 1):
        print(f"\n{'='*50}")
        print(f"Iteración {iteration}/{iterations}")
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

        # ── 2. Entrenamiento ──────────────────────────────────────────
        print(f"[2/3] Entrenando ({epochs_per_iter} épocas)...")
        model.train()
        dataset    = YGameDataset(replay_buffer)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True, drop_last=True)

        for epoch in range(1, epochs_per_iter + 1):
            total_loss = 0.0
            for spatials, board_norms, policies, values in dataloader:
                optimizer.zero_grad()
                pred_policy, pred_value = model(spatials, board_norms)
                loss = loss_fn(pred_policy, pred_value, policies, values)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()
                total_loss += loss.item()
            avg_loss = total_loss / len(dataloader)
            print(f"  Época {epoch}/{epochs_per_iter} — loss: {avg_loss:.4f}")

        # ── 3. Evaluación ─────────────────────────────────────────────
        print(f"[3/3] Evaluando nuevo modelo vs anterior...")
        win_rate = evaluate_models(
            model, old_model, board_sizes,
            num_games=40, simulations=50,
        )
        if win_rate >= win_rate_threshold:
            print(f"  ✓ Nuevo modelo aceptado ({win_rate:.1%} >= {win_rate_threshold:.1%})")
            old_model = copy.deepcopy(model)
            model.save(model_path)
        else:
            print(f"  ✗ Nuevo modelo rechazado ({win_rate:.1%} < {win_rate_threshold:.1%}), restaurando anterior")
            model = copy.deepcopy(old_model)
            optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

    # ── Exportar a ONNX ───────────────────────────────────────────────
    print(f"\nExportando modelo a ONNX → {onnx_path}")
    model.export_onnx(onnx_path)
    print("\n✓ Entrenamiento completado.")
    print(f"  Modelo PyTorch : {model_path}")
    print(f"  Modelo ONNX    : {onnx_path}")


# ─────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Entrenamiento AlphaZero para el juego Y")
    parser.add_argument("--iterations",      type=int,   default=20)
    parser.add_argument("--games-per-iter",  type=int,   default=30)
    parser.add_argument("--simulations",     type=int,   default=150)
    parser.add_argument("--epochs",          type=int,   default=5)
    parser.add_argument("--batch-size",      type=int,   default=256)
    parser.add_argument("--lr",              type=float, default=3e-4)
    parser.add_argument("--board-sizes",     type=int,   nargs="+", default=[5, 7, 9, 11])
    parser.add_argument("--model-path",      type=str,   default="../gamey/models/yovi_model.pt")
    parser.add_argument("--onnx-path",       type=str,   default="../gamey/models/yovi_model.onnx")
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
        win_rate_threshold= args.win_threshold,
        buffer_size       = args.buffer_size,
    )
