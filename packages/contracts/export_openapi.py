import argparse
import json
import sys
from pathlib import Path

CONTRACTS_DIRECTORY = Path(__file__).resolve().parent
API_DIRECTORY = CONTRACTS_DIRECTORY.parent.parent / "apps" / "api"
SCHEMA_PATH = CONTRACTS_DIRECTORY / "openapi.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Export the FastAPI OpenAPI schema without starting a server.")
    parser.add_argument("--check", action="store_true", help="Check the saved schema against the API source.")
    args = parser.parse_args()

    sys.path.insert(0, str(API_DIRECTORY))
    from app.main import app

    schema = json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.check:
        if not SCHEMA_PATH.is_file() or SCHEMA_PATH.read_text(encoding="utf-8") != schema:
            sys.exit("The saved OpenAPI schema is stale. Run pnpm contracts:export and pnpm contracts:generate.")
        print("Saved OpenAPI schema matches FastAPI.")
    else:
        SCHEMA_PATH.write_text(schema, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
