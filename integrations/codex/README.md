# Aysh Codex Integration

This directory contains the Codex plugin/skill bundle for Aysh.

## User Flow

1. Open Aysh Settings > Integrations.
2. Add a Codex Agent.
3. Copy the full setup commands shown after the generated token.
4. Toggle the tools Codex is allowed to use.
5. Configure the terminal Codex session:

```bash
export AYSH_URL=http://your-aysh-host:7000
export AYSH_API_TOKEN=aysh_generated_token
mkdir -p ~/plugins
curl -fsSL -H "Authorization: Bearer $AYSH_API_TOKEN" "$AYSH_URL/api/codex/plugin.zip" -o /tmp/aysh-codex-plugin.zip
python3 -m zipfile -e /tmp/aysh-codex-plugin.zip ~/plugins
python3 - <<'PY'
import json
from pathlib import Path

p = Path.home() / ".agents" / "plugins" / "marketplace.json"
p.parent.mkdir(parents=True, exist_ok=True)
if p.exists():
    data = json.loads(p.read_text())
else:
    data = {"name": "personal", "interface": {"displayName": "Personal"}, "plugins": []}

data.setdefault("name", "personal")
data.setdefault("interface", {}).setdefault("displayName", "Personal")
plugins = data.setdefault("plugins", [])
entry = {
    "name": "aysh",
    "source": {"source": "local", "path": "./plugins/aysh"},
    "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
    "category": "Productivity",
}
data["plugins"] = [item for item in plugins if item.get("name") != "aysh"] + [entry]
p.write_text(json.dumps(data, indent=2) + "\n")
PY
codex plugin add aysh@personal
```

6. Verify:

```bash
python3 ~/plugins/aysh/scripts/aysh_api.py capabilities
```

Codex must use `/api/codex/*` endpoints. SSH, Docker, direct Python imports, database queries, and MCP internals bypass Aysh Settings and must not be used for user data access.
