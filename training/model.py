import torch
import torch.nn as nn
import torch.nn.functional as F

def total_cells(board_size: int) -> int:
    return board_size * (board_size + 1) // 2

def encode_board(board_state: list[int], board_size: int, current_player: int) -> torch.Tensor:
    """
    Codifica el estado del tablero con CONCIENCIA ESPACIAL.
    Devuelve un tensor de tamaño 6 * total_cells + 1.
    """
    n = total_cells(board_size)
    opponent = 1 - current_player

    # 1. Canales de estado de las piezas
    canal_mio    = [1.0 if board_state[i] == current_player + 1 else 0.0 for i in range(n)]
    canal_rival  = [1.0 if board_state[i] == opponent + 1      else 0.0 for i in range(n)]
    canal_vacio  = [1.0 if board_state[i] == 0                 else 0.0 for i in range(n)]

    # 2. Canales espaciales (distancia a los 3 bordes)
    canal_dist_a = []
    canal_dist_b = []
    canal_dist_c = []

    # Calculamos las coordenadas baricéntricas sobre la marcha
    for row in range(board_size):
        for col in range(row + 1):
            x = board_size - 1 - row
            y = col
            z = row - col
            # Normalizamos dividiendo por (board_size - 1) para que estén en [0, 1]
            divisor = max(1, board_size - 1)
            canal_dist_a.append(x / divisor)
            canal_dist_b.append(y / divisor)
            canal_dist_c.append(z / divisor)

    # 3. Canal global
    board_norm = [board_size / 13.0]

    # Ahora tenemos 6 canales en lugar de 3
    features = canal_mio + canal_rival + canal_vacio + canal_dist_a + canal_dist_b + canal_dist_c + board_norm
    return torch.tensor(features, dtype=torch.float32)

def pad_encoded_input(encoded: torch.Tensor, board_size: int) -> torch.Tensor:
    """
    Padea el vector de entrada (ahora con 6 canales) hasta el tamaño fijo.
    """
    n          = total_cells(board_size)
    max_n      = PolicyValueNet.MAX_CELLS
    input_size = 6 * max_n + 1
    padded     = torch.zeros(input_size)

    # Copiamos cada uno de los 6 canales a su bloque correspondiente
    for c in range(6):
        padded[c*max_n : c*max_n + n] = encoded[c*n : (c+1)*n]

    padded[6*max_n] = encoded[6*n] # El float global
    return padded


class ResidualBlock(nn.Module):
    """Bloque Residual para redes Fully-Connected."""
    def __init__(self, size: int):
        super().__init__()
        self.fc1 = nn.Linear(size, size)
        self.bn1 = nn.BatchNorm1d(size)
        self.fc2 = nn.Linear(size, size)
        self.bn2 = nn.BatchNorm1d(size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        out = F.relu(self.bn1(self.fc1(x)))
        out = self.bn2(self.fc2(out))
        out += residual  # ¡Aquí ocurre la magia de ResNet!
        return F.relu(out)


class PolicyValueNet(nn.Module):
    MAX_CELLS = total_cells(13)

    def __init__(self, hidden_size: int = 512, num_res_blocks: int = 4):
        super().__init__()
        input_size = 6 * self.MAX_CELLS + 1 # 6 canales

        # Capa de entrada que proyecta al hidden_size
        self.input_layer = nn.Linear(input_size, hidden_size)
        self.input_bn = nn.BatchNorm1d(hidden_size)

        # Torre de bloques residuales (Deep Learning real)
        self.res_blocks = nn.ModuleList([
            ResidualBlock(hidden_size) for _ in range(num_res_blocks)
        ])

        # Cabezas de salida (más robustas)
        self.policy_head = nn.Sequential(
            nn.Linear(hidden_size, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Linear(256, self.MAX_CELLS)
        )

        self.value_head = nn.Sequential(
            nn.Linear(hidden_size, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Linear(128, 1)
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        x = F.relu(self.input_bn(self.input_layer(x)))

        for block in self.res_blocks:
            x = block(x)

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
        input_size = 6 * max_n + 1 # ¡Cambiado a 6!

        padded = torch.zeros(input_size)

        # Copiamos cada uno de los 6 canales a su bloque correspondiente
        for c in range(6):
            padded[c*max_n : c*max_n + n] = encoded[c*n : (c+1)*n]

        padded[6*max_n] = encoded[6*n] # El float global

        return padded

    def save(self, path: str):
        torch.save(self.state_dict(), path)

    @classmethod
    def load(cls, path: str, hidden_size: int = 512, num_res_blocks: int = 4) -> "PolicyValueNet":
        model = cls(hidden_size, num_res_blocks)
        model.load_state_dict(torch.load(path, map_location="cpu"))
        model.eval()
        return model

    def export_onnx(self, path: str):
        """Exporta el modelo a formato ONNX para usarlo desde Rust con tract."""
        self.eval()
        input_size = 6 * self.MAX_CELLS + 1
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
