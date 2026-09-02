#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

terminate_project_processes() {
  local pids
  pids="$(lsof -ti :3001 -ti :5173 -ti :5174 2>/dev/null || true)"

  if [[ -z "$pids" ]]; then
    return
  fi

  local project_pids=()
  for pid in ${(f)pids}; do
    local cwd
    cwd="$(lsof -p "$pid" -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    if [[ -n "$cwd" && "$cwd" == "$PROJECT_DIR"* ]]; then
      project_pids+=("$pid")
    fi
  done

  if (( ${#project_pids[@]} == 0 )); then
    return
  fi

  kill -TERM $project_pids 2>/dev/null || true
  sleep 1

  local still_running=()
  for pid in $project_pids; do
    if kill -0 "$pid" 2>/dev/null; then
      still_running+=("$pid")
    fi
  done

  if (( ${#still_running[@]} > 0 )); then
    kill -KILL $still_running 2>/dev/null || true
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local timeout_seconds="$3"
  local started_at current_time elapsed

  started_at="$(date +%s)"
  echo "Čekám na ${label}: ${url}"

  while true; do
    if curl --silent --show-error --fail --max-time 2 "$url" >/dev/null 2>&1; then
      echo "${label} je připraven."
      return 0
    fi

    current_time="$(date +%s)"
    elapsed=$(( current_time - started_at ))
    if (( elapsed >= timeout_seconds )); then
      echo "Timeout při čekání na ${label} (${url}) po ${timeout_seconds} s." >&2
      return 1
    fi

    sleep 1
  done
}

# Uvolni běžné porty jen pro procesy spuštěné z tohoto projektu.
terminate_project_processes

# Otevři browser až po připravenosti frontendu a backendu, pak spusť dev režim.
(
  wait_for_url "http://localhost:5173" "frontend" 60
  wait_for_url "http://localhost:3001/api/health" "backend" 60
  echo "Otevírám browser na http://localhost:5173"
  open "http://localhost:5173"
) &
npm run dev
