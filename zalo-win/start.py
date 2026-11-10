#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config.json"
ENV = ROOT / ".env"
ENV_EXAMPLE = ROOT / ".env.example"
EXAMPLE = ROOT / "config.example.json"


def ensure_env() -> bool:
    if ENV.exists():
        return True
    if CONFIG.exists():
        data = json.loads(CONFIG.read_text(encoding="utf-8"))
        ops = str(data.get("opsUrl") or "").strip()
        token = str(data.get("token") or "").strip()
        poll = str(data.get("pollMs") or 4000)
        if ops and token and "điền" not in token:
            ENV.write_text(
                f"OPS_URL={ops}\nZALO_AGENT_TOKEN={token}\nPOLL_MS={poll}\n",
                encoding="utf-8",
            )
            print(f"Created {ENV} from config.json")
            return True
    if ENV_EXAMPLE.exists():
        shutil.copyfile(ENV_EXAMPLE, ENV)
        print(f"Created {ENV}. Fill ZALO_AGENT_TOKEN, then rerun.")
        return False
    if EXAMPLE.exists() and not CONFIG.exists():
        shutil.copyfile(EXAMPLE, CONFIG)
        print(f"Created {CONFIG}. Fill opsUrl + token, then rerun.")
        return False
    print("Missing .env (OPS_URL + ZALO_AGENT_TOKEN).", file=sys.stderr)
    return False


def main() -> int:
    if shutil.which("docker") is None:
        print("Docker is required.", file=sys.stderr)
        return 1
    if not ensure_env():
        return 1

    subprocess.check_call(["docker", "compose", "up", "--build", "-d"], cwd=ROOT)
    subprocess.check_call(["docker", "compose", "ps"], cwd=ROOT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
