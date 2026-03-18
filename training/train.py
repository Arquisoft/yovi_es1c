# training/train.py

import argparse
import copy
import os
import random

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

from model import PolicyValueNet, total_cells
from self_play import GameExample, generate_self_play_data, play_game


# ─────────────────────────────────────────────
#  Dataset
# ─────────────────────────────────────────────

class YGameDataset(Dataset):
    def __init__(self, examples: list[GameExample], max_cells: int):
        self.examples  = examples
        self.max_cells = max_cells

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        ex = self.examples[idx]

        # Input: ya viene codificado y padeado desde encode_board
        state  = torch.tensor(ex.encoded_state, dtype=torch.float32)

        # Policy target: padeamos hasta MAX_CELLS
        policy = torch.zeros(self.max_cells)
        policy[:len(ex.mcts_policy)] = torch.tensor(ex.mcts_policy, dtype=torch.float32)

        # Value target
        value = torch.tensor([ex.outcome], dtype=torch.float32)

        return state, policy, value


# ─────────────────────────────────────────────
#  Loss
# ─────────────────────────────────────────────

def loss_fn(
    pred_policy: torch.Tensor,
    pred_value:  torch.Tensor,
    target_policy: torch.Tensor,
    target_value:  torch.Tensor,
) -> torch.Tensor:
    """
    Loss combinada AlphaZero:
      L = (v - z)² - π^T log(p)

    pred_policy:   (batch, MAX_CELLS) — log_softmax de la red
    pred_value:    (batch, 1)         — tanh de la red
    target_policy: (batch, MAX_CELLS) — política MCTS normalizada
    target_value:  (batch, 1)         — resultado real de la partida
    """
    value_loss  = F.mse_loss(pred_value, target_value)
    policy_loss = -(target_policy * pred_policy).sum(dim=1).mean()
    return value_loss + policy_loss


# ─────────────────────────────────────────────
#  Evaluación: nuevo modelo vs anterior
# ─────────────────────────────────────────────

def evaluate_models(
    new_model: PolicyValueNet,
    old_model: PolicyValueNet,
    board_sizes: list[int],
    num_games:   int = 20,
    simulations: int = 50,
) -> float:
    """
    Enfrenta new_model vs old_model en `num_games` partidas.
    Devuelve el win rate del nuevo modelo.
    """
    new_wins = 0

    for i in range(num_games):
        size  = random.choice(board_sizes)
        # Alternamos quién mueve primero
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
    iterations:       int   = 5,
    games_per_iter:   int   = 20,
    simulations:      int   = 100,
    epochs_per_iter:  int   = 5,
    batch_size:       int   = 64,
    lr:               float = 1e-3,
    board_sizes:      list  = None,
    model_path:       str   = "../gamey/models/yovi_model.pt",
    onnx_path:        str   = "../gamey/models/yovi_model.onnx",
    win_rate_threshold: float = 0.45,
):
    if board_sizes is None:
        board_sizes = [5, 7, 9, 11]

    os.makedirs(os.path.dirname(model_path), exist_ok=True)

    # Inicializar o cargar modelo existente
    if os.path.exists(model_path):
        print(f"Cargando modelo existente desde {model_path}")
        model = PolicyValueNet.load(model_path)
    else:
        print("Inicializando modelo nuevo (pesos aleatorios)")
        model = PolicyValueNet()

    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    replay_buffer: list[GameExample] = []

    for iteration in range(1, iterations + 1):
        print(f"\n{'='*50}")
        print(f"Iteración {iteration}/{iterations}")
        print(f"{'='*50}")

        # ── 1. Self-play ──────────────────────────────
        print(f"[1/3] Self-play ({games_per_iter} partidas)...")
        model.eval()
        new_examples = generate_self_play_data(
            model      = model if iteration > 1 else None,  # 1ª iter: MCTS puro
            num_games  = games_per_iter,
            board_sizes= board_sizes,
            simulations= simulations,
        )
        replay_buffer.extend(new_examples)

        # Limitar buffer a las últimas 10.000 posiciones
        if len(replay_buffer) > 10_000:
            replay_buffer = replay_buffer[-10_000:]
        print(f"  Buffer: {len(replay_buffer)} ejemplos")

        # ── 2. Entrenamiento ──────────────────────────
        print(f"[2/3] Entrenando ({epochs_per_iter} épocas)...")
        model.train()
        dataset    = YGameDataset(replay_buffer, PolicyValueNet.MAX_CELLS)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        for epoch in range(1, epochs_per_iter + 1):
            total_loss = 0.0
            for states, policies, values in dataloader:
                optimizer.zero_grad()
                pred_policy, pred_value = model(states)
                loss = loss_fn(pred_policy, pred_value, policies, values)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
            avg_loss = total_loss / len(dataloader)
            print(f"  Época {epoch}/{epochs_per_iter} — loss: {avg_loss:.4f}")

        # ── 3. Evaluación ─────────────────────────────
        if iteration > 1:
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
        else:
            print(f"[3/3] Primera iteración, guardando modelo base...")
            old_model = copy.deepcopy(model)
            model.save(model_path)

    # ── Exportar a ONNX ───────────────────────────────
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
    parser.add_argument("--iterations",      type=int,   default=5,    help="Iteraciones de self-play + entrenamiento")
    parser.add_argument("--games-per-iter",  type=int,   default=20,   help="Partidas de self-play por iteración")
    parser.add_argument("--simulations",     type=int,   default=100,  help="Simulaciones MCTS por movimiento")
    parser.add_argument("--epochs",          type=int,   default=5,    help="Épocas de entrenamiento por iteración")
    parser.add_argument("--batch-size",      type=int,   default=64,   help="Batch size")
    parser.add_argument("--lr",              type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--board-sizes",     type=int,   nargs="+",    default=[5, 7, 9, 11])
    parser.add_argument("--model-path",      type=str,   default="../gamey/models/yovi_model.pt")
    parser.add_argument("--onnx-path",       type=str,   default="../gamey/models/yovi_model.onnx")
    parser.add_argument("--win-threshold",   type=float, default=0.45)
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
    )
