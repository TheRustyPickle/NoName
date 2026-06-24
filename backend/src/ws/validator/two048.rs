use anyhow::{Result, anyhow};
use chrono::Utc;
use db::models::Direction;

use crate::ws::models::Two048Data;
use crate::ws::validator::consts::{
    ALLOWED_FUTURE_MS, GRID_SIZE, TILE_SCORE_MAP, VALID_NEW_VALUE, VALID_TILES,
};

pub fn two048_move_valid(data: &Two048Data, last_move: &Option<Two048Data>) -> Result<()> {
    let now = Utc::now();

    if data.board == data.prev_board {
        return Err(anyhow!(
            "Board didn't change — this should not have been sent."
        ));
    }

    if data.board.len() != GRID_SIZE
        || data.board.iter().any(|row| row.len() != GRID_SIZE)
        || data.prev_board.len() != GRID_SIZE
        || data.prev_board.iter().any(|row| row.len() != GRID_SIZE)
    {
        return Err(anyhow!("Board dimensions are incorrect."));
    }

    if data.timestamp < data.prev_timestamp {
        return Err(anyhow!(
            "Timestamp moved backward: {} -> {}",
            data.prev_timestamp,
            data.timestamp
        ));
    }

    if data.timestamp.timestamp_millis() > now.timestamp_millis() + ALLOWED_FUTURE_MS {
        return Err(anyhow!(
            "Timestamp {} is too far in the future (now: {})",
            data.timestamp,
            now
        ));
    }

    let simulated_move = move_board(data.prev_board.clone(), data.direction);

    if simulated_move == data.prev_board {
        return Err(anyhow!("Move caused no change in board state."));
    }

    let new_tiles = find_all_new_tiles(&simulated_move, &data.board);
    if new_tiles.len() != 1 {
        return Err(anyhow!("Expected 1 new tile, found {}", new_tiles.len()));
    }

    let (new_r, new_c, new_val) = new_tiles[0];
    if !VALID_NEW_VALUE.contains(&new_val) {
        return Err(anyhow!("New tile value {} is not valid.", new_val));
    }

    let mut corrected_frontend_board = data.board.clone();
    corrected_frontend_board[new_r][new_c] = 0;

    if simulated_move != corrected_frontend_board {
        return Err(anyhow!(
            "Simulated move does not match frontend board after removing new tile."
        ));
    }

    let Some(max_idx) = VALID_TILES
        .iter()
        .position(|&t| t == find_max_tile(&data.board))
    else {
        return Err(anyhow!("Current max tile is invalid."));
    };

    let Some(prev_idx) = VALID_TILES
        .iter()
        .position(|&t| t == find_max_tile(&data.prev_board))
    else {
        return Err(anyhow!("Previous max tile is invalid."));
    };

    if max_idx < prev_idx {
        return Err(anyhow!(
            "Max tile decreased: prev index {} -> current index {}",
            prev_idx,
            max_idx
        ));
    }

    if max_idx > prev_idx + 1 {
        return Err(anyhow!(
            "Max tile jumped more than one step: {} -> {}",
            prev_idx,
            max_idx
        ));
    }

    let current_expected_score = expected_score(VALID_TILES[max_idx]);
    let prev_expected_score = expected_score(VALID_TILES[prev_idx]);

    if max_idx == prev_idx + 1 {
        let expected_diff = TILE_SCORE_MAP
            .get(&VALID_TILES[max_idx])
            .copied()
            .unwrap_or(0);

        if current_expected_score != prev_expected_score + expected_diff {
            return Err(anyhow!(
                "Expected score to increase by {}. Prev: {}, Got: {}, Actual: {}",
                expected_diff,
                prev_expected_score,
                current_expected_score,
                data.points
            ));
        }
    } else if current_expected_score != prev_expected_score {
        return Err(anyhow!(
            "Score changed unexpectedly. Prev: {}, Got: {}",
            prev_expected_score,
            current_expected_score
        ));
    }

    if let Some(last) = last_move {
        if data.prev_board != last.board {
            return Err(anyhow!(
                "Provided prev_board does not match server's last board."
            ));
        }
        if data.prev_points != last.points {
            return Err(anyhow!(
                "Provided prev_points ({}) does not match server's ({})",
                data.prev_points,
                last.points
            ));
        }
        if data.prev_highest_number != last.highest_number {
            return Err(anyhow!(
                "Provided prev_highest_number ({}) does not match server's ({}).",
                data.prev_highest_number,
                last.highest_number
            ));
        }
    } else {
        if data.prev_points != 0 {
            return Err(anyhow!(
                "2048 init state invalid. Points should start at 0, got current: {}, prev: {}",
                data.points,
                data.prev_points
            ));
        }

        let initial_tile_values: Vec<i32> = data
            .prev_board
            .iter()
            .flatten()
            .filter(|&&v| v != 0)
            .copied()
            .collect();

        if initial_tile_values.len() != 2 {
            return Err(anyhow!(
                "2048 init state invalid. Should have 2 tiles, found {}",
                initial_tile_values.len()
            ));
        }

        if !initial_tile_values
            .iter()
            .all(|&v| VALID_NEW_VALUE.contains(&v))
        {
            return Err(anyhow!(
                "2048 init state invalid. Initial tiles have invalid values."
            ));
        }

        if data.prev_highest_number != 0 {
            return Err(anyhow!(
                "2048 init state invalid. Highest number should be 0 at start."
            ));
        }
    }

    Ok(())
}

fn move_board(mut board: Vec<Vec<i32>>, direction: Direction) -> Vec<Vec<i32>> {
    let rotations = match direction {
        Direction::Left => 0,
        Direction::Up => 3,
        Direction::Right => 2,
        Direction::Down => 1,
    };

    for _ in 0..rotations {
        board = rotate_board(&board);
    }

    let mut processed_board = vec![vec![0; GRID_SIZE]; GRID_SIZE];

    for r in 0..GRID_SIZE {
        processed_board[r] = process_row(&board[r]);
    }

    for _ in 0..(4 - rotations) % 4 {
        processed_board = rotate_board(&processed_board);
    }

    processed_board
}

fn rotate_board(board: &[Vec<i32>]) -> Vec<Vec<i32>> {
    let mut new_board = vec![vec![0; GRID_SIZE]; GRID_SIZE];
    for (r, row) in board.iter().enumerate().take(GRID_SIZE) {
        for (c, &val) in row.iter().enumerate().take(GRID_SIZE) {
            new_board[c][GRID_SIZE - 1 - r] = val;
        }
    }
    new_board
}

fn process_row(row: &[i32]) -> Vec<i32> {
    let filtered: Vec<i32> = row.iter().copied().filter(|&x| x != 0).collect();
    let mut new_row = Vec::with_capacity(GRID_SIZE);

    let mut i = 0;
    while i < filtered.len() {
        if i + 1 < filtered.len() && filtered[i] == filtered[i + 1] {
            new_row.push(filtered[i] * 2);
            i += 2;
        } else {
            new_row.push(filtered[i]);
            i += 1;
        }
    }

    while new_row.len() < GRID_SIZE {
        new_row.push(0);
    }

    new_row
}

fn find_all_new_tiles(
    moved_board: &[Vec<i32>],
    frontend_board: &[Vec<i32>],
) -> Vec<(usize, usize, i32)> {
    let mut diffs = vec![];
    for r in 0..GRID_SIZE {
        for c in 0..GRID_SIZE {
            if moved_board[r][c] == 0 && frontend_board[r][c] != 0 {
                diffs.push((r, c, frontend_board[r][c]));
            }
        }
    }
    diffs
}

fn find_max_tile(board: &[Vec<i32>]) -> i32 {
    let mut max_tile = 0;

    for row in board {
        for col in row {
            if col > &max_tile {
                max_tile = *col;
            }
        }
    }

    max_tile
}

fn expected_score(max_tile: i32) -> i32 {
    let mut score = 0;

    for tile in VALID_TILES {
        let expected_score = TILE_SCORE_MAP.get(&tile);
        if let Some(expected) = expected_score {
            score += *expected;
        }

        if max_tile == tile {
            break;
        }
    }

    score
}
