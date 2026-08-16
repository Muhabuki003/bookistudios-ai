"""E2E test for the code-server companion. Run inside the container."""
import json
import time

import httpx

BASE = "http://127.0.0.1:8100"

# pick a live session token
sessions = json.load(open("/app/data/office_sessions.json"))
now = time.time()
token, meta = next(
    ((k, v) for k, v in sessions.items() if v.get("expiry", 0) > now),
    (None, None),
)
assert token, "no live session token"
print("user:", meta["email"])

cookies = {"access_token": token, "bsai_user": meta["email"]}

def show(label, resp):
    body = resp.text[:220].replace("\n", " ")
    print(f"{label}: HTTP {resp.status_code} | {body}")
    return resp

# 1. list projects (daemon proxy)
r = show("list projects", httpx.get(f"{BASE}/api/code/projects", cookies=cookies))

# 2. create a workspace project (unique id per run)
pid = "test-ws-" + str(int(time.time()))
r = show("create project", httpx.post(
    f"{BASE}/api/code/projects", cookies=cookies,
    json={"id": pid, "name": "Test WS"},
))

# 3. file tree
r = show("tree", httpx.get(f"{BASE}/api/code/projects/{pid}/tree", cookies=cookies))

# 4. git status (fresh repo should be clean, branch main)
r = show("git status", httpx.get(f"{BASE}/api/code/projects/{pid}/git/status", cookies=cookies))

# 5. write a file
r = show("write file", httpx.post(
    f"{BASE}/api/code/projects/{pid}/file", cookies=cookies,
    json={"path": "src/app.js", "content": "console.log('hi');\n"},
))

# 6. git status now shows change
r = show("git status after write", httpx.get(f"{BASE}/api/code/projects/{pid}/git/status", cookies=cookies))

# 7. diff
r = show("git diff", httpx.get(f"{BASE}/api/code/projects/{pid}/git/diff", cookies=cookies))

# 8. commit
r = show("commit", httpx.post(
    f"{BASE}/api/code/projects/{pid}/git/commit", cookies=cookies,
    json={"message": "add app.js"},
))

# 9. branch
r = show("branch", httpx.post(
    f"{BASE}/api/code/projects/{pid}/git/branch", cookies=cookies,
    json={"name": "feature/test"},
))

# 10. ownership negative test: project we don't own
r = show("foreign project (expect 404)", httpx.get(
    f"{BASE}/api/code/projects/bsai-code-e2e-3/tree", cookies=cookies,
))

# 11. github status (no token -> connected false)
r = show("github status", httpx.get(f"{BASE}/api/code/github/status", cookies=cookies))

# 12. bad token format
r = show("bad token (expect 400)", httpx.post(
    f"{BASE}/api/code/github/token", cookies=cookies,
    json={"token": "not-a-token"},
))
