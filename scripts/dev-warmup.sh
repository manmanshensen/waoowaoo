#!/bin/sh

set -eu

BASE_URL="${APP_DEV_WARMUP_BASE_URL:-http://127.0.0.1:3000}"

warm() {
  path="$1"
  echo "[app-dev:warmup] warming ${path}"
  wget -q -T 180 -O - "${BASE_URL}${path}" >/dev/null 2>&1 || true
}

echo "[app-dev:warmup] starting against ${BASE_URL}"

# Compile the routes that usually cause the first browser visit to stall.
warm "/api/auth/session"
warm "/api/user/models"
warm "/api/projects?page=1&pageSize=1"
warm "/api/projects/dev-warmup/data"
warm "/api/novel-promotion/dev-warmup/episodes/dev-warmup"
warm "/api/runs?projectId=dev-warmup&workflowType=story_to_script_run&targetType=NovelPromotionEpisode&targetId=dev-warmup&episodeId=dev-warmup&limit=1&status=queued"
warm "/api/runs?projectId=dev-warmup&workflowType=script_to_storyboard_run&targetType=NovelPromotionEpisode&targetId=dev-warmup&episodeId=dev-warmup&limit=1&status=queued"

echo "[app-dev:warmup] done"
