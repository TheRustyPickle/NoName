// @generated automatically by Diesel CLI.

pub mod sql_types {
    #[derive(diesel::query_builder::QueryId, Clone, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "direction"))]
    pub struct Direction;

    #[derive(diesel::query_builder::QueryId, Clone, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "game_type"))]
    pub struct GameType;

    #[derive(diesel::query_builder::QueryId, Clone, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "platform"))]
    pub struct Platform;

    #[derive(diesel::query_builder::QueryId, Clone, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "task_type"))]
    pub struct TaskType;
}

diesel::table! {
    flappy_score_events (id) {
        id -> Int4,
        session_id -> Text,
        user_id -> Text,
        timestamp -> Timestamptz,
        prev_timestamp -> Timestamptz,
        points -> Int4,
        prev_points -> Int4,
        pipes -> Int4,
        prev_pipes -> Int4,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::GameType;

    game_sessions (id) {
        id -> Text,
        user_id -> Text,
        game -> GameType,
        start_time -> Timestamptz,
        end_time -> Timestamptz,
        final_score -> Int4,
    }
}

diesel::table! {
    referral_rewards (id) {
        id -> Int4,
        referrer_id -> Text,
        referred_id -> Text,
        session_id -> Text,
        points_awarded -> Int4,
        awarded_at -> Timestamptz,
    }
}

diesel::table! {
    referrals (referrer_id, referred_id) {
        referrer_id -> Text,
        referred_id -> Text,
        referred_at -> Timestamptz,
    }
}

diesel::table! {
    snake_food_events (id) {
        id -> Int4,
        session_id -> Text,
        user_id -> Text,
        timestamp -> Timestamptz,
        prev_timestamp -> Timestamptz,
        points -> Int4,
        prev_points -> Int4,
        level -> Int4,
        prev_level -> Int4,
        length -> Int4,
        prev_length -> Int4,
    }
}

diesel::table! {
    task_completions (id) {
        id -> Int4,
        user_id -> Text,
        task_id -> Text,
        completed_at -> Timestamptz,
        points_assigned -> Bool,
        proof -> Nullable<Text>,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::TaskType;
    use super::sql_types::Platform;

    tasks (id) {
        id -> Text,
        task_type -> TaskType,
        created_at -> Timestamptz,
        ends_at -> Nullable<Timestamptz>,
        title -> Text,
        description -> Text,
        completion_url -> Nullable<Text>,
        redirect_url -> Nullable<Text>,
        platform -> Nullable<Platform>,
        platform_id -> Nullable<Text>,
        platform_username -> Nullable<Text>,
        is_active -> Bool,
        reward_point -> Int4,
    }
}

diesel::table! {
    tetris_snapshots (id) {
        id -> Int4,
        session_id -> Text,
        user_id -> Text,
        timestamp -> Timestamptz,
        prev_timestamp -> Timestamptz,
        points -> Int4,
        prev_points -> Int4,
        lines -> Int4,
        prev_lines -> Int4,
        level -> Int4,
        prev_level -> Int4,
        line_points -> Int4,
        drop_points -> Int4,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Direction;

    two048_move_events (id) {
        id -> Int4,
        session_id -> Text,
        user_id -> Text,
        timestamp -> Timestamptz,
        prev_timestamp -> Timestamptz,
        direction -> Direction,
        points -> Int4,
        prev_points -> Int4,
        highest_number -> Int4,
        prev_highest_number -> Int4,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Platform;

    user_socials (user_id, platform) {
        user_id -> Text,
        platform -> Platform,
        platform_user_id -> Text,
        platform_username -> Text,
    }
}

diesel::table! {
    users (user_id) {
        joined_at -> Timestamptz,
        user_id -> Text,
        username -> Nullable<Text>,
        sol_wallet -> Nullable<Text>,
        evm_wallet -> Nullable<Text>,
        points -> Int4,
        photo_url -> Text,
        photo_id -> Nullable<Text>,
        referral_code -> Nullable<Text>,
    }
}

diesel::joinable!(flappy_score_events -> game_sessions (session_id));
diesel::joinable!(flappy_score_events -> users (user_id));
diesel::joinable!(game_sessions -> users (user_id));
diesel::joinable!(referral_rewards -> game_sessions (session_id));
diesel::joinable!(snake_food_events -> game_sessions (session_id));
diesel::joinable!(snake_food_events -> users (user_id));
diesel::joinable!(task_completions -> tasks (task_id));
diesel::joinable!(task_completions -> users (user_id));
diesel::joinable!(tetris_snapshots -> game_sessions (session_id));
diesel::joinable!(tetris_snapshots -> users (user_id));
diesel::joinable!(two048_move_events -> game_sessions (session_id));
diesel::joinable!(two048_move_events -> users (user_id));
diesel::joinable!(user_socials -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    flappy_score_events,
    game_sessions,
    referral_rewards,
    referrals,
    snake_food_events,
    task_completions,
    tasks,
    tetris_snapshots,
    two048_move_events,
    user_socials,
    users,
);
