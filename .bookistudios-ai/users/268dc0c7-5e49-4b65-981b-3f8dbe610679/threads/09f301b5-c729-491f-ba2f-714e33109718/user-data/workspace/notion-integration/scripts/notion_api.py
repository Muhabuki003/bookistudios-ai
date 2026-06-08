#!/usr/bin/env python3
"""
Notion API Helper Script
Bridges the Notion REST API for use by the Deerflow Notion Integration skill.

Usage:
    python notion_api.py <operation> [options]

Operations:
    query_database   Query a Notion database
    retrieve_page    Get full page content
    retrieve_database Get database metadata
    create_page      Create a new page in a database
    update_page      Update properties on a page
    append_blocks    Append content blocks to a page
    search           Search across the workspace
    list_users       List all workspace users
    get_user         Get a specific user by ID
    list_databases   List accessible databases

Examples:
    python notion_api.py query_database --database-id "abc123" --page-size 10
    python notion_api.py retrieve_page --page-id "xyz789"
    python notion_api.py create_page --database-id "abc123" --properties '{"Name": {"title": [{"text": {"content": "Hello"}}]}}'
    python notion_api.py search --query "meeting notes"
"""

import argparse
import json
import os
import sys
import time
from urllib.parse import quote, urlencode

try:
    import requests
except ImportError:
    print("Error: 'requests' library is required. Install it with: pip install requests")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    # Try loading from multiple locations
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
    load_dotenv()
except ImportError:
    pass  # dotenv is optional


# --- Configuration ---

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"  # Latest stable Notion API version

def get_api_key():
    """Get the Notion API key from environment variable or config."""
    api_key = os.environ.get("NOTION_API_KEY")
    if not api_key:
        print("Error: NOTION_API_KEY environment variable is not set.")
        print("Set it with: export NOTION_API_KEY='ntn_...'")
        print("Or create a .env file with: NOTION_API_KEY=ntn_...")
        sys.exit(1)
    return api_key


def notion_headers(api_key):
    """Return standard Notion API headers."""
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
    }


def make_request(method, endpoint, api_key, json_data=None, params=None, retries=3):
    """Make a request to the Notion API with retry logic."""
    url = f"{NOTION_API_BASE}/{endpoint.lstrip('/')}"
    headers = notion_headers(api_key)

    for attempt in range(retries):
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=json_data,
                params=params,
                timeout=30,
            )

            if response.status_code == 429:
                # Rate limited — wait and retry
                retry_after = int(response.headers.get("Retry-After", 2))
                print(f"Rate limited. Waiting {retry_after}s...", file=sys.stderr)
                time.sleep(retry_after)
                continue

            if response.status_code >= 400:
                error_body = response.json().get("message", response.text)
                print(f"Error {response.status_code}: {error_body}", file=sys.stderr)
                return None

            return response.json()

        except requests.exceptions.RequestException as e:
            print(f"Request failed (attempt {attempt + 1}/{retries}): {e}", file=sys.stderr)
            if attempt < retries - 1:
                time.sleep(2)
            else:
                return None

    return None


def format_results(data, format_type="table"):
    """Format Notion API results for display."""
    return json.dumps(data, indent=2, ensure_ascii=False)


# --- Operations ---

def query_database(api_key, args):
    """Query a Notion database with optional filters and sorts."""
    database_id = args.database_id
    if not database_id:
        print("Error: --database-id is required")
        return None

    body = {"page_size": args.page_size or 100}

    if args.filter:
        try:
            body["filter"] = json.loads(args.filter)
        except json.JSONDecodeError:
            print("Error: --filter must be valid JSON")

    if args.sorts:
        try:
            body["sorts"] = json.loads(args.sorts)
        except json.JSONDecodeError:
            print("Error: --sorts must be valid JSON")

    result = make_request("POST", f"databases/{database_id}/query", api_key, json_data=body)

    if result:
        results_count = len(result.get("results", []))
        has_more = result.get("has_more", False)
        print(f"Found {results_count} results" + (" (more available)" if has_more else ""), file=sys.stderr)
        if args.format == "compact" and results_count > 0:
            # Compact format: show page titles and IDs
            compact = []
            for page in result["results"]:
                props = page.get("properties", {})
                title = extract_title(props)
                compact.append({
                    "id": page["id"],
                    "title": title,
                    "url": page.get("url", ""),
                    "created_time": page.get("created_time", ""),
                })
            return json.dumps(compact, indent=2, ensure_ascii=False)
        return json.dumps(result, indent=2, ensure_ascii=False)

    return None


def retrieve_page(api_key, args):
    """Retrieve full page content including properties."""
    page_id = args.page_id
    if not page_id:
        print("Error: --page-id is required")
        return None

    # Get page properties
    page = make_request("GET", f"pages/{page_id}", api_key)
    if not page:
        return None

    result = {"page": page}

    # Get page content blocks
    if args.include_blocks:
        blocks = []
        start_cursor = None
        while True:
            params = {"page_size": 100}
            if start_cursor:
                params["start_cursor"] = start_cursor
            resp = make_request("GET", f"blocks/{page_id}/children", api_key, params=params)
            if not resp:
                break
            blocks.extend(resp.get("results", []))
            if not resp.get("has_more"):
                break
            start_cursor = resp.get("next_cursor")

        result["blocks"] = blocks
        result["block_count"] = len(blocks)

    return json.dumps(result, indent=2, ensure_ascii=False)


def retrieve_database(api_key, args):
    """Get database metadata including schema/properties."""
    database_id = args.database_id
    if not database_id:
        print("Error: --database-id is required")
        return None

    result = make_request("GET", f"databases/{database_id}", api_key)
    if result:
        # Extract schema in a readable format
        if args.format == "compact":
            props = result.get("properties", {})
            schema = {}
            for prop_name, prop_config in props.items():
                schema[prop_name] = {
                    "type": prop_config.get("type"),
                    "id": prop_config.get("id"),
                }
                # Include select/multi-select options if present
                if prop_config.get("type") in ("select", "status"):
                    schema[prop_name]["options"] = [
                        opt.get("name") for opt in
                        (prop_config.get(prop_config["type"], {}).get("options", []))
                    ]
                elif prop_config.get("type") == "multi_select":
                    schema[prop_name]["options"] = [
                        opt.get("name") for opt in
                        prop_config.get("multi_select", {}).get("options", [])
                    ]

            compact_result = {
                "id": result.get("id"),
                "title": extract_title_text(result.get("title", [])),
                "url": result.get("url"),
                "properties": schema,
                "property_count": len(schema),
            }
            return json.dumps(compact_result, indent=2, ensure_ascii=False)
        return json.dumps(result, indent=2, ensure_ascii=False)
    return None


def create_page(api_key, args):
    """Create a new page in a database or as a child page."""
    if not args.database_id and not args.parent_id:
        print("Error: Either --database-id (for database pages) or --parent-id (for child pages) is required")
        return None

    body = {}

    if args.database_id:
        body["parent"] = {"type": "database_id", "database_id": args.database_id}
    else:
        body["parent"] = {"type": "page_id", "page_id": args.parent_id}

    if args.properties:
        try:
            body["properties"] = json.loads(args.properties)
        except json.JSONDecodeError:
            print("Error: --properties must be valid JSON")
            return None
    else:
        print("Error: --properties is required (use --help to see format)")
        return None

    if args.children:
        try:
            body["children"] = json.loads(args.children)
        except json.JSONDecodeError:
            print("Error: --children must be valid JSON array of block objects")

    if args.icon:
        body["icon"] = {"type": "emoji", "emoji": args.icon}

    result = make_request("POST", "pages", api_key, json_data=body)
    if result:
        page_id = result.get("id", "")
        page_url = result.get("url", "")
        print(f"✅ Page created: {page_url}", file=sys.stderr)

        output = {"status": "created", "id": page_id, "url": page_url}
        if args.format == "compact":
            return json.dumps(output, indent=2, ensure_ascii=False)
        return json.dumps(result, indent=2, ensure_ascii=False)

    return None


def update_page(api_key, args):
    """Update properties on an existing page."""
    page_id = args.page_id
    if not page_id:
        print("Error: --page-id is required")
        return None

    if not args.properties:
        print("Error: --properties is required")
        return None

    try:
        properties = json.loads(args.properties)
    except json.JSONDecodeError:
        print("Error: --properties must be valid JSON")
        return None

    result = make_request("PATCH", f"pages/{page_id}", api_key, json_data={"properties": properties})
    if result:
        print(f"✅ Page updated: {result.get('url', page_id)}", file=sys.stderr)
        return json.dumps(result, indent=2, ensure_ascii=False)
    return None


def append_blocks(api_key, args):
    """Append content blocks to a page."""
    page_id = args.page_id
    if not page_id:
        print("Error: --page-id is required")
        return None

    if args.file:
        try:
            with open(args.file, "r") as f:
                children = json.load(f)
        except Exception as e:
            print(f"Error reading blocks file: {e}")
            return None
    elif args.blocks:
        try:
            children = json.loads(args.blocks)
        except json.JSONDecodeError:
            print("Error: --blocks must be valid JSON array of block objects")
            return None
    else:
        print("Error: --blocks or --file is required")
        return None

    if not isinstance(children, list):
        print("Error: blocks must be a JSON array")
        return None

    body = {"children": children}
    # Handle batching for >100 blocks
    all_results = []
    page_size = 100

    for i in range(0, len(children), page_size):
        batch = children[i:i + page_size]
        batch_body = {"children": batch}
        result = make_request("PATCH", f"blocks/{page_id}/children", api_key, json_data=batch_body)
        if result:
            all_results.extend(result.get("results", []))
            print(f"  Appended blocks {i+1}-{min(i+page_size, len(children))}", file=sys.stderr)
        else:
            break

    print(f"✅ Appended {len(all_results)} blocks to page", file=sys.stderr)
    output = {"status": "appended", "block_count": len(all_results), "page_id": page_id}
    return json.dumps(output, indent=2, ensure_ascii=False)


def search_notion(api_key, args):
    """Search across the workspace."""
    if not args.query:
        print("Error: --query is required")
        return None

    body = {
        "query": args.query,
        "page_size": args.page_size or 10,
    }

    if args.filter_by:
        body["filter"] = {"value": args.filter_by, "property": "object"}
    elif args.filter_type:
        body["filter"] = {"value": args.filter_type, "property": "object"}
    else:
        # Default to searching pages only
        body["filter"] = {"value": "page", "property": "object"}

    if args.sort:
        body["sort"] = {"direction": args.sort_direction or "descending", "timestamp": "last_edited_time"}

    result = make_request("POST", "search", api_key, json_data=body)
    if result:
        results_count = len(result.get("results", []))
        has_more = result.get("has_more", False)
        print(f"Search results: {results_count}" + (" (more available)" if has_more else ""), file=sys.stderr)

        if args.format == "compact":
            compact = []
            for item in result.get("results", []):
                obj_type = item.get("object", "unknown")
                title = ""
                if obj_type == "page":
                    title = extract_title(item.get("properties", {}))
                elif obj_type == "database":
                    title = extract_title_text(item.get("title", []))
                compact.append({
                    "id": item["id"],
                    "type": obj_type,
                    "title": title,
                    "url": item.get("url", ""),
                })
            return json.dumps(compact, indent=2, ensure_ascii=False)

        return json.dumps(result, indent=2, ensure_ascii=False)
    return None


def list_users(api_key, args):
    """List all users in the workspace."""
    result = make_request("GET", "users", api_key, params={"page_size": args.page_size or 100})
    if result:
        users = result.get("results", [])
        print(f"Found {len(users)} users", file=sys.stderr)

        output = []
        for user in users:
            output.append({
                "id": user["id"],
                "name": user.get("name", ""),
                "type": user.get("type", ""),
                "avatar_url": user.get("avatar_url", ""),
            })
        return json.dumps(output, indent=2, ensure_ascii=False)
    return None


def get_user(api_key, args):
    """Get a specific user."""
    user_id = args.user_id
    if not user_id:
        print("Error: --user-id is required")
        return None

    result = make_request("GET", f"users/{user_id}", api_key)
    if result:
        return json.dumps(result, indent=2, ensure_ascii=False)
    return None


def list_databases(api_key, args):
    """Search for accessible databases in the workspace."""
    body = {
        "query": "",
        "filter": {"value": "database", "property": "object"},
        "page_size": args.page_size or 50,
    }
    result = make_request("POST", "search", api_key, json_data=body)
    if result:
        databases = result.get("results", [])
        print(f"Found {len(databases)} accessible databases", file=sys.stderr)

        output = []
        for db in databases:
            title = extract_title_text(db.get("title", []))
            output.append({
                "id": db["id"],
                "title": title,
                "url": db.get("url", ""),
                "created_time": db.get("created_time", ""),
            })
        return json.dumps(output, indent=2, ensure_ascii=False)
    return None


# --- Helpers ---

def extract_title(properties):
    """Extract the title text from page properties."""
    for prop_name, prop_value in properties.items():
        prop_type = prop_value.get("type", "")
        if prop_type == "title":
            texts = prop_value.get("title", [])
            return "".join(t.get("plain_text", "") for t in texts)
    return "(untitled)"


def extract_title_text(title_array):
    """Extract text from a Notion title array."""
    if not title_array:
        return "(untitled)"
    return "".join(t.get("plain_text", "") for t in title_array)


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Notion API Helper Script")
    parser.add_argument("operation", choices=[
        "query_database", "retrieve_page", "retrieve_database",
        "create_page", "update_page", "append_blocks",
        "search", "list_users", "get_user", "list_databases",
    ], help="The Notion API operation to perform")

    # Common options
    parser.add_argument("--database-id", help="Notion database ID (32-char hex)")
    parser.add_argument("--page-id", help="Notion page ID (32-char hex)")
    parser.add_argument("--parent-id", help="Parent page ID for creating child pages")
    parser.add_argument("--user-id", help="User ID for get_user")
    parser.add_argument("--properties", help="Page properties as JSON string")
    parser.add_argument("--children", help="Child blocks as JSON string (for create_page)")
    parser.add_argument("--blocks", help="Content blocks as JSON string (for append_blocks)")
    parser.add_argument("--file", help="File path containing JSON blocks (for append_blocks)")
    parser.add_argument("--query", help="Search query string")
    parser.add_argument("--filter", help="Database query filter as JSON")
    parser.add_argument("--sorts", help="Database query sorts as JSON")
    parser.add_argument("--filter-by", help="Search filter: 'page' or 'database'")
    parser.add_argument("--filter-type", help="Search filter type (legacy)")
    parser.add_argument("--sort", help="Enable sorting in search", action="store_true")
    parser.add_argument("--sort-direction", choices=["ascending", "descending"], default="descending")
    parser.add_argument("--page-size", type=int, default=100, help="Results per page (max 100)")
    parser.add_argument("--format", choices=["full", "compact"], default="full",
                        help="Output format: 'full' for raw API response, 'compact' for simplified view")
    parser.add_argument("--include-blocks", action="store_true",
                        help="Include page content blocks (for retrieve_page)")
    parser.add_argument("--icon", help="Emoji icon for new pages (e.g., '📝')")

    args = parser.parse_args()
    api_key = get_api_key()

    # Route to the right operation
    operations = {
        "query_database": query_database,
        "retrieve_page": retrieve_page,
        "retrieve_database": retrieve_database,
        "create_page": create_page,
        "update_page": update_page,
        "append_blocks": append_blocks,
        "search": search_notion,
        "list_users": list_users,
        "get_user": get_user,
        "list_databases": list_databases,
    }

    handler = operations.get(args.operation)
    if not handler:
        print(f"Error: Unknown operation '{args.operation}'")
        sys.exit(1)

    result = handler(api_key, args)
    if result:
        print(result)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
