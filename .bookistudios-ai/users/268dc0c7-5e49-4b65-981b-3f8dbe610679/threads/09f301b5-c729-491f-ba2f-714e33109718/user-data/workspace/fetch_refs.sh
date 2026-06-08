#!/bin/bash
# Fetch reference SKILL.md files and examples for Notion skill construction

OUTDIR="/mnt/user-data/workspace/ref"
mkdir -p "$OUTDIR"

echo "=== Fetching notion-sdk-py README ==="
curl -sSL --max-time 30 "https://raw.githubusercontent.com/ramnes/notion-sdk-py/main/README.md" > "$OUTDIR/notion-sdk-py-README.md" 2>&1
echo "Exit: $?"

echo "=== Fetching notion-sdk-py example ==="
curl -sSL --max-time 30 "https://raw.githubusercontent.com/ramnes/notion-sdk-py/main/examples/first_project/script.py" > "$OUTDIR/notion-sdk-py-example.py" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion API intro doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/intro" > "$OUTDIR/notion-api-intro.html" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion patch page doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/patch-page" > "$OUTDIR/notion-patch-page.html" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion post page doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/post-page" > "$OUTDIR/notion-post-page.html" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion query database doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/post-database-query" > "$OUTDIR/notion-query-database.html" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion block children doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/get-block-children" > "$OUTDIR/notion-get-block-children.html" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion append block children doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/patch-block-children" > "$OUTDIR/notion-patch-block-children.html" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion search doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/post-search" > "$OUTDIR/notion-search.html" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion retrieve page doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/retrieve-a-page" > "$OUTDIR/notion-retrieve-page.html" 2>&1
echo "Exit: $?"

echo "=== Fetching Notion retrieve database doc ==="
curl -sSL --max-time 30 "https://developers.notion.com/reference/retrieve-a-database" > "$OUTDIR/notion-retrieve-database.html" 2>&1
echo "Exit: $?"

echo "=== Listing results ==="
ls -la "$OUTDIR/"
