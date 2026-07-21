"""One-shot setup: ccSwitch Codex provider + live Codex auth/config for aisenyu.

Does not print full API keys. Safe to re-run.
"""
from __future__ import annotations

import json
import re
import shutil
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ENV = Path(r"E:\Program\Content Operation Platform\.env")
CC_SWITCH_DB = Path(r"E:\AI_Caches\.cc-switch\cc-switch.db")
CC_SWITCH_SETTINGS = Path(r"E:\AI_Caches\.cc-switch\settings.json")
CODEX_HOME = Path(r"E:\AI_Caches\.codex")
PROVIDER_ID = "aisenyu-1784290120908"
BASE = "https://api.aisenyu.com/v1"
PROXY_BASE = "http://127.0.0.1:15721/v1"


def mask(key: str) -> str:
    if not key:
        return "(missing)"
    if len(key) <= 12:
        return "***"
    return f"{key[:6]}...{key[-4:]} (len={len(key)})"


def read_key_from_env(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    for name in ("OPENAI_API_KEY", "AI_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        m = re.search(rf"^{name}=(.+)$", text, re.M)
        if m:
            val = m.group(1).strip().strip('"').strip("'")
            if val.startswith("sk-") and len(val) > 20:
                return val
    raise SystemExit(f"No API key found in {path}")


def backup(path: Path, stamp: str) -> None:
    if not path.exists():
        return
    bak = path.with_name(f"{path.name}.bak-aisenyu-{stamp}")
    shutil.copy2(path, bak)
    print(f"backup: {bak}")


def main() -> None:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    key = read_key_from_env(PROJECT_ENV)
    print(f"key source: {PROJECT_ENV}")
    print(f"key: {mask(key)}")

    # backups
    backup_dir = CC_SWITCH_DB.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CC_SWITCH_DB, backup_dir / f"cc-switch.db.bak-aisenyu-{stamp}")
    print(f"backup: {backup_dir / f'cc-switch.db.bak-aisenyu-{stamp}'}")
    backup(CODEX_HOME / "config.toml", stamp)
    backup(CODEX_HOME / "auth.json", stamp)
    backup(CC_SWITCH_SETTINGS, stamp)

    provider_config = f"""model_provider = "custom"
model = "grok-4.5"
review_model = "grok-4.5"
model_reasoning_effort = "xhigh"
disable_response_storage = true
model_catalog_json = "cc-switch-model-catalog.json"

[features]
goals = true

[model_providers.custom]
name = "AISENYU"
base_url = "{BASE}"
wire_api = "responses"
requires_openai_auth = true
"""

    settings_config = {
        "auth": {"OPENAI_API_KEY": key},
        "config": provider_config,
        "modelCatalog": {
            "models": [
                {
                    "model": "grok-4.5",
                    "displayName": "grok-4.5",
                    "contextWindow": 128000,
                }
            ]
        },
    }

    meta = {
        "commonConfigEnabled": True,
        "usage_script": {
            "enabled": True,
            "language": "javascript",
            "code": (
                "({\n"
                "    request: {\n"
                '      url: "{{baseUrl}}/usage",\n'
                '      method: "GET",\n'
                '      headers: { "Authorization": "Bearer {{apiKey}}" }\n'
                "    },\n"
                "    extractor: function(response) {\n"
                "      const remaining = response?.remaining ?? response?.quota?.remaining ?? response?.balance;\n"
                '      const unit = response?.unit ?? response?.quota?.unit ?? "USD";\n'
                "      return {\n"
                "        isValid: response?.is_active ?? response?.isValid ?? true,\n"
                "        remaining,\n"
                "        unit\n"
                "      };\n"
                "    }\n"
                "  })"
            ),
            "timeout": 10,
            "autoQueryInterval": 30,
            "apiKey": key,
            "baseUrl": "https://api.aisenyu.com",
        },
        "endpointAutoSelect": True,
        # Codex appends /responses to base_url; base must be .../v1
        "apiFormat": "openai_responses",
        "isFullUrl": False,
    }

    con = sqlite3.connect(str(CC_SWITCH_DB))
    cur = con.cursor()

    cur.execute("UPDATE providers SET is_current=0 WHERE app_type='codex'")
    cur.execute(
        """
        UPDATE providers
        SET settings_config=?,
            website_url=?,
            meta=?,
            is_current=1,
            name=?,
            notes=?
        WHERE id=?
        """,
        (
            json.dumps(settings_config, ensure_ascii=False),
            "https://api.aisenyu.com",
            json.dumps(meta, ensure_ascii=False),
            "AISENYU",
            "Codex → aisenyu /v1/responses · model=grok-4.5",
            PROVIDER_ID,
        ),
    )
    if cur.rowcount != 1:
        raise SystemExit(f"provider {PROVIDER_ID} not updated (rowcount={cur.rowcount})")

    exists = cur.execute(
        "SELECT id FROM provider_endpoints WHERE provider_id=?",
        (PROVIDER_ID,),
    ).fetchone()
    if exists:
        cur.execute(
            "UPDATE provider_endpoints SET url=?, app_type='codex' WHERE provider_id=?",
            (BASE, PROVIDER_ID),
        )
    else:
        max_id = cur.execute("SELECT COALESCE(MAX(id),0) FROM provider_endpoints").fetchone()[0]
        cur.execute(
            "INSERT INTO provider_endpoints (id, provider_id, app_type, url, added_at) VALUES (?,?,?,?,?)",
            (max_id + 1, PROVIDER_ID, "codex", BASE, int(time.time() * 1000)),
        )

    backup_payload = {
        "auth": {"OPENAI_API_KEY": key},
        "config": provider_config,
        "modelCatalog": settings_config["modelCatalog"],
    }
    backed_up_at = datetime.now(timezone.utc).isoformat()
    cur.execute(
        """
        INSERT INTO proxy_live_backup(app_type, original_config, backed_up_at)
        VALUES('codex', ?, ?)
        ON CONFLICT(app_type) DO UPDATE SET
          original_config=excluded.original_config,
          backed_up_at=excluded.backed_up_at
        """,
        (json.dumps(backup_payload, ensure_ascii=False), backed_up_at),
    )

    # settings.json currentProviderCodex
    if CC_SWITCH_SETTINGS.exists():
        s = json.loads(CC_SWITCH_SETTINGS.read_text(encoding="utf-8"))
        s["currentProviderCodex"] = PROVIDER_ID
        s["enableLocalProxy"] = True
        CC_SWITCH_SETTINGS.write_text(
            json.dumps(s, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"settings.json currentProviderCodex={PROVIDER_ID}")

    con.commit()

    row = cur.execute(
        "SELECT is_current, settings_config, meta FROM providers WHERE id=?",
        (PROVIDER_ID,),
    ).fetchone()
    cfg = json.loads(row[1])
    print("provider is_current=", row[0])
    print("provider auth=", mask(cfg["auth"]["OPENAI_API_KEY"]))
    print("provider config:\n" + cfg["config"])
    print("meta isFullUrl=", json.loads(row[2]).get("isFullUrl"))
    print(
        "endpoint=",
        cur.execute(
            "SELECT url FROM provider_endpoints WHERE provider_id=?",
            (PROVIDER_ID,),
        ).fetchone(),
    )
    con.close()

    # Live Codex auth: API key mode (ccSwitch proxy uses PROXY_MANAGED token;
    # direct codex without proxy needs real key here).
    auth_path = CODEX_HOME / "auth.json"
    auth_path.write_text(
        json.dumps({"OPENAI_API_KEY": key, "auth_mode": "apikey"}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {auth_path} auth_mode=apikey key={mask(key)}")

    # Live config.toml: keep proxy base while ccSwitch is the intended path,
    # but add review_model and preserve MCP/project sections.
    cfg_path = CODEX_HOME / "config.toml"
    old = cfg_path.read_text(encoding="utf-8") if cfg_path.exists() else ""
    m = re.search(r"\n(?=\[(?:mcp_servers|desktop|windows|projects)[.\]])", old)
    tail = old[m.start() + 1 :] if m else ""

    live_top = f"""model_provider = "custom"
model = "grok-4.5"
review_model = "grok-4.5"
model_reasoning_effort = "xhigh"
disable_response_storage = true
model_catalog_json = "cc-switch-model-catalog.json"

[features]
goals = true

[model_providers.custom]
name = "AISENYU"
base_url = "{PROXY_BASE}"
wire_api = "responses"
requires_openai_auth = true
experimental_bearer_token = "PROXY_MANAGED"

"""
    cfg_path.write_text(live_top + tail, encoding="utf-8")
    print(f"wrote {cfg_path}")
    print("--- live config head ---")
    print("\n".join((live_top + tail).splitlines()[:30]))


if __name__ == "__main__":
    main()
