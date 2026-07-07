-- 003_soul_perception_tuning.sql — Sprint 8 T5
-- Extend soul_state so ReflectAgent's threshold suggestions survive a restart.
-- NULL = no override yet, use compiled-in defaults.

ALTER TABLE soul_state ADD COLUMN perception_tuning_json TEXT NULL;
