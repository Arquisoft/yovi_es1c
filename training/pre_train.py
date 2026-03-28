"""Pre-training utility for the Y game neural network.

Loads a behavioural cloning dataset generated via Minimax self-play,
splits it into train/val, and optimises the network with a combined
policy/value loss.

Recommended usage:

    python pre_train.py --dataset ../gamey/dataset_minimax.json \\
        --model ../gamey/models/yovi_model.pt \\
        --onnx  ../gamey/models/yovi_model.onnx \\
        --epochs 8 --lr 2e-4 --batch-size 128 --value-coef 0.25 --patience 2
"""

import argparse
import json
import os

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset, random_split

from model import PolicyValueNet, encode_board, total_cells, GRID_SIZE, MAX_CELLS, NUM_CHANNELS


# ─────────────────────────────────────────────
#  Dataset loader
# ─────────────────────────────────────────────

def load_dataset(
        path: str,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Parsea el JSON y devuelve cuatro tensores listos para TensorDataset:
      spatials    — (N, NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
      board_norms — (N, 1)
      policies    — (N, MAX_CELLS)   padded con 0s
      values      — (N, 1)
    """
    with open(path) as f:
        raw = json.load(f)

    spatials_list    = []
    board_norms_list = []
    policies_list    = []
    values_list      = []

    for entry in raw:
        board_state    = entry["board_state"]
        current_player = entry["current_player"]
        policy         = entry["policy"]
        outcome        = float(entry["outcome"])

        # Inferir board_size desde la relación de número triangular
        n          = len(board_state)
        board_size = int((((1 + 8 * n) ** 0.5) - 1) / 2)

        # Encoding 2D
        grid, board_norm = encode_board(board_state, board_size, current_player)
        spatials_list.append(grid)                                  # (6, 32, 32)
        board_norms_list.append(torch.tensor([board_norm], dtype=torch.float32))

        # Policy: pad hasta MAX_CELLS
        padded_policy = policy + [0.0] * (MAX_CELLS - len(policy))
        policies_list.append(torch.tensor(padded_policy, dtype=torch.float32))

        values_list.append(outcome)

    spatials    = torch.stack(spatials_list)                        # (N, 6, 32, 32)
    board_norms = torch.stack(board_norms_list)                     # (N, 1)
    policies    = torch.stack(policies_list)                        # (N, MAX_CELLS)
    values      = torch.tensor(values_list, dtype=torch.float32).unsqueeze(1)  # (N, 1)

    return spatials, board_norms, policies, values


# ─────────────────────────────────────────────
#  Entrenamiento
# ─────────────────────────────────────────────

def pretrain(
        dataset_path: str,
        model_path:   str,
        onnx_path:    str,
        *,
        epochs:       int   = 10,
        lr:           float = 1e-4,
        batch_size:   int   = 128,
        value_coef:   float = 1.0,
        patience:     int   = 0,
        train_ratio:  float = 0.9,
        resume:       bool  = False,
        channels:     int   = 64,
        num_res_blocks: int = 6,
) -> None:
    print(f"Cargando dataset desde {dataset_path}...")
    spatials, board_norms, policies, values = load_dataset(dataset_path)
    num_examples = len(spatials)
    print(f"  {num_examples} ejemplos cargados")

    full_dataset = TensorDataset(spatials, board_norms, policies, values)

    # Train / val split
    if train_ratio < 1.0:
        train_size = int(train_ratio * num_examples)
        val_size   = num_examples - train_size
        if train_size == 0 or val_size == 0:
            train_set, val_set = full_dataset, None
            print("  Dataset demasiado pequeño para dividir; usando todos los datos")
        else:
            train_set, val_set = random_split(
                full_dataset,
                [train_size, val_size],
                generator=torch.Generator().manual_seed(42),
            )
            print(f"  División train/val: {train_size}/{val_size}")
    else:
        train_set, val_set = full_dataset, None

    # Modelo
    if resume and os.path.exists(model_path):
        print(f"Cargando modelo existente desde {model_path} (warm-start)")
        model = PolicyValueNet.load(model_path, channels=channels, num_res_blocks=num_res_blocks)
    else:
        print("Inicializando modelo desde cero")
        model = PolicyValueNet(channels=channels, num_res_blocks=num_res_blocks)

    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(1, epochs))

    def run_epoch(loader: DataLoader, train: bool) -> float:
        total_loss = 0.0
        model.train() if train else model.eval()
        ctx = torch.enable_grad() if train else torch.no_grad()
        with ctx:
            for spatial_b, board_norm_b, policy_b, value_b in loader:
                if train:
                    optimizer.zero_grad()
                log_policy, value_pred = model(spatial_b, board_norm_b)
                policy_loss = -(policy_b * log_policy).sum(dim=1).mean()
                value_loss  = F.mse_loss(value_pred, value_b)
                loss        = policy_loss + value_coef * value_loss
                if train:
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                    optimizer.step()
                total_loss += loss.item()
        return total_loss / len(loader)

    best_val_loss          = float("inf")
    epochs_no_improvement  = 0

    for epoch in range(1, epochs + 1):
        train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True, drop_last=True)
        train_loss   = run_epoch(train_loader, train=True)
        scheduler.step()

        if val_set is not None:
            val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False)
            val_loss   = run_epoch(val_loader, train=False)
            lr_now     = optimizer.param_groups[0]["lr"]
            print(f"Época {epoch}/{epochs} — train: {train_loss:.4f}  val: {val_loss:.4f}  lr: {lr_now:.2e}")

            if val_loss < best_val_loss - 1e-5:
                best_val_loss         = val_loss
                epochs_no_improvement = 0
                # Guardamos el mejor checkpoint durante early stopping
                model.save(model_path)
            else:
                epochs_no_improvement += 1
                if patience > 0 and epochs_no_improvement >= patience:
                    print(f"Early stopping tras {epoch} épocas (sin mejora en val {patience} épocas seguidas)")
                    break
        else:
            lr_now = optimizer.param_groups[0]["lr"]
            print(f"Época {epoch}/{epochs} — loss: {train_loss:.4f}  lr: {lr_now:.2e}")
            model.save(model_path)

    # Exportar ONNX
    os.makedirs(os.path.dirname(onnx_path) or ".", exist_ok=True)
    try:
        model.export_onnx(onnx_path)
        print(f"✅ Modelo guardado en {model_path} y exportado a {onnx_path}")
    except Exception as e:
        print(f"⚠️  No se pudo exportar a ONNX: {e}")


# ─────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pre-entrenamiento supervisado del modelo Y")
    parser.add_argument("--dataset",        type=str,   required=True)
    parser.add_argument("--model",          type=str,   required=True)
    parser.add_argument("--onnx",           type=str,   required=True)
    parser.add_argument("--epochs",         type=int,   default=10)
    parser.add_argument("--lr",             type=float, default=1e-4)
    parser.add_argument("--batch-size",     type=int,   default=128)
    parser.add_argument("--value-coef",     type=float, default=1.0)
    parser.add_argument("--patience",       type=int,   default=0)
    parser.add_argument("--train-ratio",    type=float, default=0.9)
    parser.add_argument("--resume",         action="store_true")
    parser.add_argument("--channels",       type=int,   default=64)
    parser.add_argument("--num-res-blocks", type=int,   default=6)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    pretrain(
        dataset_path  = args.dataset,
        model_path    = args.model,
        onnx_path     = args.onnx,
        epochs        = args.epochs,
        lr            = args.lr,
        batch_size    = args.batch_size,
        value_coef    = args.value_coef,
        patience      = args.patience,
        train_ratio   = args.train_ratio,
        resume        = args.resume,
        channels      = args.channels,
        num_res_blocks= args.num_res_blocks,
    )
