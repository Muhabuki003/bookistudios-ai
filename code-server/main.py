"""BSAI Code — companion service.

Owns per-user workspace git operations on top of the OpenDesign daemon's
agent runtime (which executes codex runs in /app/.od/projects/<id>).

Auth:   access_token cookie -> office-server /me -> user email.
        bsai_user cookie forwarded to the daemon for project ownership.
Files:  /app/.od/projects/<id> (shared via volumes-from open-design).
Git:    workspace repos; GitHub PAT per user in /app/data/code_gh_tokens.json.
"""

import base64
import json
import os
import re
import secrets
import subprocess
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, StreamingResponse

OFFICE_ME_URL = os.environ.get(
    "OFFICE_ME_URL", "http://172.18.0.2:8003/api/v1/auth/me"
)
DAEMON_URL = os.environ.get("DAEMON_URL", "http://open-design:7456")
PROJECTS_ROOT = Path(os.environ.get("PROJECTS_ROOT", "/app/.od/projects"))
DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
GH_TOKENS_FILE = DATA_DIR / "code_gh_tokens.json"
GITHUB_OAUTH_FILE = DATA_DIR / "github_oauth.json"
APP_BASE = os.environ.get("APP_BASE", "https://bsaiagents.com")
GITHUB_SCOPES = "repo read:user user:email"
GIT_NAME = "BSAI Code"
GIT_EMAIL = "code@bsaiagents.com"
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")

app = FastAPI(title="BSAI Code Server")


# ---------- auth ----------

async def current_user(request: Request) -> dict:
    """Validate the session cookie against the office server."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                OFFICE_ME_URL, cookies=request.cookies
            )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, "auth backend unreachable") from exc
    if resp.status_code != 200:
        raise HTTPException(401, {"code": "not_authenticated"})
    return resp.json()


async def check_owner(request: Request, project_id: str) -> None:
    """Fail-closed ownership check via the daemon (owner-scoped GET)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{DAEMON_URL}/api/projects/{urllib.parse.quote(project_id)}",
                cookies=request.cookies,
            )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, "daemon unreachable") from exc
    if resp.status_code != 200:
        raise HTTPException(404, "project not found")


def workspace(project_id: str) -> Path:
    if not SAFE_ID.match(project_id or ""):
        raise HTTPException(400, "invalid project id")
    root = (PROJECTS_ROOT / project_id).resolve()
    if not str(root).startswith(str(PROJECTS_ROOT.resolve())):
        raise HTTPException(400, "invalid project id")
    return root


def safe_rel(path: str) -> str:
    p = urllib.parse.unquote(path or "")
    if p.startswith("/") or ".." in Path(p).parts:
        raise HTTPException(400, "invalid path")
    return p


def gh_account(user: dict) -> dict | None:
    """Return the stored GitHub account {token, login, name, connected_at} or None."""
    try:
        data = json.loads(GH_TOKENS_FILE.read_text())
    except FileNotFoundError:
        return None
    entry = data.get(user.get("email", ""))
    if not entry:
        return None
    if isinstance(entry, dict):
        return entry
    # legacy: plain PAT string
    return {"token": entry, "login": "", "name": ""}


def gh_token(user: dict) -> str:
    acct = gh_account(user)
    if not acct:
        raise HTTPException(409, {"code": "github_not_connected"})
    return acct["token"]


def store_gh_account(user: dict, token: str, login: str = "", name: str = "") -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        data = json.loads(GH_TOKENS_FILE.read_text())
    except FileNotFoundError:
        data = {}
    data[user.get("email", "")] = {
        "token": token,
        "login": login,
        "name": name,
        "connected_at": datetime.now(timezone.utc).isoformat(),
    }
    GH_TOKENS_FILE.write_text(json.dumps(data, indent=2))
    os.chmod(GH_TOKENS_FILE, 0o600)


def github_oauth_config() -> dict:
    """Client id/secret from env (container recreate) OR the bind-mounted
    /app/data/github_oauth.json file (no recreate — the pattern that works here)."""
    env_id = os.environ.get("GITHUB_CLIENT_ID", "")
    env_secret = os.environ.get("GITHUB_CLIENT_SECRET", "")
    if env_id and env_secret:
        return {"client_id": env_id, "client_secret": env_secret}
    try:
        cfg = json.loads(GITHUB_OAUTH_FILE.read_text())
        if cfg.get("client_id") and cfg.get("client_secret"):
            return cfg
    except FileNotFoundError:
        pass
    return {}


def run_git(ws: Path, args: list[str], **kw) -> str:
    proc = subprocess.run(
        ["git", "-C", str(ws), *args],
        capture_output=True, text=True, timeout=120, **kw,
    )
    if proc.returncode != 0:
        raise HTTPException(500, proc.stderr.strip()[:500] or "git failed")
    return proc.stdout.strip()


def _basic_auth(token: str) -> str:
    return base64.b64encode(f"x-access-token:{token}".encode()).decode()


def _push_header(token: str) -> str:
    return "http.extraheader=" + "Author" + "ization: Basic " + _basic_auth(token)


# ---------- projects ----------

@app.get("/api/code/projects")
async def list_projects(request: Request):
    user = await current_user(request)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{DAEMON_URL}/api/projects", cookies=request.cookies
        )
    if resp.status_code != 200:
        raise HTTPException(502, "daemon error")
    return resp.json()


@app.post("/api/code/projects")
async def create_project(request: Request):
    user = await current_user(request)
    body = await request.json()
    payload = {"id": body.get("id") or None, "name": body.get("name") or "Code workspace"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{DAEMON_URL}/api/projects",
            json={k: v for k, v in payload.items() if v is not None},
            cookies=request.cookies,
        )
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, resp.text[:300])
    project = resp.json().get("project", {})
    pid = project.get("id")
    ws = workspace(pid)
    ws.mkdir(parents=True, exist_ok=True)
    if not (ws / ".git").exists():
        run_git(ws, ["init", "-b", "main"])
        run_git(ws, ["config", "user.name", GIT_NAME])
        run_git(ws, ["config", "user.email", GIT_EMAIL])
        (ws / "README.md").write_text(
            f"# {project.get('name') or 'BSAI Code workspace'}\n\nYour AI coding workspace.\n"
        )
        run_git(ws, ["add", "-A"])
        run_git(ws, ["commit", "-m", "Initial commit"])
    return resp.json()


# ---------- files ----------

@app.get("/api/code/projects/{project_id}/tree")
async def file_tree(project_id: str, request: Request, path: str = ""):
    await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    rel = safe_rel(path)
    base = (ws / rel).resolve()
    if not str(base).startswith(str(ws.resolve())):
        raise HTTPException(400, "invalid path")
    if not base.is_dir():
        raise HTTPException(404, "not a directory")
    entries = []
    for child in sorted(base.iterdir()):
        if child.name.startswith(".git"):
            continue
        entries.append({
            "name": child.name,
            "type": "dir" if child.is_dir() else "file",
            "path": str((Path(rel) / child.name)),
        })
    return {"path": rel, "entries": entries}


@app.get("/api/code/projects/{project_id}/file")
async def read_file(project_id: str, request: Request, path: str):
    await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    rel = safe_rel(path)
    target = (ws / rel).resolve()
    if not str(target).startswith(str(ws.resolve())) or not target.is_file():
        raise HTTPException(404, "file not found")
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(415, "binary file")
    return {"path": rel, "content": content}


@app.post("/api/code/projects/{project_id}/file")
async def write_file(project_id: str, request: Request):
    await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    body = await request.json()
    rel = safe_rel(body.get("path", ""))
    target = (ws / rel).resolve()
    if not str(target).startswith(str(ws.resolve())):
        raise HTTPException(400, "invalid path")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body.get("content", ""), encoding="utf-8")
    return {"ok": True}


# ---------- git ----------

@app.get("/api/code/projects/{project_id}/git/status")
async def git_status(project_id: str, request: Request):
    await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    if not (ws / ".git").exists():
        return {"branch": None, "clean": True, "changes": []}
    branch = run_git(ws, ["rev-parse", "--abbrev-ref", "HEAD"])
    status = run_git(ws, ["status", "--porcelain=v1", "-z"])
    changes = [c for c in status.split("\0") if c] if status else []
    return {"branch": branch, "clean": not changes, "changes": changes}


@app.get("/api/code/projects/{project_id}/git/diff")
async def git_diff(project_id: str, request: Request):
    await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    if not (ws / ".git").exists():
        return {"diff": ""}
    # intent-to-add so untracked files appear in the diff
    subprocess.run(
        ["git", "-C", str(ws), "add", "-N", "."],
        capture_output=True, text=True, timeout=60,
    )
    diff = run_git(ws, ["diff", "HEAD", "--stat", "--"])
    full = run_git(ws, ["diff", "HEAD", "--"])
    return {"stat": diff, "diff": full}


@app.post("/api/code/projects/{project_id}/git/commit")
async def git_commit(project_id: str, request: Request):
    await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    body = await request.json()
    message = (body.get("message") or "Update from BSAI Code").strip()[:200]
    run_git(ws, ["add", "-A"])
    if run_git(ws, ["status", "--porcelain"]):
        run_git(ws, ["commit", "-m", message])
    return {"ok": True, "message": message}


@app.post("/api/code/projects/{project_id}/git/branch")
async def git_branch(project_id: str, request: Request):
    await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    body = await request.json()
    name = re.sub(r"[^A-Za-z0-9._/-]", "-", body.get("name") or "patch")[:80]
    existing = run_git(ws, ["branch", "--list", name])
    if not existing:
        run_git(ws, ["checkout", "-b", name])
    else:
        run_git(ws, ["checkout", name])
    return {"branch": name}


def repo_ident(ws: Path) -> tuple[str, str]:
    out = run_git(ws, ["remote", "get-url", "origin"])
    m = re.search(r"(?:github\.com[:/])([^/]+)/([^/.]+)", out)
    if not m:
        raise HTTPException(400, "no GitHub remote configured")
    return m.group(1), m.group(2)


@app.post("/api/code/projects/{project_id}/git/push")
async def git_push(project_id: str, request: Request):
    user = await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    token = gh_token(user)
    if not (ws / ".git").exists():
        raise HTTPException(400, "not a git repo")
    branch = run_git(ws, ["rev-parse", "--abbrev-ref", "HEAD"])
    run_git(
        ws,
        [
            "-c", _push_header(token),
            "push", "-u", "origin", branch,
        ],
    )
    return {"pushed": branch}


@app.post("/api/code/projects/{project_id}/import")
async def import_repo(project_id: str, request: Request):
    user = await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    body = await request.json()
    url = (body.get("repo_url") or "").strip()
    if not re.match(r"^https?://", url):
        raise HTTPException(400, "repo_url must be an https URL")
    import shutil
    tmp = Path("/tmp") / f"bsai-import-{project_id}"
    if tmp.exists():
        shutil.rmtree(tmp)
    clone_url = url
    try:
        token = gh_token(user)
        clone_url = re.sub(r"^https://", f"https://x-access-token:{token}@", url)
    except HTTPException:
        pass  # public repo, no token needed
    proc = subprocess.run(
        ["git", "clone", "--depth", "1", clone_url, str(tmp)],
        capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        raise HTTPException(400, proc.stderr.strip()[:400] or "clone failed")
    for child in tmp.iterdir():
        if child.name == ".git":
            shutil.move(str(child), str(ws / ".git"))
            continue
        dst = ws / child.name
        if dst.exists():
            shutil.rmtree(dst) if dst.is_dir() else dst.unlink()
        shutil.move(str(child), str(dst))
    shutil.rmtree(tmp, ignore_errors=True)
    run_git(ws, ["config", "user.name", GIT_NAME])
    run_git(ws, ["config", "user.email", GIT_EMAIL])
    # scrub any embedded token out of the remote, keep it usable for pushes
    run_git(ws, ["remote", "set-url", "origin", url])
    return {"ok": True, "cloned": url}


@app.post("/api/code/projects/{project_id}/pr")
async def create_pr(project_id: str, request: Request):
    """Ensure remote (create repo if none), commit, push, open PR."""
    user = await current_user(request)
    await check_owner(request, project_id)
    ws = workspace(project_id)
    token = gh_token(user)
    body = await request.json()
    title = (body.get("title") or "Update from BSAI Code").strip()[:200]
    pr_body = (body.get("body") or "").strip()[:4000]
    base = (body.get("base") or "main").strip()[:60]

    run_git(ws, ["config", "user.name", GIT_NAME])
    run_git(ws, ["config", "user.email", GIT_EMAIL])

    # ensure a remote
    remotes = run_git(ws, ["remote"]).splitlines() if (ws / ".git").exists() else []
    if "origin" not in remotes:
        slug = re.sub(r"[^A-Za-z0-9_-]", "-", project_id)[:80] or "bsai-code-workspace"
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.github.com/user/repos",
                json={"name": slug, "private": True, "description": "Created by BSAI Code"},
                headers=headers,
            )
        if resp.status_code not in (200, 201):
            raise HTTPException(400, resp.text[:300])
        full_name = resp.json().get("full_name", f"{user.get('email','').split('@')[0]}/{slug}")
        owner, repo = full_name.split("/")
        run_git(ws, ["remote", "add", "origin", f"https://github.com/{owner}/{repo}.git"])
    else:
        owner, repo = repo_ident(ws)

    # branch
    cur = run_git(ws, ["rev-parse", "--abbrev-ref", "HEAD"])
    head = f"bsai/{slugify(title)}" if cur == base else cur
    head = re.sub(r"[^A-Za-z0-9._/-]", "-", head)[:80]
    if run_git(ws, ["branch", "--list", head]):
        run_git(ws, ["checkout", head])
    else:
        run_git(ws, ["checkout", "-b", head])

    # commit any pending changes
    run_git(ws, ["add", "-A"])
    if run_git(ws, ["status", "--porcelain"]):
        run_git(ws, ["commit", "-m", title])

    # push
    run_git(ws, ["-c", _push_header(token), "push", "-u", "origin", head])

    # open PR
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            json={"title": title, "head": head, "base": base, "body": pr_body},
            headers=headers,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(400, resp.text[:300])
    pr = resp.json()
    return {"url": pr.get("html_url"), "number": pr.get("number"), "head": head}


def slugify(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", s.lower()).strip("-")[:40] or "patch"


# ---------- runs (proxy to daemon) ----------

@app.post("/api/code/projects/{project_id}/run")
async def start_run(project_id: str, request: Request):
    await current_user(request)
    await check_owner(request, project_id)
    body = await request.json()
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "message required")
    model = body.get("model") or "default"
    payload = {
        "agentId": "bsai-code",
        "message": message,
        "projectId": project_id,
        "conversationMode": "code",
    }
    if model != "default":
        payload["model"] = model
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{DAEMON_URL}/api/runs", json=payload, cookies=request.cookies
        )
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, resp.text[:300])
    return resp.json()


@app.get("/api/code/projects/{project_id}/events")
async def stream_events(project_id: str, request: Request):
    """SSE proxy of the daemon's per-project event stream."""
    await current_user(request)
    await check_owner(request, project_id)
    url = f"{DAEMON_URL}/api/projects/{urllib.parse.quote(project_id)}/events"

    async def gen():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "GET", url, cookies=request.cookies
                ) as resp:
                    if resp.status_code != 200:
                        yield f"event: error\ndata: {resp.status_code}\n\n"
                        return
                    async for chunk in resp.aiter_text():
                        yield chunk
        except Exception as exc:  # noqa: BLE001
            yield f"event: error\ndata: {exc}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@app.get("/api/code/projects/{project_id}/runs/{run_id}/events")
async def run_events(project_id: str, run_id: str, request: Request, after: int = 0):
    """Return events from the run's events.jsonl (polled by the UI)."""
    await current_user(request)
    await check_owner(request, project_id)
    if not SAFE_ID.match(run_id or ""):
        raise HTTPException(400, "invalid run id")
    path = Path("/app/.od/runs") / run_id / "events.jsonl"
    if not path.is_file():
        return {"events": [], "total": 0, "done": False}
    lines = path.read_text(encoding="utf-8").splitlines()
    total = len(lines)
    events = []
    for line in lines[max(0, after):]:
        line = line.strip()
        if line:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    done = total > 0 and json.loads(lines[-1]).get("event") == "end"
    return {"events": events, "total": total, "done": done}


@app.get("/api/code/projects/{project_id}/runs/{run_id}")
async def run_status(project_id: str, run_id: str, request: Request):
    await current_user(request)
    await check_owner(request, project_id)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{DAEMON_URL}/api/runs/{urllib.parse.quote(run_id)}",
            cookies=request.cookies,
        )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text[:300])
    return resp.json()


# ---------- GitHub account ----------

@app.get("/api/code/github/status")
async def github_status(request: Request):
    user = await current_user(request)
    acct = gh_account(user)
    if not acct:
        return {"connected": False}
    return {
        "connected": True,
        "login": acct.get("login") or "",
        "name": acct.get("name") or "",
        "scopes_hint": "repo",
    }


@app.get("/api/code/github/auth-url")
async def github_auth_url(request: Request, response: Response):
    """Return the GitHub OAuth authorize URL (frontend redirects the browser)."""
    user = await current_user(request)
    cfg = github_oauth_config()
    if not cfg.get("client_id"):
        raise HTTPException(503, {"code": "github_oauth_not_configured"})
    state = secrets.token_urlsafe(24)
    redirect_uri = f"{APP_BASE}/api/code/github/callback"
    params = {
        "client_id": cfg["client_id"],
        "redirect_uri": redirect_uri,
        "scope": GITHUB_SCOPES,
        "state": state,
        "allow_signup": "false",
    }
    url = "https://github.com/login/oauth/authorize?" + urllib.parse.urlencode(params)
    response.set_cookie(
        "gh_oauth_state", state, httponly=True, samesite="lax",
        max_age=600, path="/",
    )
    return {"url": url}


@app.get("/api/code/github/callback")
async def github_callback(request: Request):
    """GitHub redirects here after the user authorizes. Exchange code -> token,
    store per-user, bounce back to the app."""
    q = request.query_params
    err = q.get("error")
    code = q.get("code")
    state = q.get("state") or ""
    if err:
        return RedirectResponse(f"{APP_BASE}/workspace/code?gh=error&msg={urllib.parse.quote(err)}")
    expected = request.cookies.get("gh_oauth_state", "")
    if not expected or not secrets.compare_digest(expected, state):
        return RedirectResponse(f"{APP_BASE}/workspace/code?gh=error&msg=invalid_state")
    cfg = github_oauth_config()
    if not cfg.get("client_id") or not cfg.get("client_secret") or not code:
        return RedirectResponse(f"{APP_BASE}/workspace/code?gh=error&msg=not_configured")
    redirect_uri = f"{APP_BASE}/api/code/github/callback"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
    if resp.status_code != 200:
        return RedirectResponse(f"{APP_BASE}/workspace/code?gh=error&msg=exchange_failed")
    tok = resp.json().get("access_token")
    if not tok:
        return RedirectResponse(f"{APP_BASE}/workspace/code?gh=error&msg=no_token")
    # the BSAI session must still be valid (top-level nav carries cookies)
    try:
        user = await current_user(request)
    except HTTPException:
        return RedirectResponse(f"{APP_BASE}/login?next=/workspace/code")
    # fetch the GitHub identity for display
    login, name = "", ""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            uresp = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"},
            )
        if uresp.status_code == 200:
            login = uresp.json().get("login", "") or ""
            name = uresp.json().get("name") or ""
    except Exception:  # noqa: BLE001
        pass
    store_gh_account(user, tok, login=login, name=name)
    out = RedirectResponse(f"{APP_BASE}/workspace/code?gh=connected")
    out.delete_cookie("gh_oauth_state", path="/")
    return out


@app.get("/api/code/github/repos")
async def github_repos(request: Request, per_page: int = 100):
    """List EVERY repo the connected GitHub account can see (owner, collaborator, org)."""
    user = await current_user(request)
    tok = gh_token(user)
    headers = {"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"}
    repos = []
    async with httpx.AsyncClient(timeout=30) as client:
        for page in range(1, 5):  # up to 400 repos
            resp = await client.get(
                "https://api.github.com/user/repos",
                params={
                    "per_page": per_page,
                    "page": page,
                    "sort": "updated",
                    "affiliation": "owner,collaborator,organization_member",
                },
                headers=headers,
            )
            if resp.status_code != 200:
                raise HTTPException(502, f"GitHub API error {resp.status_code}")
            batch = resp.json()
            repos.extend(batch)
            if len(batch) < per_page:
                break
    return {
        "count": len(repos),
        "repos": [
            {
                "full_name": r.get("full_name"),
                "name": r.get("name"),
                "owner": (r.get("owner") or {}).get("login"),
                "private": r.get("private"),
                "default_branch": r.get("default_branch"),
                "clone_url": r.get("clone_url"),
                "description": r.get("description") or "",
                "updated_at": r.get("updated_at"),
            }
            for r in repos
        ],
    }


@app.post("/api/code/github/token")
async def set_github_token(request: Request):
    user = await current_user(request)
    body = await request.json()
    token = (body.get("token") or "").strip()
    if not re.match(r"^gh[pousr]_[A-Za-z0-9]{20,}$", token):
        raise HTTPException(400, "invalid GitHub token format")
    store_gh_token(user, token)
    return {"ok": True}


@app.delete("/api/code/github/token")
async def clear_github_token(request: Request):
    user = await current_user(request)
    try:
        data = json.loads(GH_TOKENS_FILE.read_text())
    except FileNotFoundError:
        data = {}
    data.pop(user.get("email", ""), None)
    GH_TOKENS_FILE.write_text(json.dumps(data, indent=2))
    return {"ok": True}


# ---------- connectors (Composio, proxied) ----------

@app.get("/api/code/connectors")
async def connectors(request: Request):
    await current_user(request)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{DAEMON_URL}/api/connectors/composio/config", cookies=request.cookies
        )
    return resp.json()
