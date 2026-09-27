#!/usr/bin/env bash
# STE-46 — the v2.5 close date, end to end on a throwaway testnet deployment.
# The deploy lives in throwaway-pair-testnet.sh, shared with STE-60.
exec bash "$(dirname "${BASH_SOURCE[0]}")/throwaway-pair-testnet.sh" e2e:registration-closes
