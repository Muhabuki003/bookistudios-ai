"""
Gateway Auth Module — lightweight auth for BookiStudio AI frontend.

Provides /api/v1/auth/* endpoints that the frontend expects.

Flows:
- register  → creates an UNVERIFIED user, emails a branded confirmation
              link (Resend), no auto-login.
- confirm-email → marks the user verified.
- resend-confirmation → re-sends the link (60s rate limit per address).
- login/local + login → blocked with 403 {code:"email_not_verified"} until
              the user confirms.
- initialize → first admin (system setup).
- change-password → CSRF-protected.

Sending key resolution: env RESEND_API_KEY, or a file at /app/data/resend_api_key
(so the key can be added without recreating the container).
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.request
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Data paths
# ---------------------------------------------------------------------------
AUTH_FILE = "/app/data/office_users.json"
SESSIONS_FILE = "/app/data/office_sessions.json"

USER_DATA_DIR = os.path.dirname(AUTH_FILE)
os.makedirs(USER_DATA_DIR, exist_ok=True)

TOKEN_TTL = 60 * 60 * 24 * 30  # 30 days
CONFIRM_TTL = 60 * 60 * 24      # 24 hours
RESEND_MIN_INTERVAL = 60        # 60s between confirmation emails

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_users() -> dict:
    if os.path.exists(AUTH_FILE):
        try:
            with open(AUTH_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def _save_users(users: dict) -> None:
    _atomic_write(AUTH_FILE, users)


def _load_sessions() -> dict:
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def _save_sessions(sessions: dict) -> None:
    _atomic_write(SESSIONS_FILE, sessions)


def _atomic_write(path: str, data: Any) -> None:
    tmp = path + ".tmp"
    try:
        with open(tmp, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _verify_password(password: str, hash_: str) -> bool:
    return hashlib.sha256(password.encode()).hexdigest() == hash_


def _prune_expired(sessions: dict) -> dict:
    now = time.time()
    return {k: v for k, v in sessions.items() if v.get("expiry", 0) > now}


# ---------------------------------------------------------------------------
# Resend email sending
# ---------------------------------------------------------------------------

def _get_resend_key() -> str:
    key = os.environ.get("RESEND_API_KEY", "")
    if not key:
        try:
            with open("/app/data/resend_api_key") as f:
                key = f.read().strip()
        except (IOError, OSError):
            key = ""
    return key


CONFIRM_EMAIL_HTML = """\
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e8e8ea;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:-0.3px;color:#111111;">
                BookiStudios <span style="font-weight:bold;">AI</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px 32px;">
              <h1 style="margin:0;font-size:24px;line-height:1.3;color:#111111;font-weight:600;">
                Confirm your email
              </h1>
              <p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:#555555;">
                Welcome to BookiStudios AI. Tap the button below to confirm
                <strong style="color:#111111;">__EMAIL__</strong> and activate
                your account.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <a href="__CONFIRM_URL__" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:10px;">
                Confirm my account
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#888888;">
                If the button does not work, copy this link into your browser:<br/>
                <a href="__CONFIRM_URL__" style="color:#555555;word-break:break-all;">__CONFIRM_URL__</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px 32px;border-top:1px solid #eeeeee;margin-top:12px;">
              <p style="margin:12px 0 0 0;font-size:12px;color:#aaaaaa;">
                BookiStudios AI &middot; bsaiagents.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _send_confirmation_email(email: str, token: str) -> None:
    key = _get_resend_key()
    if not key:
        raise RuntimeError("email service not configured (no RESEND_API_KEY)")
    base = os.environ.get("CONFIRM_BASE_URL", "https://bsaiagents.com")
    confirm_url = f"{base}/confirm-email?token={token}"
    html_body = (
        CONFIRM_EMAIL_HTML.replace("__CONFIRM_URL__", confirm_url)
        .replace("__EMAIL__", html.escape(email))
    )
    payload = {
        "from": os.environ.get(
            "RESEND_FROM", "BookiStudios AI <bsai@bsaiagents.com>"
        ),
        "to": [email],
        "subject": "Confirm your BookiStudios AI account",
        "html": html_body,
    }
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        raise RuntimeError(f"resend error {e.code}: {detail}")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class UpdateProfileRequest(BaseModel):
    name: str | None = None


class UserCreateRequest(BaseModel):
    email: str
    password: str
    name: str
    is_admin: bool = False


class ConfirmRequest(BaseModel):
    token: str


class ResendRequest(BaseModel):
    email: str


class InitializeRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    new_email: str | None = None


# ---------------------------------------------------------------------------
# Cookie-based auth
# ---------------------------------------------------------------------------

SESSION_COOKIE = "access_token"
CSRF_COOKIE = "csrf_token"


def _set_csrf_cookie(response: Response) -> None:
    response.set_cookie(
        key=CSRF_COOKIE,
        value=secrets.token_hex(16),
        httponly=False,
        samesite="lax",
        secure=True,
        path="/",
    )


def _check_csrf(request: Request) -> None:
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get("x-csrf-token")
    if not cookie or not header or cookie != header:
        raise HTTPException(status_code=403, detail={
            "code": "csrf_error",
            "message": "CSRF token missing or invalid",
        })


def _user_json(email: str, user_data: dict) -> dict:
    return {
        "id": email,
        "email": email,
        "system_role": "admin" if user_data.get("is_admin") else "user",
        "needs_setup": False,
        "name": user_data.get("name", ""),
        "verified": user_data.get("verified", True),
    }


def _get_user_from_cookie(request: Request) -> dict | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    sessions = _load_sessions()
    session = sessions.get(token)
    if not session:
        return None
    if time.time() > session["expiry"]:
        del sessions[token]
        _save_sessions(sessions)
        return None
    users = _load_users()
    user_data = users.get(session["email"])
    if not user_data:
        return None
    return _user_json(session["email"], user_data)


def _do_login(email: str, password: str, response: Response) -> dict:
    """Shared login logic. Returns user dict on success."""
    users = _load_users()
    user_data = users.get(email)
    if not user_data:
        raise HTTPException(status_code=401, detail={
            "code": "invalid_credentials",
            "message": "Invalid email or password",
        })

    if not _verify_password(password, user_data["password_hash"]):
        raise HTTPException(status_code=401, detail={
            "code": "invalid_credentials",
            "message": "Invalid email or password",
        })

    # Legacy users (created before confirmation existed) default to verified.
    if not user_data.get("verified", True):
        raise HTTPException(status_code=403, detail={
            "code": "email_not_verified",
            "message": "Please confirm your email before signing in.",
        })

    sessions = _load_sessions()
    sessions = _prune_expired(sessions)

    token = secrets.token_hex(32)
    sessions[token] = {
        "email": email,
        "expiry": time.time() + TOKEN_TTL,
        "created": time.time(),
    }
    _save_sessions(sessions)

    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/",
        max_age=TOKEN_TTL,
    )
    _set_csrf_cookie(response)

    return _user_json(email, user_data)


# ---------------------------------------------------------------------------
# Endpoints the frontend expects
# ---------------------------------------------------------------------------


@router.get("/setup-status")
async def setup_status():
    """Check if the system has been initialised."""
    users = _load_users()
    return {"needs_setup": len(users) == 0}


@router.get("/me")
async def me(request: Request):
    """Return authenticated user info from session cookie."""
    user = _get_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail={
            "code": "not_authenticated",
            "message": "No valid session",
        })
    return user


@router.put("/me")
async def update_me(body: UpdateProfileRequest, request: Request):
    """Self-service profile update (display name)."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail={
            "code": "not_authenticated",
            "message": "No valid session",
        })
    sessions = _load_sessions()
    session = sessions.get(token)
    if not session or time.time() > session.get("expiry", 0):
        raise HTTPException(status_code=401, detail={
            "code": "not_authenticated",
            "message": "No valid session",
        })
    email = session["email"]
    users = _load_users()
    if email not in users:
        raise HTTPException(status_code=404, detail={
            "code": "user_not_found",
            "message": "User not found",
        })
    if body.name is not None:
        users[email]["name"] = body.name.strip()[:60]
    _save_users(users)
    return _user_json(email, users[email])


@router.post("/register", status_code=201)
async def register(body: RegisterRequest, response: Response):
    """Public signup: create an UNVERIFIED user and email a confirmation link."""
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail={
            "code": "invalid_email",
            "message": "Enter a valid email address",
        })
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail={
            "code": "weak_password",
            "message": "Password must be at least 8 characters",
        })

    users = _load_users()
    if email in users:
        raise HTTPException(status_code=409, detail={
            "code": "email_already_exists",
            "message": "Email already registered",
        })

    token = secrets.token_urlsafe(32)
    users[email] = {
        "password_hash": _hash_password(body.password),
        "is_admin": False,
        "name": (body.name or "").strip()[:60],
        "verified": False,
        "confirm_token": token,
        "confirm_expiry": time.time() + CONFIRM_TTL,
        "created_at": time.time(),
    }
    _save_users(users)

    try:
        _send_confirmation_email(email, token)
    except Exception as e:
        # Don't leave an unverifiable account behind.
        users.pop(email, None)
        _save_users(users)
        raise HTTPException(status_code=502, detail={
            "code": "email_service_error",
            "message": f"Could not send the confirmation email: {e}",
        })

    _set_csrf_cookie(response)
    return {"ok": True, "message": "confirmation_sent"}


@router.post("/confirm-email")
async def confirm_email(body: ConfirmRequest):
    """Mark a user verified using the emailed token."""
    users = _load_users()
    now = time.time()
    for email, user_data in users.items():
        if user_data.get("confirm_token") == body.token:
            if now > user_data.get("confirm_expiry", 0):
                raise HTTPException(status_code=410, detail={
                    "code": "token_expired",
                    "message": "This confirmation link has expired. Request a new one.",
                })
            user_data["verified"] = True
            user_data.pop("confirm_token", None)
            user_data.pop("confirm_expiry", None)
            _save_users(users)
            return {"ok": True, "verified": True, "email": email}
    raise HTTPException(status_code=400, detail={
        "code": "token_invalid",
        "message": "That confirmation link is invalid.",
    })


@router.get("/confirm-email")
async def confirm_email_get(token: str):
    """Same as POST /confirm-email but for direct link hits."""
    return await confirm_email(ConfirmRequest(token=token))


@router.post("/resend-confirmation")
async def resend_confirmation(body: ResendRequest):
    """Re-send the confirmation email (rate limited to 1/min per address)."""
    email = body.email.strip().lower()
    users = _load_users()
    user_data = users.get(email)
    if not user_data:
        raise HTTPException(status_code=404, detail={
            "code": "user_not_found",
            "message": "No account with that email",
        })
    if user_data.get("verified", True):
        raise HTTPException(status_code=400, detail={
            "code": "already_verified",
            "message": "That account is already verified",
        })

    last = user_data.get("last_confirm_sent", 0)
    if time.time() - last < RESEND_MIN_INTERVAL:
        raise HTTPException(status_code=429, detail={
            "code": "rate_limited",
            "message": "Try again in a minute.",
        })

    token = secrets.token_urlsafe(32)
    user_data["confirm_token"] = token
    user_data["confirm_expiry"] = time.time() + CONFIRM_TTL
    user_data["last_confirm_sent"] = time.time()
    _save_users(users)

    try:
        _send_confirmation_email(email, token)
    except Exception as e:
        raise HTTPException(status_code=502, detail={
            "code": "email_service_error",
            "message": f"Could not send the confirmation email: {e}",
        })
    return {"ok": True, "message": "confirmation_sent"}


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    """Authenticate with email + password (JSON body), set session cookie."""
    user = _do_login(body.email.strip().lower(), body.password, response)
    return {"ok": True, "user": user}


@router.post("/login/local")
async def login_local(request: Request, response: Response):
    """Authenticate with form-urlencoded body (used by login page)."""
    try:
        body = await request.form()
        email = str(body.get("username", "")).strip().lower()
        password = str(body.get("password", ""))
    except Exception:
        raise HTTPException(status_code=400, detail={
            "code": "invalid_credentials",
            "message": "Invalid form data",
        })

    if not email or not password:
        raise HTTPException(status_code=400, detail={
            "code": "invalid_credentials",
            "message": "Email and password required",
        })

    try:
        user = _do_login(email, password, response)
        return {"ok": True, "user": user}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail={
            "code": "invalid_credentials",
            "message": "Login failed",
        })


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Revoke the session cookie."""
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        sessions = _load_sessions()
        sessions.pop(token, None)
        _save_sessions(sessions)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return {"ok": True}


@router.post("/initialize")
async def initialize(body: InitializeRequest, response: Response):
    """Create the first admin (only valid while the system is empty)."""
    users = _load_users()
    if users:
        raise HTTPException(status_code=409, detail={
            "code": "system_already_initialized",
            "message": "System already initialized",
        })
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail={
            "code": "invalid_email",
            "message": "Enter a valid email address",
        })
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail={
            "code": "weak_password",
            "message": "Password must be at least 8 characters",
        })
    users[email] = {
        "password_hash": _hash_password(body.password),
        "is_admin": True,
        "name": "",
        "verified": True,
        "created_at": time.time(),
    }
    _save_users(users)
    user = _do_login(email, body.password, response)
    return {"ok": True, "user": user}


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, request: Request, response: Response):
    """Change the password (and optionally the email) for the current user."""
    _check_csrf(request)
    user = _get_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail={
            "code": "not_authenticated",
            "message": "No valid session",
        })
    users = _load_users()
    user_data = users.get(user["email"])
    if not user_data:
        raise HTTPException(status_code=401, detail={
            "code": "not_authenticated",
            "message": "No valid session",
        })
    if not _verify_password(body.current_password, user_data["password_hash"]):
        raise HTTPException(status_code=400, detail={
            "code": "invalid_credentials",
            "message": "Current password is incorrect",
        })
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail={
            "code": "weak_password",
            "message": "Password must be at least 8 characters",
        })

    new_email = (body.new_email or "").strip().lower()
    if new_email and new_email != user["email"]:
        if not EMAIL_RE.match(new_email):
            raise HTTPException(status_code=400, detail={
                "code": "invalid_email",
                "message": "Enter a valid email address",
            })
        if new_email in users:
            raise HTTPException(status_code=409, detail={
                "code": "email_already_exists",
                "message": "Email already registered",
            })
        users[new_email] = users.pop(user["email"])
        user_data = users[new_email]

    user_data["password_hash"] = _hash_password(body.new_password)
    _save_users(users)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.post("/users")
async def create_user(body: UserCreateRequest, request: Request):
    """Create a new user (admin only)."""
    admin = _get_user_from_cookie(request)
    if not admin or admin["system_role"] != "admin":
        raise HTTPException(status_code=403, detail={
            "code": "not_authenticated",
            "message": "Admin only",
        })

    users = _load_users()
    email = body.email.strip().lower()
    if email in users:
        raise HTTPException(status_code=409, detail={
            "code": "email_already_exists",
            "message": "Email already registered",
        })

    users[email] = {
        "password_hash": _hash_password(body.password),
        "is_admin": body.is_admin,
        "name": body.name,
        "verified": True,
        "created_at": time.time(),
    }
    _save_users(users)

    return {"ok": True, "user": email}


@router.get("/users")
async def list_users(request: Request):
    """List all users (admin only)."""
    admin = _get_user_from_cookie(request)
    if not admin or admin["system_role"] != "admin":
        raise HTTPException(status_code=403, detail={
            "code": "not_authenticated",
            "message": "Admin only",
        })

    users = _load_users()
    return {
        "users": [
            {
                "email": email,
                "name": data.get("name", ""),
                "is_admin": data.get("is_admin", False),
                "verified": data.get("verified", True),
            }
            for email, data in users.items()
        ]
    }
