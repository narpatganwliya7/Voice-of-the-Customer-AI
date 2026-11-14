#!/usr/bin/env bash
# Open the `data` branch as ./store, or save ./store back to it as one squashed commit.
#   scripts/databranch.sh open
#   scripts/databranch.sh save "data: message"
set -euo pipefail

case "${1:-}" in
  open)
    git config --global user.name  "ecoute-bot"
    git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
    if git fetch --depth 1 origin data; then
      git worktree add store FETCH_HEAD
    else
      git worktree add --detach store
      git -C store rm -rq . && git -C store clean -fdq
    fi
    ;;
  save)
    cd store
    rm -f ./*.tmp
    git checkout -q --orphan snapshot
    git add -A
    git commit -qm "${2:-data: update}"
    git push -fq origin snapshot:data
    ;;
  *)
    echo "usage: $0 open|save [message]" >&2
    exit 2
    ;;
esac
