// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { authApi } from '@/apis/authApi';
import {
  Lock, Mail, User, ShieldCheck, Check, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiKeysSection } from '@/components/profile/ApiKeysSection';
import { NotificationSettingsSection } from '@/components/profile/NotificationSettingsSection';
import { ConnectedAccountsSection } from '@/components/profile/ConnectedAccountsSection';

/* ── Password strength ─────────────────────────────── */
function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { score, label: 'Very weak',  color: 'bg-red-500' };
  if (score === 2) return { score, label: 'Weak',       color: 'bg-orange-500' };
  if (score === 3) return { score, label: 'Fair',       color: 'bg-amber-400' };
  if (score === 4) return { score, label: 'Good',       color: 'bg-blue-500' };
  return              { score, label: 'Strong',      color: 'bg-emerald-500' };
}

/* ── Strength bar ───────────────────────────────────── */
function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = passwordStrength(password);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i < score ? color : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className={cn('text-xs font-medium', score <= 1 ? 'text-red-500' : score === 2 ? 'text-orange-500' : score === 3 ? 'text-amber-500' : score === 4 ? 'text-blue-500' : 'text-emerald-500')}>
        {label}
      </p>
    </div>
  );
}

/* ── Main component ─────────────────────────────────── */
export function Profile() {
  const { user, activeOrg, updateProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  // Keep the draft in sync if the store name changes (e.g. after a refresh).
  useEffect(() => {
    if (user?.name) setNameDraft(user.name);
  }, [user?.name]);

  const nameChanged = nameDraft.trim().length > 0 && nameDraft.trim() !== user?.name;

  const onSaveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === user?.name) return;
    setSavingName(true);
    const r = await updateProfile(next);
    setSavingName(false);
    if (r.meta.requestStatus === 'fulfilled') toast.success('Name updated');
    else toast.error((r.payload as string) ?? 'Failed to update name');
  };

  const passwordsMatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Failed to change password. Please check your current password.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Phase 2: show the role in the ACTIVE org (globalRole is gone, M4).
  const displayRole = activeOrg?.role ?? 'member';
  const roleVariant = displayRole === 'admin' ? ('info' as const) : ('secondary' as const);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent ring-1 ring-primary/10">
        <div className="flex flex-col items-start gap-5 p-7 sm:flex-row sm:items-center">
          {/* Avatar */}
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-elevated">
            {initials}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
              <Badge variant={roleVariant} className="capitalize">{displayRole}</Badge>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {user.email}
            </p>
          </div>
        </div>
      </div>

      {/* ── Content grid ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">

        {/* Account information */}
        <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Account Information</h2>
              <p className="text-xs text-muted-foreground">Your personal details</p>
            </div>
          </div>

          <div className="divide-y divide-border/60">
            <div className="py-3.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</span>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && nameChanged) void onSaveName(); }}
                  maxLength={120}
                  aria-label="Display name"
                  className="h-9"
                />
                <Button
                  size="sm"
                  onClick={() => void onSaveName()}
                  disabled={savingName || !nameChanged}
                >
                  {savingName ? 'Saving…' : 'Save'}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                This is how your name appears across projects and in JIRA imports.
              </p>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</span>
              <span className="max-w-[200px] truncate text-sm text-muted-foreground">{user.email}</span>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</span>
              <Badge variant={roleVariant} className="capitalize">{displayRole}</Badge>
            </div>
          </div>
        </div>

        {/* Security — Change Password */}
        <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Security</h2>
              <p className="text-xs text-muted-foreground">Update your password</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Current password */}
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword" className="flex items-center gap-1.5 text-xs font-medium">
                <Lock className="h-3 w-3 text-muted-foreground" />
                Current Password
              </Label>
              <PasswordInput
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter current password"
                required
              />
            </div>

            {/* New password */}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="flex items-center gap-1.5 text-xs font-medium">
                <Lock className="h-3 w-3 text-muted-foreground" />
                New Password
              </Label>
              <PasswordInput
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="8+ characters"
                required
                minLength={8}
              />
              <StrengthBar password={newPassword} />
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="flex items-center gap-1.5 text-xs font-medium">
                <Lock className="h-3 w-3 text-muted-foreground" />
                Confirm New Password
              </Label>
              <div className="relative">
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Repeat new password"
                  required
                  minLength={8}
                />
              </div>
              {passwordsMatch && (
                <p className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  Passwords match
                </p>
              )}
              {passwordsMismatch && (
                <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                  <X className="h-3 w-3" />
                  Passwords do not match
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || passwordsMismatch}
            >
              {isLoading ? 'Changing Password…' : 'Change Password'}
            </Button>
          </form>
        </div>
      </div>

      {/* ── Connected accounts (SSO) ── */}
      <ConnectedAccountsSection />

      {/* ── Notifications ── */}
      <NotificationSettingsSection />

      {/* ── API Keys ── */}
      <ApiKeysSection />
    </div>
  );
}
