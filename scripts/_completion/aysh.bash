#!/usr/bin/env bash
# Tab-completion for the `aysh` umbrella + every `aysh-*` CLI.
#
# Source from your shell rc:
#     source /path/to/aysh-ui/scripts/_completion/aysh.bash
#
# Or wire it once per machine:
#     sudo install -m 644 aysh.bash /etc/bash_completion.d/aysh
#
# What it does:
#   - On the first word after `aysh`, complete with the list of
#     subcommands (`mail`, `calendar`, ...).
#   - On subsequent words, complete with the subcommand's first-token
#     subcommands (`list`, `show`, ...) which we cache by parsing the
#     tool's own --help output. Updates lazily; refresh by running
#     `_aysh_refresh_cache`.
#   - Same completion works for the individual `aysh-foo` scripts.

_aysh_scripts_dir() {
    # Resolve the scripts/ dir from the script that sources us. We assume
    # the user sourced the file directly out of scripts/_completion/.
    local self="${BASH_SOURCE[0]}"
    while [ -L "$self" ]; do self=$(readlink "$self"); done
    cd "$(dirname "$self")/.." && pwd
}

declare -A _AYSH_SUBS_CACHE=()

_aysh_refresh_cache() {
    local dir="$(_aysh_scripts_dir)"
    _AYSH_SUBS_CACHE=()
    # Prefer the project venv's Python so deps (bcrypt, sqlalchemy, ...)
    # resolve. Falls back to system `python3` for container installs.
    local py="$dir/../venv/bin/python"
    [ -x "$py" ] || py="$(command -v python3)"
    local f
    for f in "$dir"/aysh-*; do
        [ -x "$f" ] || continue
        case "$f" in *.bak|*.pyc|*.pre-*) continue ;; esac
        local name="$(basename "$f")"
        local sub="${name#aysh-}"
        local help_out
        help_out=$("$py" "$f" --help 2>/dev/null) || continue
        local commands
        commands=$(echo "$help_out" | grep -oE '\{[a-z0-9_,-]+\}' | head -1 \
            | tr -d '{}' | tr ',' ' ')
        _AYSH_SUBS_CACHE[$sub]="$commands"
    done
}

_aysh_complete() {
    [ ${#_AYSH_SUBS_CACHE[@]} -eq 0 ] && _aysh_refresh_cache

    local cur="${COMP_WORDS[COMP_CWORD]}"
    local cmd="${COMP_WORDS[0]}"

    # `aysh <tab>` → list every subcommand
    if [ "$cmd" = "aysh" ]; then
        if [ "$COMP_CWORD" -eq 1 ]; then
            local subs="${!_AYSH_SUBS_CACHE[@]} help"
            COMPREPLY=($(compgen -W "$subs" -- "$cur"))
            return 0
        fi
        # `aysh foo <tab>` — complete with foo's own subcommands
        local sub="${COMP_WORDS[1]}"
        # `aysh help <tab>` lists every subcommand
        if [ "$sub" = "help" ] && [ "$COMP_CWORD" -eq 2 ]; then
            COMPREPLY=($(compgen -W "${!_AYSH_SUBS_CACHE[*]}" -- "$cur"))
            return 0
        fi
        if [ "$COMP_CWORD" -eq 2 ]; then
            COMPREPLY=($(compgen -W "${_AYSH_SUBS_CACHE[$sub]}" -- "$cur"))
            return 0
        fi
        return 0
    fi

    # Direct `aysh-foo <tab>` (no umbrella)
    local sub="${cmd#aysh-}"
    if [ "$COMP_CWORD" -eq 1 ]; then
        COMPREPLY=($(compgen -W "${_AYSH_SUBS_CACHE[$sub]}" -- "$cur"))
        return 0
    fi
}

# Register the completion for every aysh-* script + the umbrella.
complete -F _aysh_complete aysh
for f in "$(_aysh_scripts_dir)"/aysh-*; do
    [ -x "$f" ] || continue
    case "$f" in *.bak|*.pyc|*.pre-*) continue ;; esac
    complete -F _aysh_complete "$(basename "$f")"
done
