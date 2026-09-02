#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

pids="$(lsof -ti :3001 -ti :5173 -ti :5174 2>/dev/null || true)"
if [[ -z "$pids" ]]; then
  echo "Nebyly nalezeny žádné běžící procesy na portech 3001/5173/5174."
  exit 0
fi

project_pids=()
for pid in ${(f)pids}; do
  cwd="$(lsof -p "$pid" -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  if [[ -n "$cwd" && "$cwd" == "$PROJECT_DIR"* ]]; then
    project_pids+=("$pid")
  fi
done

if (( ${#project_pids[@]} == 0 )); then
  echo "Nebyly nalezeny žádné procesy tohoto projektu na portech 3001/5173/5174."
  exit 0
fi

kill -TERM $project_pids 2>/dev/null || true
sleep 1

still_running=()
for pid in $project_pids; do
  if kill -0 "$pid" 2>/dev/null; then
    still_running+=("$pid")
  fi
done

if (( ${#still_running[@]} > 0 )); then
  kill -KILL $still_running 2>/dev/null || true
fi

echo "Procesy projektu na portech 3001/5173/5174 byly ukončeny."
