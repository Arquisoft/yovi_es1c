# training/model.py

import torch
import torch.nn as nn
import torch.nn.functional as F


def total_cells(board_size: int) -> int:
    return board_size * (board_size + 1) // 2


def encode_board(board_state: list[int], board_size: int, current_player: int) -> torch.Tensor:
    """
    Codifica el estado del tablero como un vector de floats.
    board_state: lista de longitud total_cells(board_size) donde cada elemento es: 0=vacío, 1=jugador0, 2=jugador1
    current_player: 0 o 1 (el jugador que mueve ahora)

    Devuelve un tensor de tamaño 3 * total_cells + 1
    """
    n = total_cells(board_size)
    opponent = 1 - current_player

    canal_mio    = [1.0 if board_state[i] == current_player + 1 else 0.0 for i in range(n)]
    canal_rival  = [1.0 if board_state[i] == opponent + 1      else 0.0 for i in range(n)]
    canal_vacio  = [1.0 if board_state[i] == 0                 else 0.0 for i in range(n)]
    board_norm   = [board_size / 13.0]

    return torch.tensor(canal_mio + canal_rival + canal_vacio + board_norm, dtype=torch.float32)


class PolicyValueNet(nn.Module):
    """
    Red neuronal fully-connected para el juego Y.
    Agnóstica al tamaño del tablero.
    Input:  3 * total_cells(board_size) + 1 floats
    Output: (policy: Tensor[max_cells], value: Tensor[1])
    """

    MAX_CELLS = total_cells(13)

    def __init__(self, hidden_size: int = 256):
        super().__init__()
        input_size = 3 * self.MAX_CELLS + 1

        self.fc1 = nn.Linear(input_size, hidden_size)
        self.bn1 = nn.BatchNorm1d(hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.bn2 = nn.BatchNorm1d(hidden_size)
        self.fc3 = nn.Linear(hidden_size, 128)

        self.policy_head = nn.Linear(128, self.MAX_CELLS)

        self.value_head = nn.Linear(128, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        x: Tensor de shape (batch_size, input_size)
           Las posiciones > 3*total_cells(board_size) deben estar a 0
           para tableros más pequeños que el máximo.

        Devuelve:
          policy: Tensor (batch_size, MAX_CELLS) — log_softmax sobre movimientos válidos
          value:  Tensor (batch_size, 1)         — tanh en [-1, +1]
        """

        x = F.relu(self.bn1(self.fc1(x)))
        x = F.relu(self.bn2(self.fc2(x)))
        x = F.relu(self.fc3(x))

        policy = F.log_softmax(self.policy_head(x), dim=-1)
        value  = torch.tanh(self.value_head(x))

        return policy, value

    def predict(self, board_state: list[int], board_size: int, current_player: int) -> tuple[list[float], float]:
        """
        Interfaz de alto nivel para usar desde el self-play.
        Devuelve (policy: list[float], value: float) para una sola posición.
        """
        self.eval()
        with torch.no_grad():
            encoded = encode_board(board_state, board_size, current_player)
            padded  = self._pad_input(encoded, board_size)
            output_policy, output_value = self.forward(padded.unsqueeze(0))

            n = total_cells(board_size)
            policy = output_policy[0, :n].exp().tolist()
            value  = output_value[0, 0].item()

        return policy, value

    def _pad_input(self, encoded: torch.Tensor, board_size: int) -> torch.Tensor:
        """
        Padea el vector de entrada hasta el tamaño fijo esperado por la red.
        Los canales de celdas inexistentes se rellenan con 0.
        """
        n          = total_cells(board_size)
        max_n      = self.MAX_CELLS
        input_size = 3 * max_n + 1

        padded = torch.zeros(input_size)
        padded[0:n]              = encoded[0:n]
        padded[max_n:max_n+n]    = encoded[n:2*n]
        padded[2*max_n:2*max_n+n]= encoded[2*n:3*n]
        padded[3*max_n]          = encoded[3*n]

        return padded

    def save(self, path: str):
        torch.save(self.state_dict(), path)

    @classmethod
    def load(cls, path: str, hidden_size: int = 256) -> "PolicyValueNet":
        model = cls(hidden_size)
        model.load_state_dict(torch.load(path, map_location="cpu"))
        model.eval()
        return model

    def export_onnx(self, path: str):
        """Exporta el modelo a formato ONNX para usarlo desde Rust con tract."""
        self.eval()
        input_size = 3 * self.MAX_CELLS + 1
        dummy = torch.zeros(1, input_size)
        torch.onnx.export(
            self,
            dummy,
            path,
            input_names=["board_state"],
            output_names=["policy", "value"],
            dynamic_axes={"board_state": {0: "batch_size"}},
            opset_version=17,
        )
        print(f"Modelo exportado a {path}")

def pad_encoded_input(encoded: torch.Tensor, board_size: int) -> torch.Tensor:
    """
    Padea el vector de entrada hasta el tamaño fijo esperado por la red (274).
        Función libre para poder usarla sin instanciar PolicyValueNet.
        """
    n          = total_cells(board_size)
    max_n      = PolicyValueNet.MAX_CELLS
    input_size = 3 * max_n + 1
    padded = torch.zeros(input_size)
    padded[0:n]               = encoded[0:n]
    padded[max_n:max_n+n]     = encoded[n:2*n]
    padded[2*max_n:2*max_n+n] = encoded[2*n:3*n]
    padded[3*max_n]           = encoded[3*n]
    return padded


if __name__ == "__main__":
    # Smoke test
    model = PolicyValueNet()
    print(f"Parámetros totales: {sum(p.numel() for p in model.parameters()):,}")

    # Test con tablero de tamaño 5 (15 celdas)
    board_state = [0] * total_cells(5)
    board_state[0] = 1  # jugador 0 en celda 0
    board_state[3] = 2  # jugador 1 en celda 3

    policy, value = model.predict(board_state, board_size=5, current_player=0)
    print(f"Policy (15 movs): {[f'{p:.3f}' for p in policy]}")
    print(f"Value: {value:.4f}")
    print("Smoke test OK ✓")
