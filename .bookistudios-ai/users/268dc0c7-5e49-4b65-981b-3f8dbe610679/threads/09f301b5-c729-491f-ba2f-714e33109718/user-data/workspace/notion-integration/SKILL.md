---
name: notion-integration
description: "Interact with Notion workspaces: query databases, read pages, create/update content, and search across Notion. Use this skill whenever the user wants to access, read, create, update, or search Notion databases, pages, or content. Trigger on mentions of Notion, databases, pages, workspace content, note-taking, project management in Notion, or any request involving Notion API integration. Also use when the user asks to sync data between Notion and other tools, export Notion content, or automate Notion workflows."
---

# Notion Integration Skill

Connect to the Notion API to read, create, update, and search content across a user's Notion workspace. This skill uses the official [Notion API](https://developers.notion.com/) (v1) via a bundled Python helper script.

## Prerequisites

Before using this skill, the user must provide:

1. **Notion Internal Integration Secret** (API key) — created at https://www.notion.so/profile/integrations
2. **Database or Page IDs** — the target Notion resources to access (found in the URL of the resource)

### How to get an API key

1. Go to https://www.notion.so/profile/integrations
2. Click **"+ New integration"**
3. Name it (e.g., "Deerflow AI")
4. Select the workspace your target databases/pages are in
5. Under "Capabilities", grant the appropriate permissions (read, write, etc.)
6. Submit, then copy the **"Internal Integration Secret"** — this is your API key

### How to find Database / Page IDs

- Open the database or page in your browser
- The ID is in the URL: `https://www.notion.so/workspace/{ID}?v=...`
- It's a 32-character hex string (with optional hyphens)
- Database IDs are 32 chars, page IDs are also 32 chars

### How to connect a database to the integration

**Important:** After creating the integration, you must **share the database or page** with it:
1. Open the Notion database/page you want to access
2. Click the **"..."** menu (top-right corner)
3. Go to **"Add connections"**
4. Select your integration name
5. Now the API can access it

## Architecture

The skill uses a bundled Python script (`scripts/notion_api.py`) that wraps the Notion API via REST calls. The agent:

1. Reads the user's intent (query a database, read a page, create content, etc.)
2. Runs the appropriate Python script with the right arguments
3. Formats and presents the results back to the user

## Available Operations

| Operation | Description | Key Parameters |
|-----------|-------------|---------------|
| **query_database** | Query a Notion database (list entries with optional filters) | `database_id`, `filter`, `sorts`, `page_size` |
| **retrieve_page** | Get full content of a page | `page_id` |
| **retrieve_database** | Get database metadata (schema/properties) | `database_id` |
| **create_page** | Create a new page in a database | `database_id`, `properties` (dict), `children` (optional blocks) |
| **update_page** | Update properties on an existing page | `page_id`, `properties` (dict) |
| **append_blocks** | Add content blocks to a page | `page_id`, `children` (list of blocks) |
| **search** | Search across the workspace | `query`, `filter_by`, `page_size` |
| **list_users** | List all users in the workspace | _(none)_ |
| **get_user** | Get a specific user | `user_id` |

## Quick Reference: Property Formats

When creating or updating pages in a database, match the database schema. Here are common property types:

```python
# Title (required for most databases)
{"Name": {"title": [{"text": {"content": "Page Title"}}]}}

# Rich Text
{"Description": {"rich_text": [{"text": {"content": "Some description"}}]}}

# Select (single)
{"Status": {"select": {"name": "Done"}}}

# Multi-select
{"Tags": {"multi_select": [{"name": "Tag1"}, {"name": "Tag2"}]}}

# Number
{"Price": {"number": 29.99}}

# Date
{"Deadline": {"date": {"start": "2025-12-31"}}}

# Checkbox
{"Completed": {"checkbox": true}}

# Email
{"Email": {"email": "user@example.com"}}

# Phone
{"Phone": {"phone_number": "+1-555-0123"}}

# URL
{"Website": {"url": "https://example.com"}}

# Relation (links to another page in the database)
{"Related": {"relation": [{"id": "page-id-here"}]}}

# People
{"Assignee": {"people": [{"id": "user-id-here"}]}}

# Status (if database uses the Status property)
{"Status": {"status": {"name": "In Progress"}}}
```

## Block Types for Page Content

When appending blocks to pages, use these formats:

```python
# Paragraph
{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Section Title"}}]}}

# Heading 1
{"object": "block", "type": "heading_1", "heading_1": {"rich_text": [{"type": "text", "text": {"content": "Heading 1"}}]}}

# Heading 2
{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Section Title"}}]}}

# Heading 3
{"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"type": "text", "text": {"content": "Sub-section"}}]}}

# Bulleted list
{"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "List item"}}]}}

# Numbered list
{"object": "block", "type": "numbered_list_item", "numbered_list_item": {"rich_text": [{"type": "text", "text": {"content": "Item 1"}}]}}

# To-do
{"object": "block", "type": "to_do", "to_do": {"rich_text": [{"type": "text", "text": {"content": "Task"}}], "checked": false}}

# Toggle
{"object": "block", "type": "toggle", "toggle": {"rich_text": [{"type": "text", "text": {"content": "Expand me"}}]}}

# Callout
{"object": "block", "type": "callout", "callout": {"rich_text": [{"type": "text", "text": {"content": "Note"}}], "icon": {"emoji": "💡"}}}

# Quote
{"object": "block", "type": "quote", "quote": {"rich_text": [{"type": "text", "text": {"content": "Quote text"}}]}}

# Divider
{"object": "block", "type": "divider", "divider": {}}

# Code block
{"object": "block", "type": "code", "code": {"rich_text": [{"type": "text", "text": {"content": "print('hello')"}}], "language": "python"}}

# Image (external URL)
{"object": "block", "type": "image", "image": {"type": "external", "external": {"url": "https://..."}}}
```

## Setup Instructions (for first-time use)

### Step 1: Store the API key

Set the Notion API key as an environment variable or create a config file:

**Option A: Environment variable** (recommended for security)
```bash
export NOTION_API_KEY="ntn_1234567890..."
```

**Option B: Config file** (stored in the skill directory)
Create `/mnt/user-data/workspace/notion-integration/.env` with:
```
NOTION_API_KEY=ntn_1234567890...
```

### Step 2: Install dependencies

```bash
pip install requests python-dotenv
```

## Usage Workflow

When the user requests a Notion operation, follow this pattern:

1. **Identify the operation** the user wants (query, read, create, update, search)
2. **Check for required IDs** — if the user hasn't provided a database/page ID, ask for it
3. **Run the helper script** — execute `python scripts/notion_api.py <operation> <args>`
4. **Format results** — present the Notion data in a clean, readable format
5. **If creating/updating** — confirm the result and show the page URL

### Example: Querying a Database

```bash
python scripts/notion_api.py query_database \
  --database-id "abc123def456..." \
  --page-size 10
```

### Example: Creating a Page

```bash
python scripts/notion_api.py create_page \
  --database-id "abc123def456..." \
  --properties '{"Name": {"title": [{"text": {"content": "New Task"}}]}, "Status": {"select": {"name": "To Do"}}}'
```

## Error Handling

Common Notion API errors and how to handle them:

| HTTP Status | Meaning | Fix |
|-------------|---------|-----|
| 400 | Bad request (invalid body) | Check property/block formats match the schema |
| 401 | Unauthorized | API key is invalid or expired — ask user to regenerate |
| 403 | Forbidden | Integration not connected to the database/page — remind user to share |
| 404 | Not found | Database/page ID is wrong — double-check with user |
| 409 | Conflict | Version conflict (stale data) — re-fetch and retry |
| 429 | Rate limited | Wait and retry (script handles this automatically) |

Always prompt the user to check their API key permissions and database connections if operations fail with 403/404 errors. The connection step (sharing the database with the integration) is the most common issue.
