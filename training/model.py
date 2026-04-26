# training/model.py
import torch
import torch.nn as nn
import torch.nn.functional as F

# ─────────────────────────────────────────────
#  Constantes globales
# ─────────────────────────────────────────────

GRID_SIZE = 32          # lado del tablero máximo soportado
MAX_CELLS = GRID_SIZE * (GRID_SIZE + 1) // 2  # 528 = total_cells(32)
NUM_CHANNELS = 6        # canales de entrada por celda
# Input ONNX: (batch, 6, GRID_SIZE, GRID_SIZE) → un mapa 2D por canal


def total_cells(board_size: int) -> int:
    return board_size * (board_size + 1) // 2


def encode_board(
        board_state: list[int],
        board_size: int,
        current_player: int,
) -> tuple[torch.Tensor, float]:
    """
    Codifica el estado del tablero como tensor 2D de shape (6, GRID_SIZE, GRID_SIZE).
    El triángulo de lado board_size se mapea a la esquina superior-izquierda de la
    matriz GRID_SIZE×GRID_SIZE (fila i, columna j con j <= i).
    Las celdas fuera del triángulo quedan a 0.0 (padding implícito).

    Canales:
      0 — piezas del jugador actual
      1 — piezas del rival
      2 — celdas vacías
      3 — distancia baricéntrica al borde A (x normalizada)
      4 — distancia baricéntrica al borde B (y normalizada)
      5 — distancia baricéntrica al borde C (z normalizada)

    El escalar board_norm (board_size / GRID_SIZE) se devuelve aparte.
    """
    n        = total_cells(board_size)
    opponent = 1 - current_player
    divisor  = max(1, board_size - 1)

    # (6, GRID_SIZE, GRID_SIZE) — empezamos a cero (el padding queda a 0)
    grid = torch.zeros(NUM_CHANNELS, GRID_SIZE, GRID_SIZE, dtype=torch.float32)

    cell_idx = 0
    for row in range(board_size):
        for col in range(row + 1):
            v = board_state[cell_idx]

            if v == current_player + 1:
                grid[0, row, col] = 1.0
            elif v == opponent + 1:
                grid[1, row, col] = 1.0
            else:
                grid[2, row, col] = 1.0

            # Coordenadas baricéntricas normalizadas
            x = (board_size - 1 - row) / divisor
            y = col / divisor
            z = (row - col) / divisor
            grid[3, row, col] = x
            grid[4, row, col] = y
            grid[5, row, col] = z

            cell_idx += 1

    board_norm = board_size / GRID_SIZE
    return grid, board_norm  # (6, 32, 32), float


# ─────────────────────────────────────────────
#  Arquitectura convolucional
# ─────────────────────────────────────────────

class ConvResidualBlock(nn.Module):
    """Bloque Residual 2D con convoluciones 3×3."""
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn1   = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out = out + residual
        return F.relu(out)


class PolicyValueNet(nn.Module):
    # Expuesto para que train.py y self_play.py lo usen sin hardcodear
    MAX_CELLS  = MAX_CELLS   # 528
    GRID_SIZE  = GRID_SIZE   # 32

    def __init__(self, channels: int = 64, num_res_blocks: int = 6):
        super().__init__()

        # ── Cuerpo convolucional ──────────────────────────────────────
        # Entrada: (batch, 7, GRID_SIZE, GRID_SIZE)
        #   6 canales de tablero  +  1 canal board_norm (broadcast a toda la grid)
        self.stem = nn.Sequential(
            nn.Conv2d(NUM_CHANNELS + 1, channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
        )

        self.res_blocks = nn.ModuleList(
            [ConvResidualBlock(channels) for _ in range(num_res_blocks)]
        )

        # ── Cabeza de política ────────────────────────────────────────
        # 1×1 conv → aplanar → MAX_CELLS logits
        self.policy_conv = nn.Sequential(
            nn.Conv2d(channels, 2, kernel_size=1, bias=False),
            nn.BatchNorm2d(2),
            nn.ReLU(),
        )
        self.policy_fc = nn.Linear(2 * GRID_SIZE * GRID_SIZE, MAX_CELLS)

        # ── Cabeza de valor ───────────────────────────────────────────
        # Global avg pool → FC → tanh
        self.value_conv = nn.Sequential(
            nn.Conv2d(channels, 1, kernel_size=1, bias=False),
            nn.BatchNorm2d(1),
            nn.ReLU(),
        )
        self.value_fc = nn.Sequential(
            nn.Linear(GRID_SIZE * GRID_SIZE, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
        )

    def forward(
            self,
            spatial: torch.Tensor,    # (batch, 6, GRID_SIZE, GRID_SIZE)
            board_norm: torch.Tensor, # (batch, 1) o (batch, 1, GRID_SIZE, GRID_SIZE)
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Devuelve:
          policy — (batch, MAX_CELLS)  log_softmax
          value  — (batch, 1)          tanh ∈ [-1, 1]
        """
        batch = spatial.shape[0]

        if board_norm.dim() == 2:
            # Entrenamiento/Python: recibimos un escalar por muestra.
            bn_channel = board_norm.view(batch, 1, 1, 1).expand(batch, 1, GRID_SIZE, GRID_SIZE)
        elif board_norm.dim() == 4:
            # ONNX/Rust: recibimos el canal ya expandido para evitar un Expand dinamico
            # que tract no puede inferir de forma estable.
            bn_channel = board_norm
        else:
            raise ValueError(
                "board_norm must have shape (batch, 1) or (batch, 1, GRID_SIZE, GRID_SIZE)"
            )
        x = torch.cat([spatial, bn_channel], dim=1)  # (batch, 7, 32, 32)

        x = self.stem(x)
        for block in self.res_blocks:
            x = block(x)

        # Policy head
        p = self.policy_conv(x)                    # (batch, 2, 32, 32)
        p = p.view(batch, -1)                      # (batch, 2*32*32)
        policy = F.log_softmax(self.policy_fc(p), dim=-1)  # (batch, MAX_CELLS)

        # Value head
        v = self.value_conv(x)                     # (batch, 1, 32, 32)
        v = v.view(batch, -1)                      # (batch, 32*32)
        value = torch.tanh(self.value_fc(v))       # (batch, 1)

        return policy, value

    def predict(
            self,
            board_state: list[int],
            board_size: int,
            current_player: int,
    ) -> tuple[list[float], float]:
        """
        Interfaz de alto nivel para self_play.py.
        Devuelve (policy: list[float] de longitud total_cells(board_size), value: float).
        """
        self.eval()
        device = next(self.parameters()).device
        with torch.no_grad():
            grid, bn = encode_board(board_state, board_size, current_player)
            spatial    = grid.unsqueeze(0).to(device)
            board_norm = torch.tensor([[bn]], dtype=torch.float32).to(device)

            log_policy, val = self.forward(spatial, board_norm)

            n = total_cells(board_size)
            policy = log_policy[0, :n].exp()
            total = policy.sum().item()
            if total > 0.0:
                policy = (policy / total).tolist()
            else:
                policy = [1.0 / n] * n
            value  = val[0, 0].item()

        return policy, value

    def save(self, path: str):
        torch.save(self.state_dict(), path)

    @classmethod
    def load(cls, path: str, channels: int = 64, num_res_blocks: int = 6) -> "PolicyValueNet":
        model = cls(channels, num_res_blocks)
        model.load_state_dict(torch.load(path, map_location="cpu", weights_only=True))
        model.eval()
        return model

    def export_onnx(self, path: str):
        """
        Exporta el modelo a ONNX con DOS inputs:
          - 'spatial'    : (batch, 6, 32, 32)  — canales del tablero
          - 'board_norm' : (batch, 1, 32, 32)  — canal de tamaño normalizado

        Rust (neural_net.rs) debe construir exactamente estos dos tensores.
        El encoding 2D está definido en encode_board() de este mismo fichero.
        """
        self.eval()
        dummy_spatial    = torch.zeros(1, NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
        dummy_board_norm = torch.zeros(1, 1, GRID_SIZE, GRID_SIZE)

        torch.onnx.export(
            self,
            (dummy_spatial, dummy_board_norm),
            path,
            input_names=["spatial", "board_norm"],
            output_names=["policy", "value"],
            dynamic_axes={
                "spatial":    {0: "batch_size"},
                "board_norm": {0: "batch_size"},
            },
            opset_version=17,
            dynamo=False,
        )
        print(f"Modelo exportado a {path}")
        print(f"  spatial    : (batch, {NUM_CHANNELS}, {GRID_SIZE}, {GRID_SIZE})")
        print(f"  board_norm : (batch, 1, {GRID_SIZE}, {GRID_SIZE})")
        print(f"  policy     : (batch, {MAX_CELLS})")
        print(f"  value      : (batch, 1)")


# ─────────────────────────────────────────────
#  Smoke test
# ─────────────────────────────────────────────

if __name__ == "__main__":
    model = PolicyValueNet()
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Parámetros totales: {total_params:,}")

    board_state = [0] * total_cells(5)
    board_state[0] = 1
    board_state[3] = 2

    policy, value = model.predict(board_state, board_size=5, current_player=0)
    print(f"Policy (15 movs): {[f'{p:.3f}' for p in policy]}")
    print(f"Value: {value:.4f}")
    print("Smoke test OK ✓")
