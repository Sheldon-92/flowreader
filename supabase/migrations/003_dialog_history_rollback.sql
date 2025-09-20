-- Dialog History Migration Rollback Script
-- Run this script to safely remove the dialog history functionality

-- Drop the view first (depends on the table)
DROP VIEW IF EXISTS dialog_message_stats;

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_old_dialog_messages(INTEGER);
DROP FUNCTION IF EXISTS get_recent_dialog_context(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS get_dialog_messages_paginated(UUID, UUID, INTEGER, INTEGER, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS validate_dialog_message_jsonb();

-- Drop the trigger
DROP TRIGGER IF EXISTS validate_dialog_message_data ON dialog_messages;

-- Drop the table (this will automatically drop all indexes and constraints)
DROP TABLE IF EXISTS dialog_messages;

-- Log the rollback for audit purposes
INSERT INTO analytics_events (event_type, properties, timestamp)
VALUES (
    'migration_rollback',
    jsonb_build_object(
        'migration', '003_dialog_history',
        'rollback_reason', 'Manual rollback executed'
    ),
    NOW()
);