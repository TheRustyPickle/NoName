use anyhow::{Result, anyhow};
use chrono::Utc;
use db::models::FlappyScoreEvent;

use crate::ws::models::FlappyData;
use crate::ws::validator::consts::{ALLOWED_FUTURE_MS, MIN_TIME_FLAPPY};

pub fn flappy_move_valid(data: &FlappyData, last_event: &Option<FlappyScoreEvent>) -> Result<()> {
    // --- 1. Validate time difference (between current and previous timestamp in data) ---
    let time_difference_prev_ms =
        data.timestamp.timestamp_millis() - data.prev_timestamp.timestamp_millis();

    // Check for negative difference first (timestamp went backward)
    if time_difference_prev_ms < 0 {
        return Err(anyhow!(
            "Timestamp moved backward relative to prev_timestamp: {} -> {}",
            data.prev_timestamp,
            data.timestamp
        ));
    }

    // Check if too short (only if timestamps are different)
    if data.timestamp != data.prev_timestamp && time_difference_prev_ms < MIN_TIME_FLAPPY {
        return Err(anyhow!(
            "Time difference {}ms with prev_timestamp is too short (min {}ms)",
            time_difference_prev_ms,
            MIN_TIME_FLAPPY
        ));
    }

    // --- 2. Points should never go backwards ---
    if data.points < data.prev_points {
        return Err(anyhow!(
            "Points decreased from {} to {}",
            data.prev_points,
            data.points
        ));
    }

    // --- 3. Pipe count validation ---
    if data.pipes < data.prev_pipes {
        return Err(anyhow!(
            "Pipe count decreased from {} to {}",
            data.prev_pipes,
            data.pipes
        ));
    }

    // Each valid scoring move should correspond to passing exactly one pipe.
    if data.pipes != data.prev_pipes + 1 {
        return Err(anyhow!(
            "Pipe count must increase by exactly 1. From {} to {}",
            data.prev_pipes,
            data.pipes
        ));
    }

    // --- 4. Timestamp not too far in the future ---
    let now_ms = Utc::now().timestamp_millis();
    if data.timestamp.timestamp_millis() > now_ms + ALLOWED_FUTURE_MS {
        return Err(anyhow!(
            "Timestamp {} is too far in the future (current: {} UTC)",
            data.timestamp,
            Utc::now()
        ));
    }

    // --- 5. Validate points gained for the current move ---
    let points_gained = data.points - data.prev_points;

    let prev_pipe_score = score_for_pipe(data.prev_pipes);
    let pipe_score = score_for_pipe(data.pipes);

    let expected_points_for_current_pipe_pass = pipe_score;

    if points_gained != expected_points_for_current_pipe_pass {
        return Err(anyhow!(
            "Points gained {} doesn't match expected {} (total score for pipes: {} -> {}, from prev_pipes: {} to current_pipes: {})",
            points_gained,
            expected_points_for_current_pipe_pass,
            prev_pipe_score,
            pipe_score,
            data.prev_pipes,
            data.pipes
        ));
    }

    // --- 6. Validate against last server-known event (if any) ---
    if let Some(event) = last_event {
        // Check consistency of 'prev_' fields in data with the last event's state
        if data.prev_points != event.points {
            return Err(anyhow!(
                "Reported prev_points {} does not match last event's points {}",
                data.prev_points,
                event.points
            ));
        }
        if data.prev_pipes != event.pipes {
            return Err(anyhow!(
                "Reported prev_pipes {} does not match last event's pipes {}",
                data.prev_pipes,
                event.pipes
            ));
        }
        if data.prev_timestamp != event.timestamp {
            return Err(anyhow!(
                "Reported prev_timestamp {} does not match last event's timestamp {}",
                data.prev_timestamp,
                event.timestamp
            ));
        }
    } else {
        if data.prev_pipes != 0 {
            return Err(anyhow!(
                "First move's prev_pipes should be 0, got {}",
                data.prev_pipes
            ));
        }
        if data.prev_points != 0 {
            return Err(anyhow!(
                "First move's prev_points should be 0, got {}",
                data.prev_points
            ));
        }

        if data.timestamp != data.prev_timestamp {
            return Err(anyhow!(
                "First move's timestamp should equal prev_timestamp, got {} and {}",
                data.timestamp,
                data.prev_timestamp
            ));
        }
    }

    Ok(())
}

fn score_for_pipe(pipe_num: i32) -> i32 {
    if pipe_num <= 20 {
        return (4.0 * f64::from(pipe_num).powf(1.2)).floor() as i32;
    }

    let base = (4.0 * (20f64).powf(1.2)).floor() as i32;

    if pipe_num <= 40 {
        let extra = (pipe_num - 20) * 75;
        return base + extra;
    }

    let soft_bonus = 20 * 75;
    base + soft_bonus
}
