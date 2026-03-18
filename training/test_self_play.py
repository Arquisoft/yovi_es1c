import pytest
from self_play import (
    BoardState,
    index_to_row_col,
    row_col_to_index,
    get_neighbors,
    touches_sides
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
