import math
import random
from dataclasses import dataclass, field
from model import PolicyValueNet, encode_board, total_cells, pad_encoded_input


# ─────────────────────────────────────────────
#  Representación del estado del tablero
# ─────────────────────────────────────────────

@dataclass
class BoardState:
    """Estado mínimo del juego Y para el self-play en Python."""
    size: int
    cells: list[int]          # 0=vacío, 1=jugador0, 2=jugador1
    current_player: int       # 0 o 1
    done: bool = False
    winner: int = -1          # -1 si no hay ganador todavía

    @classmethod
    def new(cls, size: int) -> "BoardState":
        return cls(size=size, cells=[0] * total_cells(size), current_player=0)

    def available_moves(self) -> list[int]:
        return [i for i, c in enumerate(self.cells) if c == 0]

    def apply_move(self, cell_idx: int) -> "BoardState":
        new_cells = self.cells[:]
        new_cells[cell_idx] = self.current_player + 1
        new_state = BoardState(
            size=self.size,
            cells=new_cells,
            current_player=1 - self.current_player,
        )
        winner = check_winner(new_state, cell_idx, self.current_player)
        if winner != -1:
            new_state.done = True
            new_state.winner = winner
        return new_state

    def encode(self) -> list[float]:
        encoded = encode_board(self.cells, self.size, self.current_player)
        return pad_encoded_input(encoded, self.size).tolist()


# ─────────────────────────────────────────────
#  Lógica de victoria del juego Y
# ─────────────────────────────────────────────

def get_neighbors(idx: int, size: int) -> list[int]:
    """Vecinos de una celda en coordenadas de índice."""
    n = total_cells(size)
    # Reconstruct (x, y, z) from index
    row, col = index_to_row_col(idx, size)
    x = size - 1 - row
    y = col
    z = row - col
    neighbors = []
    offsets = [
        (-1,  1,  0), (-1,  0,  1),
        ( 1, -1,  0), ( 0, -1,  1),
        ( 1,  0, -1), ( 0,  1, -1),
    ]
    for dx, dy, dz in offsets:
        nx, ny, nz = x + dx, y + dy, z + dz
        if nx >= 0 and ny >= 0 and nz >= 0 and nx + ny + nz == size - 1:
            neighbors.append(row_col_to_index(size - 1 - nx, ny, size))
    return [nb for nb in neighbors if 0 <= nb < n]


def index_to_row_col(idx: int, size: int) -> tuple[int, int]:
    row, col = 0, 0
    count = 0
    for r in range(size):
        for c in range(r + 1):
            if count == idx:
                return r, c
            count += 1
    raise ValueError(f"Index {idx} out of range for size {size}")


def row_col_to_index(row: int, col: int, size: int) -> int:
    return row * (row + 1) // 2 + col


def touches_sides(idx: int, size: int) -> tuple[bool, bool, bool]:
    """Devuelve (side_a, side_b, side_c) para una celda."""
    row, col = index_to_row_col(idx, size)
    x = size - 1 - row
    y = col
    z = row - col
    return x == 0, y == 0, z == 0


def check_winner(state: BoardState, last_idx: int, player: int) -> int:
    """BFS/Union-Find simplificado: comprueba si `player` ganó tras colocar en last_idx."""
    target = player + 1
    visited = set()
    side_a = side_b = side_c = False

    stack = [last_idx]
    while stack:
        idx = stack.pop()
        if idx in visited:
            continue
        visited.add(idx)
        if state.cells[idx] != target:
            continue
        a, b, c = touches_sides(idx, state.size)
        side_a = side_a or a
        side_b = side_b or b
        side_c = side_c or c
        if side_a and side_b and side_c:
            return player
        for nb in get_neighbors(idx, state.size):
            if nb not in visited and state.cells[nb] == target:
                stack.append(nb)

    return -1


# ─────────────────────────────────────────────
#  MCTS
# ─────────────────────────────────────────────

class MctsNode:
    def __init__(self, state: BoardState, prior: float = 1.0, parent=None):
        self.state   = state
        self.prior   = prior
        self.parent  = parent
        self.children: dict[int, "MctsNode"] = {}  # move → child
        self.visits  = 0
        self.value_sum = 0.0

    @property
    def q_value(self) -> float:
        return self.value_sum / self.visits if self.visits > 0 else 0.0

    def uct_score(self, c: float = 1.4) -> float:
        parent_visits = self.parent.visits if self.parent else 1
        return self.q_value + c * self.prior * math.sqrt(parent_visits) / (1 + self.visits)

    def is_leaf(self) -> bool:
        return len(self.children) == 0

    def expand(self, policy: list[float]):
        """Expande el nodo con los movimientos disponibles y sus priors."""
        moves = self.state.available_moves()
        for move in moves:
            prior = policy[move] if move < len(policy) else 1.0 / len(moves)
            child_state = self.state.apply_move(move)
            self.children[move] = MctsNode(child_state, prior=prior, parent=self)

    def best_child(self) -> "MctsNode":
        return max(self.children.values(), key=lambda c: c.uct_score())

    def most_visited_move(self) -> int:
        return max(self.children, key=lambda m: self.children[m].visits)

    def visit_counts(self) -> list[float]:
        """Política MCTS normalizada por visitas (para entrenamiento)."""
        n = total_cells(self.state.size)
        counts = [0.0] * n
        total = sum(c.visits for c in self.children.values())
        if total > 0:
            for move, child in self.children.items():
                counts[move] = child.visits / total
        return counts


def mcts_search(root: MctsNode, model: PolicyValueNet | None, simulations: int) -> MctsNode:
    """Ejecuta `simulations` iteraciones de MCTS desde `root`."""
    for _ in range(simulations):
        node = root

        # 1. Selection
        while not node.is_leaf() and not node.state.done:
            node = node.best_child()

        # 2. Expansion + Evaluation
        if not node.state.done:
            if model is not None:
                policy, value = model.predict(
                    node.state.cells,
                    node.state.size,
                    node.state.current_player,
                )
            else:
                # Sin red: política uniforme + simulación aleatoria
                n_moves = len(node.state.available_moves())
                policy = [1.0 / n_moves] * total_cells(node.state.size)
                value  = random_playout(node.state)

            node.expand(policy)
        else:
            # Nodo terminal
            value = 1.0 if node.state.winner == root.state.current_player else -1.0

        # 3. Backpropagation
        while node is not None:
            node.visits    += 1
            node.value_sum += value
            value = -value  # alternamos perspectiva
            node = node.parent

    return root


def random_playout(state: BoardState) -> float:
    """Simulación aleatoria hasta el final. Devuelve 1.0 si gana el jugador inicial."""
    initial_player = state.current_player
    current = state
    while not current.done:
        moves = current.available_moves()
        if not moves:
            break
        move = random.choice(moves)
        current = current.apply_move(move)
    if current.winner == initial_player:
        return 1.0
    elif current.winner == -1:
        return 0.0
    return -1.0


# ─────────────────────────────────────────────
#  Self-play
# ─────────────────────────────────────────────

@dataclass
class GameExample:
    """Un ejemplo de entrenamiento generado por self-play."""
    encoded_state: list[float]   # input de la red
    mcts_policy:   list[float]   # target de la policy head
    outcome:       float         # +1.0 o -1.0 (resultado final desde perspectiva del jugador)


def play_game(
    model: PolicyValueNet | None,
    board_size: int,
    simulations: int = 100,
    temperature: float = 1.0,
) -> list[GameExample]:
    """
    Juega una partida completa de self-play.
    Devuelve lista de GameExample para entrenamiento.
    """
    state = BoardState.new(board_size)
    examples_raw = []  # (encoded_state, mcts_policy, player_at_move)

    while not state.done:
        root = MctsNode(state)
        mcts_search(root, model, simulations)

        mcts_policy = root.visit_counts()

        # Guardamos el estado y la política MCTS
        examples_raw.append((
            state.encode(),
            mcts_policy,
            state.current_player,
        ))

        # Elegimos movimiento (con temperatura para exploración)
        if temperature > 0:
            moves  = list(root.children.keys())
            counts = [root.children[m].visits ** (1.0 / temperature) for m in moves]
            total  = sum(counts)
            probs  = [c / total for c in counts]
            move   = random.choices(moves, weights=probs)[0]
        else:
            move = root.most_visited_move()

        state = state.apply_move(move)

    # Asignar outcomes ahora que sabemos quién ganó
    winner = state.winner
    examples = []
    for encoded, policy, player in examples_raw:
        outcome = 1.0 if player == winner else -1.0
        examples.append(GameExample(encoded, policy, outcome))

    return examples


def generate_self_play_data(
    model: PolicyValueNet | None,
    num_games: int,
    board_sizes: list[int],
    simulations: int = 100,
) -> list[GameExample]:
    """Genera `num_games` partidas de self-play en tableros de distintos tamaños."""
    all_examples = []
    for i in range(num_games):
        size = random.choice(board_sizes)
        examples = play_game(model, size, simulations)
        all_examples.extend(examples)
        if (i + 1) % 10 == 0:
            print(f"  Partida {i+1}/{num_games} completada ({len(all_examples)} ejemplos acumulados)")
    return all_examples


if __name__ == "__main__":
    # Smoke test: una partida sin modelo (MCTS puro aleatorio)
    print("Generando partida de prueba (MCTS puro, sin red)...")
    examples = play_game(model=None, board_size=5, simulations=50)
    print(f"Partida completada: {len(examples)} movimientos")
    print(f"Primer ejemplo — policy sum: {sum(examples[0].mcts_policy):.4f}, outcome: {examples[0].outcome}")
    print("Smoke test OK ✓")
