use std::collections::HashMap;
use std::sync::LazyLock;

pub const MAX_USERNAME_LENGTH: usize = 18;
pub const REFERRAL_BONUS: i32 = 1000;
pub const MINIMUM_POINTS_FOR_REFERRAL: i32 = 1000;
pub const GAME_BONUS_PERCENTAGE: i32 = 5;

pub const BOARD_HEIGHT: i32 = 20;
pub const LEVEL_UP: i32 = 10;
pub const POINTS_PER_LINE: [i32; 5] = [0, 40, 100, 300, 1200];
pub const MIN_TIME: i64 = 150;
pub const MIN_TIME_FLAPPY: i64 = 1000;
pub const BASE: i32 = 24;
pub const MILESTONE_BONUS: i32 = 100;
pub const MULTIPLIER: f32 = 0.12;
pub const GRID_SIZE: usize = 4;
pub const ALLOWED_FUTURE_MS: i64 = 5000;

pub const DEFAULT_BOARD: [[i32; 4]; 4] = [[2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
pub const VALID_NEW_VALUE: [i32; 2] = [2, 4];
pub const VALID_TILES: [i32; 13] = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192];

pub static TILE_SCORE_MAP: LazyLock<HashMap<i32, i32>> = LazyLock::new(|| {
    HashMap::from([
        (8, 40),
        (16, 80),
        (32, 150),
        (64, 300),
        (128, 600),
        (256, 1200),
        (512, 3000),
        (1024, 7500),
        (2048, 10000),
        (4096, 20000),
        (8192, 50000),
    ])
});
