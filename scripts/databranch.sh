#!/usr/bin/env bash
# The data store (raw reviews, labels, model, insights, audio) lives in a PRIVATE repository,
# never in this public one. Workflows check it out into ./store and save it back as one snapshot.
#
#   DATA_REPO   owner/name of the private data repository (repository variable), e.g. you/ecoute-data
#   DATA_TOKEN  fine-grained token with Contents read/write on that repository (repository secret)
#
# Without both, `open` gives an empty store (code still runs on fresh data) and `save` refuses,
# so raw review text can never be pushed into the public repository by accident.
#   bash scripts/databranch.sh open
#   bash scripts/databranch.sh save "message"
set -euo pipefail

remote() {
  if [ -n "${DATA_REPO:-}" ] && [ -n "${DATA_TOKEN:-}" ]; then
    echo "https://x-access-token:${DATA_TOKEN}@github.com/${DATA_REPO}.git"
  fi
}

case "${1:-}" in
  open)
    git config --global user.name  "ecoute-bot"
    git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
    url="$(remote)"
    if [ -n "$url" ] && git clone -q --depth 1 --branch data "$url" store 2>/dev/null; then
      echo "Opened the private data store (${DATA_REPO})."
    else
      [ -z "$url" ] && echo "::warning::DATA_REPO / DATA_TOKEN not set: starting with an empty store."
      rm -rf store && mkdir -p store && git -C store init -q && git -C store checkout -q -b data
    fi
    ;;
  save)
    url="$(remote)"
    if [ -z "$url" ]; then
      echo "::error::No private data store configured (DATA_REPO + DATA_TOKEN). Refusing to save data into this repository."
      exit 1
    fi
    cd store
    rm -f ./*.tmp
    git checkout -q --orphan snapshot
    git add -A
    git commit -qm "${2:-data: update}"
    git push -fq "$url" snapshot:data
    ;;
  *)
    echo "usage: $0 open|save [message]" >&2
    exit 2
    ;;
esac
