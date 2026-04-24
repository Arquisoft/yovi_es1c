from self_play import (
    BoardState,
    check_winner,
    get_neighbors,
    get_symmetries,
    index_to_row_col,
    row_col_to_index,
    touches_sides,
)


def test_index_conversion():
    idx = row_col_to_index(2, 1, 5)
    r, c = index_to_row_col(idx, 5)
    assert (r, c) == (2, 1)


def test_board_state_new():
    state = BoardState.new(5)
    assert state.size == 5
    assert len(state.cells) == 15
    assert state.current_player == 0
    assert not state.done
    assert len(state.available_moves()) == 15


def test_apply_move():
    state = BoardState.new(5)
    next_state = state.apply_move(0)

    assert next_state.current_player == 1
    assert next_state.cells[0] == 1
    assert len(next_state.available_moves()) == 14
    assert next_state.winner == -1


def test_touches_sides():
    side_a, side_b, side_c = touches_sides(0, 3)
    assert not side_a
    assert side_b
    assert side_c


def test_check_winner_trivial_board():
    state = BoardState.new(1)
    next_state = state.apply_move(0)

    assert next_state.done
    assert next_state.winner == 0


def test_neighbors_for_center_cell():
    idx = row_col_to_index(2, 1, 5)
    neighbors = sorted(get_neighbors(idx, 5))
    expected = sorted(
        row_col_to_index(row, col, 5)
        for row, col in [(1, 0), (1, 1), (2, 0), (2, 2), (3, 1), (3, 2)]
    )
    assert neighbors == expected


def test_geometry_helpers_use_lru_cache():
    get_neighbors.cache_clear()
    touches_sides.cache_clear()

    get_neighbors(4, 5)
    get_neighbors(4, 5)
    touches_sides(4, 5)
    touches_sides(4, 5)

    assert get_neighbors.cache_info().hits >= 1
    assert touches_sides.cache_info().hits >= 1


def test_get_symmetries_keeps_cell_and_policy_counts():
    cells = [1, 0, 2, 0, 1, 0]
    policy = [0.2, 0.1, 0.3, 0.1, 0.2, 0.1]

    symmetries = get_symmetries(cells, policy, size=3)

    assert len(symmetries) == 6
    for sym_cells, sym_policy in symmetries:
        assert len(sym_cells) == len(cells)
        assert len(sym_policy) == len(policy)
        assert sorted(sym_cells) == sorted(cells)
        assert abs(sum(sym_policy) - 1.0) < 1e-6


def test_check_winner_detects_three_sides_connection():
    state = BoardState.new(3)
    state.cells = [0, 0, 0, 1, 1, 1]
    winner = check_winner(state, last_idx=5, player=0)
    assert winner == 0
