use anyhow::{Result, anyhow};
use chrono::Utc;
use db::models::SnakeFoodEvent;

use crate::ws::models::SnakeData;
use crate::ws::validator::consts::{BASE, LEVEL_UP, MILESTONE_BONUS, MIN_TIME, MULTIPLIER};

pub fn snake_move_valid(data: &SnakeData, last_event: &Option<SnakeFoodEvent>) -> Result<()> {
    // Validate time difference (minimum time between moves)
    let time_difference =
        (data.timestamp.timestamp_millis() - data.prev_timestamp.timestamp_millis()).abs();

    if time_difference != 0 && time_difference < MIN_TIME {
        return Err(anyhow!("Time difference {} is too short", time_difference));
    }

    // Points should never go backwards
    if data.points < data.prev_points {
        return Err(anyhow!(
            "Points decreased from {} to {}",
            data.prev_points,
            data.points
        ));
    }

    // Length should always increase by exactly 1
    if data.length < data.prev_length {
        return Err(anyhow!(
            "Length decreased from {} to {}",
            data.prev_length,
            data.length
        ));
    }

    if data.length != data.prev_length + 1 {
        return Err(anyhow!(
            "Length increased by more than 1: {} -> {}",
            data.prev_length,
            data.length
        ));
    }

    // Points and length must be valid, especially on first move
    if data.length == 1 && data.points > 0 {
        return Err(anyhow!("Initial food shouldn't grant points"));
    }

    // Level should increase by 1, not decrease or jump more than 1 level
    if data.level < 0 || data.level < data.prev_level || (data.level - data.prev_level) > 1 {
        return Err(anyhow!(
            "Invalid level transition: {} -> {}",
            data.prev_level,
            data.level
        ));
    }

    // Calculate expected level based on length
    let calculated_level = data.length / LEVEL_UP + 1;
    if data.level != calculated_level {
        return Err(anyhow!(
            "Reported level {} doesn't match expected level {} for length {}",
            data.level,
            calculated_level,
            data.length
        ));
    }

    // Calculate points based on the multiplier and milestone bonus
    let multiplier = 1.0 + (data.level as f32 * MULTIPLIER);
    let base_points = BASE as f32 * multiplier;
    let base_floor = base_points.floor() as i32;

    let is_milestone = data.length % LEVEL_UP == 0;
    let expected_points = if is_milestone {
        base_floor + MILESTONE_BONUS
    } else {
        base_floor
    };

    let points_gained = data.points - data.prev_points;

    if points_gained < 0 {
        return Err(anyhow!("Points gained {} is negative", points_gained));
    }

    if points_gained != expected_points {
        return Err(anyhow!(
            "Points gained {} doesn't match expected {} (level {}, milestone {})",
            points_gained,
            expected_points,
            data.level,
            is_milestone
        ));
    }

    if data.timestamp < data.prev_timestamp {
        return Err(anyhow!(
            "Timestamp moved backward: {} -> {}",
            data.prev_timestamp,
            data.timestamp
        ));
    }

    let prev_milestone = data.prev_length % LEVEL_UP == 0;

    if prev_milestone && is_milestone {
        return Err(anyhow!("Consecutive milestone bonuses not allowed"));
    }

    let now = Utc::now().timestamp_millis();
    if data.timestamp.timestamp_millis() > now + 5000 {
        return Err(anyhow!("Timestamp too far in the future"));
    }

    // Check for consistency with the last food event (if any)
    if let Some(last_event) = last_event {
        // Points cannot increase unrealistically
        if data.points < last_event.points {
            return Err(anyhow!(
                "Points decreased from {} to {}",
                last_event.points,
                data.points
            ));
        }

        // Length should not decrease and should increase logically
        if data.length < last_event.length {
            return Err(anyhow!(
                "Length decreased from {} to {}",
                last_event.length,
                data.length
            ));
        }

        if data.length != last_event.length + 1 {
            return Err(anyhow!(
                "Length increased by more than 1: {} -> {}",
                last_event.length,
                data.length
            ));
        }

        // Validate that points have increased based on the previous event's points
        let points_difference = data.points - last_event.points;

        if points_difference != expected_points {
            return Err(anyhow!(
                "Points increased by {} more than expected {}",
                points_difference,
                expected_points
            ));
        }

        // Ensure no unexpected large jumps in length or points between events
        let length_difference = data.length - last_event.length;
        if length_difference > 1 {
            return Err(anyhow!(
                "Length increased by more than 1 from {} to {}",
                last_event.length,
                data.length
            ));
        }

        let time_diff_event =
            (data.timestamp.timestamp_millis() - last_event.timestamp.timestamp_millis()).abs();

        if time_diff_event != 0 && time_diff_event < MIN_TIME {
            return Err(anyhow!(
                "Time difference between events {} is too short",
                time_diff_event
            ));
        }

        if data.prev_points != last_event.points
            || data.prev_length != last_event.length
            || data.prev_level != last_event.level
            || data.prev_timestamp != last_event.timestamp
        {
            return Err(anyhow!(
                "Previous state does not match server's last known state"
            ));
        }
    } else {
        if data.length != 2 {
            return Err(anyhow!("First move cannot have a length bigger than 1"));
        }

        if data.points != 26 {
            return Err(anyhow!("First move should have score 0"));
        }

        if data.level != 1 {
            return Err(anyhow!("First move should have level 1"));
        }

        if data.prev_length != 1 || data.prev_points != 0 || data.prev_level != 1 {
            return Err(anyhow!("First move has non-zero previous values"));
        }
    }

    Ok(())
}
