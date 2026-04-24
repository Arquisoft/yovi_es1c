import math
import random
import numpy as np
from functools import lru_cache
from dataclasses import dataclass
from model import PolicyValueNet, encode_board, total_cells, GRID_SIZE, MAX_CELLS, NUM_CHANNELS


# ─────────────────────────────────────────────
#  Representación del estado del tablero
# ─────────────────────────────────────────────

@dataclass
class BoardState:
    size: int
    cells: list[int]
    current_player: int
    done: bool = False
    winner: int = -1

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

    def encode(self) -> tuple:
        return encode_board(self.cells, self.size, self.current_player)


# ─────────────────────────────────────────────
#  Lógica de victoria
# ─────────────────────────────────────────────

@lru_cache(maxsize=None)
def get_neighbors(idx: int, size: int) -> list[int]:
    n = total_cells(size)
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
    n = total_cells(size)
    if idx < 0 or idx >= n:
        raise ValueError(f"Index {idx} out of range for size {size}")

    row = (math.isqrt(8 * idx + 1) - 1) // 2
    col = idx - row * (row + 1) // 2
    return row, col


def row_col_to_index(row: int, col: int, size: int) -> int:
    return row * (row + 1) // 2 + col


@lru_cache(maxsize=None)
def touches_sides(idx: int, size: int) -> tuple[bool, bool, bool]:
    row, col = index_to_row_col(idx, size)
    x = size - 1 - row
    y = col
    z = row - col
    return x == 0, y == 0, z == 0


def check_winner(state: BoardState, last_idx: int, player: int) -> int:
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


def get_symmetries(
        cells: list[int],
        policy: list[float],
        size: int,
) -> list[tuple[list[int], list[float]]]:
    symmetries = []
    permutations = [
        (0, 1, 2), (1, 2, 0), (2, 0, 1),
        (0, 2, 1), (2, 1, 0), (1, 0, 2),
    ]
    n = total_cells(size)
    for p in permutations:
        new_cells  = [0] * n
        new_policy = [0.0] * n
        for idx in range(n):
            row, col = index_to_row_col(idx, size)
            x = size - 1 - row
            y = col
            z = row - col
            orig_coords = (x, y, z)
            nx, ny, nz = orig_coords[p[0]], orig_coords[p[1]], orig_coords[p[2]]
            new_row = size - 1 - nx
            new_col = ny
            new_idx = row_col_to_index(new_row, new_col, size)
            new_cells[new_idx] = cells[idx]
            if idx < len(policy):
                new_policy[new_idx] = policy[idx]
        symmetries.append((new_cells, new_policy))
    return symmetries


# ─────────────────────────────────────────────
#  MCTS
# ─────────────────────────────────────────────

class MctsNode:
    def __init__(self, state: BoardState, prior: float = 1.0, parent=None):
        self.state     = state
        self.prior     = prior
        self.parent    = parent
        self.children: dict[int, "MctsNode"] = {}
        self.visits    = 0
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
        n = total_cells(self.state.size)
        counts = [0.0] * n
        total = sum(c.visits for c in self.children.values())
        if total > 0:
            for move, child in self.children.items():
                counts[move] = child.visits / total
        return counts


def mcts_search(root: MctsNode, model: PolicyValueNet | None, simulations: int) -> MctsNode:
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
                n_moves = len(node.state.available_moves())
                policy  = [1.0 / n_moves] * total_cells(node.state.size)
                value   = random_playout(node.state)
            node.expand(policy)
        else:
            value = 1.0 if node.state.winner == root.state.current_player else -1.0

        # 3. Backpropagation
        while node is not None:
            node.visits    += 1
            node.value_sum += value
            value   = -value
            node    = node.parent

    return root


def random_playout(state: BoardState) -> float:
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
    encoded_state: list[float]  # grid aplanado: NUM_CHANNELS * GRID_SIZE * GRID_SIZE floats
    board_norm:    float        # escalar board_size / GRID_SIZE
    mcts_policy:   list[float]  # target policy (longitud total_cells(board_size))
    outcome:       float        # +1.0 o -1.0


def play_game(
        model: PolicyValueNet | None,
        board_size: int,
        simulations: int = 100,
        temperature_drop_move: int = 10,
) -> list[GameExample]:
    state = BoardState.new(board_size)
    examples_raw = []  # (cells, mcts_policy, player_at_move)
    move_count = 0

    while not state.done:
        root = MctsNode(state)

        # Inyectar ruido Dirichlet en la raíz (solo con modelo)
        if model is not None:
            policy, _ = model.predict(state.cells, state.size, state.current_player)
            root.expand(policy)
            dirichlet_alpha      = 0.3
            exploration_fraction = 0.25
            noise = np.random.dirichlet([dirichlet_alpha] * len(root.children))
            for i, child in enumerate(root.children.values()):
                child.prior = (
                        child.prior * (1 - exploration_fraction)
                        + noise[i] * exploration_fraction
                )

        mcts_search(root, model, simulations)
        mcts_policy = root.visit_counts()

        examples_raw.append((state.cells[:], mcts_policy, state.current_player))

        # Selección de movimiento con temperatura
        current_temp = 1.0 if move_count < temperature_drop_move else 0.05
        moves  = list(root.children.keys())
        if current_temp > 0.1:
            counts = [root.children[m].visits ** (1.0 / current_temp) for m in moves]
            total  = sum(counts)
            probs  = [c / total for c in counts]
            move   = random.choices(moves, weights=probs)[0]
        else:
            move = root.most_visited_move()

        state = state.apply_move(move)
        move_count += 1

    # Asignar outcomes y generar simetrías
    winner   = state.winner
    examples = []
    for cells, policy, player in examples_raw:                    # ← bug corregido
        outcome = 1.0 if player == winner else -1.0
        syms = get_symmetries(cells, policy, board_size)
        for sym_cells, sym_policy in syms:
            grid, board_norm = encode_board(sym_cells, board_size, player)
            examples.append(GameExample(
                encoded_state=grid.numpy().flatten().tolist(),
                board_norm=board_norm,
                mcts_policy=sym_policy,
                outcome=outcome,
            ))

    return examples


def generate_self_play_data(
        model: PolicyValueNet | None,
        num_games: int,
        board_sizes: list[int],
        simulations: int = 100,
) -> list[GameExample]:
    all_examples = []
    for i in range(num_games):
        size     = random.choice(board_sizes)
        examples = play_game(model, size, simulations)
        all_examples.extend(examples)
        if (i + 1) % 10 == 0:
            print(f"  Partida {i+1}/{num_games} completada ({len(all_examples)} ejemplos acumulados)")
    return all_examples


if __name__ == "__main__":
    print("Generando partida de prueba (MCTS puro, sin red)...")
    examples = play_game(model=None, board_size=5, simulations=50)
    print(f"Partida completada: {len(examples)} ejemplos (con simetrías)")
    if examples:
        print(f"Primer ejemplo — policy sum: {sum(examples[0].mcts_policy):.4f}, outcome: {examples[0].outcome}")
    print("Smoke test OK ✓")
