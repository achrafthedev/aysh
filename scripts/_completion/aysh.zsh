#compdef aysh aysh-backup aysh-calendar aysh-contacts aysh-cookbook aysh-docs aysh-gallery aysh-mail aysh-mcp aysh-memory aysh-notes aysh-personal aysh-preset aysh-research aysh-sessions aysh-signature aysh-skills aysh-tasks aysh-theme aysh-webhook
# Zsh tab-completion for the aysh umbrella + sub-CLIs.
#
# Drop in any directory on $fpath, e.g.:
#     fpath=(/path/to/aysh-ui/scripts/_completion $fpath)
#     autoload -U compinit; compinit
#
# Then `aysh <tab>` completes subcommands; `aysh mail <tab>`
# completes mail subcommands; `aysh-mail <tab>` works the same.

_aysh_scripts_dir() {
    local self="${(%):-%x}"
    while [[ -L "$self" ]]; do self="$(readlink "$self")"; done
    cd "${self:h}/.." && pwd
}

typeset -gA _aysh_subs

_aysh_refresh() {
    _aysh_subs=()
    local dir="$(_aysh_scripts_dir)"
    local py="$dir/../venv/bin/python"
    [[ -x "$py" ]] || py="$(command -v python3)"
    local f sub help_out commands
    for f in "$dir"/aysh-*; do
        [[ -x "$f" ]] || continue
        case "$f" in
            *.bak|*.pyc|*.pre-*) continue ;;
        esac
        sub="${${f:t}#aysh-}"
        help_out=$("$py" "$f" --help 2>/dev/null) || continue
        commands=$(echo "$help_out" | grep -oE '\{[a-z0-9_,-]+\}' | head -1 \
            | tr -d '{}' | tr ',' ' ')
        _aysh_subs[$sub]="$commands"
    done
}

_aysh() {
    [[ ${#_aysh_subs} -eq 0 ]] && _aysh_refresh

    local cmd="${words[1]}"

    if [[ "$cmd" == "aysh" ]]; then
        if (( CURRENT == 2 )); then
            local -a subs=(${(k)_aysh_subs} help)
            _describe 'subcommand' subs
            return
        fi
        local sub="${words[2]}"
        if [[ "$sub" == "help" ]] && (( CURRENT == 3 )); then
            local -a subs=(${(k)_aysh_subs})
            _describe 'subcommand' subs
            return
        fi
        if (( CURRENT == 3 )); then
            local -a sc=(${(s/ /)_aysh_subs[$sub]})
            _describe 'command' sc
            return
        fi
        return
    fi

    # aysh-foo <tab>
    local sub="${cmd#aysh-}"
    if (( CURRENT == 2 )); then
        local -a sc=(${(s/ /)_aysh_subs[$sub]})
        _describe 'command' sc
        return
    fi
}

_aysh "$@"
