"use client";

import { LogOutIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetch, getCsrfHeaders } from "@/core/api/fetcher";
import { useAuth } from "@/core/auth/AuthProvider";
import { parseAuthError } from "@/core/auth/types";
import { useI18n } from "@/core/i18n/hooks";

import { SettingsSection } from "./settings-section";

export function AccountSettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [nameMessage, setNameMessage] = useState("");
  const [nameError, setNameError] = useState("");
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError("");
    setNameMessage("");
    setSavingName(true);
    try {
      const res = await fetch("/api/v1/auth/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ name: displayName.trim().slice(0, 60) }),
      });
      if (!res.ok) {
        const data = await res.json();
        setNameError(parseAuthError(data).message);
        return;
      }
      await refreshUser();
      setNameMessage(t.settings.account.nameSaved);
    } catch {
      setNameError(t.settings.account.networkError);
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError(t.settings.account.passwordMismatch);
      return;
    }
    if (newPassword.length < 8) {
      setError(t.settings.account.passwordTooShort);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const authError = parseAuthError(data);
        setError(authError.message);
        return;
      }

      setMessage(t.settings.account.passwordChangedSuccess);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError(t.settings.account.networkError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <SettingsSection title={t.settings.account.profileTitle}>
        <div className="space-y-2">
          <div className="grid grid-cols-[max-content_max-content] items-center gap-4">
            <span className="text-muted-foreground text-sm">
              {t.settings.account.email}
            </span>
            <span className="text-sm font-medium">{user?.email ?? "—"}</span>
            <span className="text-muted-foreground text-sm">
              {t.settings.account.role}
            </span>
            <span className="text-sm font-medium capitalize">
              {user?.system_role ?? "—"}
            </span>
          </div>
          <form
            onSubmit={handleSaveName}
            className="grid grid-cols-[max-content_max-content] items-center gap-4 pt-1"
          >
            <span className="text-muted-foreground text-sm">
              {t.settings.account.displayName}
            </span>
            <div className="flex items-center gap-2">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex"
                maxLength={60}
                className="w-52"
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={savingName}
              >
                {savingName ? t.settings.account.updating : t.settings.account.save}
              </Button>
            </div>
          </form>
          {nameError && <p className="text-sm text-red-500">{nameError}</p>}
          {nameMessage && (
            <p className="text-sm text-green-500">{nameMessage}</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t.settings.account.changePasswordTitle}
        description={t.settings.account.changePasswordDescription}
      >
        <form onSubmit={handleChangePassword} className="max-w-sm space-y-3">
          <Input
            type="password"
            placeholder={t.settings.account.currentPassword}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder={t.settings.account.newPassword}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <Input
            type="password"
            placeholder={t.settings.account.confirmNewPassword}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          {message && <p className="text-sm text-green-500">{message}</p>}
          <Button type="submit" variant="outline" size="sm" disabled={loading}>
            {loading
              ? t.settings.account.updating
              : t.settings.account.updatePassword}
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection title="" description="">
        <Button
          variant="destructive"
          size="sm"
          onClick={logout}
          className="gap-2"
        >
          <LogOutIcon className="size-4" />
          {t.settings.account.signOut}
        </Button>
      </SettingsSection>
    </div>
  );
}
