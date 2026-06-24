use anyhow::{Result, anyhow};
use chrono::Utc;
use db::models::TetrisSnapshot;

use crate::ws::models::TetrisData;
use crate::ws::validator::consts::{BOARD_HEIGHT, LEVEL_UP, MIN_TIME, POINTS_PER_LINE};

pub fn tetris_move_valid(data: &TetrisData, last_move: &Option<TetrisSnapshot>) -> Result<()> {
    // Points cannot go down
    if data.points < data.prev_points {
        return Err(anyhow!("Points cannot go down"));
    }

    // Lines cannot go down
    if data.lines < data.prev_lines {
        return Err(anyhow!("Tetris move invalid. Lines cannot go down"));
    }

    let expected_level = (data.lines / LEVEL_UP) + 1;

    // Level must be at least 1 and cannot be more if not enough lines cleared
    if data.level != expected_level {
        return Err(anyhow!(
            "Level {} is not valid for lines {}",
            data.level,
            data.lines
        ));
    }

    let level = if data.prev_level == data.level {
        data.level
    } else {
        data.prev_level
    };

    // Cannot clear more than 4 lines at once
    let lines_cleared = data.lines - data.prev_lines;
    if !(0..=4).contains(&lines_cleared) {
        return Err(anyhow!("Lines cleared {} is not valid", lines_cleared));
    }

    // Cannot have any points unless at least 1 line is cleared
    if data.lines == 0 && data.points > 0 {
        return Err(anyhow!(
            "Points {} is not valid for lines {}",
            data.points,
            data.lines
        ));
    }

    // Total point gotten from drop + line in this move
    let drop_and_line_points = data.points - data.prev_points;

    if lines_cleared > 0 {
        let points_index = std::cmp::min(lines_cleared as usize, POINTS_PER_LINE.len() - 1);
        let base_points = POINTS_PER_LINE[points_index] * level;

        // Without drop points, only points from expected line cleared cannot be larger than line + drop
        // points. Meaning if the user did not do a hard drop but a line matched, then base_point
        // and drop_and_line_points should be equal.
        if drop_and_line_points < base_points {
            return Err(anyhow!(
                "Drop + Line points {} is not valid for lines {}. Minimum is {}",
                drop_and_line_points,
                lines_cleared,
                base_points
            ));
        }

        // Both drop points and line points combined should be less than the max board height + absolute maximum line
        // clearing points
        if drop_and_line_points > base_points + BOARD_HEIGHT {
            return Err(anyhow!(
                "Drop + Line points {} is not valid for drop + lines {}. Maximum is {}",
                drop_and_line_points,
                lines_cleared,
                base_points + BOARD_HEIGHT
            ));
        }
    } else {
        // No lines cleared means the only valid points should be drop points (if any)
        if drop_and_line_points > BOARD_HEIGHT {
            return Err(anyhow!(
                "Drop points {} is not valid for lines {}",
                drop_and_line_points,
                lines_cleared
            ));
        }
    }

    // Absolute max points in one move checker
    let max_points_in_one_move = (POINTS_PER_LINE[4] * data.level) + BOARD_HEIGHT;
    if drop_and_line_points > max_points_in_one_move {
        return Err(anyhow!(
            "Drop + Line points {} is not valid for lines {}. Maximum is {}",
            drop_and_line_points,
            lines_cleared,
            max_points_in_one_move
        ));
    }

    let time_difference =
        (data.timestamp.timestamp_millis() - data.prev_timestamp.timestamp_millis()).abs();

    if time_difference != 0 && time_difference < MIN_TIME {
        return Err(anyhow!("Time difference {} is not valid", time_difference));
    }

    if time_difference != 0 && data.timestamp <= data.prev_timestamp {
        return Err(anyhow!(
            "Current timestamp {} is not after previous {}",
            data.timestamp,
            data.prev_timestamp
        ));
    }

    let now = Utc::now().timestamp_millis();
    if data.timestamp.timestamp_millis() > now + 5000 {
        return Err(anyhow!(
            "Snake move invalid. Timestamp too far in the future"
        ));
    }

    if let Some(last_move) = last_move {
        let last_move_points = last_move.points;
        let last_move_lines = last_move.lines;

        let difference_points = data.points - last_move_points;
        let difference_lines = data.lines - last_move_lines;

        if difference_points > max_points_in_one_move {
            return Err(anyhow!(
                "Points cannot increase by more than {max_points_in_one_move} in one move. Increased by {difference_points}"
            ));
        }

        if difference_lines > 4 {
            return Err(anyhow!(
                "Lines cannot increase by more than 4 in one move. Increased by {difference_lines}"
            ));
        }

        let expected_prev_level = (last_move.lines / LEVEL_UP) + 1;
        if data.prev_level != expected_prev_level {
            return Err(anyhow!(
                "prev_level {} is not consistent with last known lines {}",
                data.prev_level,
                last_move.lines
            ));
        }

        if data.prev_points != last_move.points
            || data.prev_lines != last_move.lines
            || data.prev_level != last_move.level
            || data.prev_timestamp != last_move.timestamp
        {
            return Err(anyhow!(
                "Previous state does not match server's last known state"
            ));
        }
    } else if data.prev_points != 0 || data.prev_lines != 0 || data.prev_level != 1 {
        return Err(anyhow!("First move must start from zeroed previous state"));
    }

    Ok(())
}
