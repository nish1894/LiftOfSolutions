import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Field, Notice, PageContainer } from "@/components/app/page.tsx";
import {
  SETTINGS_NAV,
  SETTINGS_TABS,
  SETTINGS_TRIGGER,
  useTabParam,
} from "@/components/app/settings-tabs.ts";
import { Pill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Checkbox, Input, NativeSelect } from "@/components/ui/input.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import SettingsHeader from "@/features/settings/SettingsHeader.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { cn } from "@/lib/utils.ts";
import { getTheme, setTheme, type ThemeChoice } from "@/shared/theme.ts";
import type { User } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

/** Personal settings. They follow the person, not the organization. */
const ACCOUNT_TABS = ["profile", "preferences", "security", "appearance"] as const;

// The API accepts an IANA time zone and a language tag; picking from a list avoids typos.
// Chrome still lists some zones under their old names; show the current IANA name instead.
const ZONE_RENAMES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kiev": "Europe/Kyiv",
};
const canonicalZone = (zone: string) => ZONE_RENAMES[zone] ?? zone;
// Browsers leave "UTC" out of their own list, and the saved value is kept even if unusual.
const timeZones = (current: string) => [
  "UTC",
  ...[...new Set([...Intl.supportedValuesOf("timeZone").map(canonicalZone), current])]
    .filter((zone) => zone !== "UTC")
    .sort(),
];
const LANGUAGES = ["en", "en-IN", "en-US", "en-GB", "ja", "hi"];
// "standard" gives "English (United States)" rather than "American English".
const languageName = new Intl.DisplayNames(["en"], {
  type: "language",
  languageDisplay: "standard",
});

export default function AccountPage() {
  const { user } = useWorkspace();
  const [tab, setTab] = useTabParam(ACCOUNT_TABS);

  return (
    <PageContainer>
      <SettingsHeader description="Your personal profile and settings." />
      <Tabs value={tab} onValueChange={setTab} className={SETTINGS_TABS}>
        <TabsList className={SETTINGS_NAV}>
          <TabsTrigger value="profile" className={SETTINGS_TRIGGER}>
            <UserRoundIcon aria-hidden="true" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className={SETTINGS_TRIGGER}>
            <SlidersHorizontalIcon aria-hidden="true" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="security" className={SETTINGS_TRIGGER}>
            <ShieldCheckIcon aria-hidden="true" />
            Security
          </TabsTrigger>
          <TabsTrigger value="appearance" className={SETTINGS_TRIGGER}>
            <PaletteIcon aria-hidden="true" />
            Appearance
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileForm user={user} />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesForm user={user} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityCard user={user} />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceCard />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function ProfileForm({ user }: { user: User }) {
  const { saveProfile } = useAuth();
  const [form, setForm] = useState({
    display_name: user.display_name ?? "",
    phone: user.phone ?? "",
    photo_url: user.photo_url ?? "",
  });

  const save = useAction(async () => {
    await saveProfile({
      display_name: form.display_name.trim(),
      phone: form.phone.trim() || null,
      photo_url: form.photo_url.trim() || null,
    });
    toast.success("Profile saved");
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save.run();
  }

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Profile</CardTitle>
          <CardDescription>How teammates see you in your organization.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Display name" htmlFor="profile-name">
            <Input
              id="profile-name"
              required
              value={form.display_name}
              onChange={(event) => set("display_name", event.target.value)}
            />
          </Field>
          <Field
            label="Phone"
            htmlFor="profile-phone"
            hint="International format with the country code, e.g. +819012345678."
          >
            <Input
              id="profile-phone"
              type="tel"
              inputMode="tel"
              placeholder="+819012345678"
              pattern="\+[1-9][0-9]{6,14}"
              title="A plus sign, the country code and the number, without spaces: +819012345678"
              value={form.phone}
              onChange={(event) => set("phone", event.target.value.replace(/[\s-]/g, ""))}
            />
          </Field>
          <Field label="Photo URL" htmlFor="profile-photo">
            <Input
              id="profile-photo"
              type="url"
              placeholder="https://…"
              value={form.photo_url}
              onChange={(event) => set("photo_url", event.target.value)}
            />
          </Field>
          {save.error && (
            <Notice tone="error" className="sm:col-span-2">
              {save.error}
            </Notice>
          )}
          <Button type="submit" className="justify-self-start" disabled={save.busy}>
            {save.busy ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PreferencesForm({ user }: { user: User }) {
  const { saveProfile } = useAuth();
  const [form, setForm] = useState({
    timezone: canonicalZone(
      user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ),
    locale: user.locale || navigator.language || "en",
    emailNotifications: user.preferences?.email_notifications ?? true,
    productUpdates: user.preferences?.product_updates ?? false,
  });

  const save = useAction(async () => {
    await saveProfile({
      timezone: form.timezone.trim(),
      locale: form.locale.trim(),
      preferences: {
        email_notifications: form.emailNotifications,
        product_updates: form.productUpdates,
      },
    });
    toast.success("Preferences saved");
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save.run();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Time zone" htmlFor="pref-timezone">
            <NativeSelect
              id="pref-timezone"
              required
              value={form.timezone}
              onChange={(event) => setForm({ ...form, timezone: event.target.value })}
            >
              {timeZones(form.timezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Language and region" htmlFor="pref-locale">
            <NativeSelect
              id="pref-locale"
              required
              value={form.locale}
              onChange={(event) => setForm({ ...form, locale: event.target.value })}
            >
              {[...new Set([...LANGUAGES, form.locale])].map((code) => (
                <option key={code} value={code}>
                  {languageName.of(code) ?? code}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Email</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.emailNotifications}
                onChange={(event) => setForm({ ...form, emailNotifications: event.target.checked })}
              />
              Notifications about access requests and my organizations
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.productUpdates}
                onChange={(event) => setForm({ ...form, productUpdates: event.target.checked })}
              />
              Product updates
            </label>
          </fieldset>
          {save.error && (
            <Notice tone="error" className="sm:col-span-2">
              {save.error}
            </Notice>
          )}
          <Button type="submit" className="justify-self-start" disabled={save.busy}>
            {save.busy ? "Saving…" : "Save preferences"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityCard({ user }: { user: User }) {
  const { resendVerification, signOutEverywhere } = useAuth();
  const navigate = useNavigate();
  const verify = useAction(async () => {
    await resendVerification();
    toast.success("Verification email sent");
  });
  const signOutAll = useAction(async () => {
    await signOutEverywhere();
    navigate("/", { replace: true });
  });

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Security</CardTitle>
          <CardDescription>Sign-in is handled by Firebase Authentication.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid flex-1 gap-1">
            <span className="font-medium">{user.email}</span>
            <Pill tone={user.email_verified ? "success" : "warning"} className="justify-self-start">
              {user.email_verified ? "Email verified" : "Email not verified"}
            </Pill>
          </div>
          {!user.email_verified && (
            <Button variant="outline" onClick={() => verify.run()} disabled={verify.busy}>
              {verify.busy ? "Sending…" : "Send verification email"}
            </Button>
          )}
        </div>
        {verify.error && <Notice tone="error">{verify.error}</Notice>}

        <PasswordSection />

        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <div className="grid flex-1 gap-1">
            <span className="font-medium">Sign out of all devices</span>
            <span className="text-sm text-muted-foreground">
              Use this if a device was lost or someone else may be signed in as you.
            </span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive-outline">Sign out everywhere</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sign out of all devices?</DialogTitle>
                <DialogDescription>
                  You'll be signed out here too and need to sign in again.
                </DialogDescription>
              </DialogHeader>
              {signOutAll.error && <Notice tone="error">{signOutAll.error}</Notice>}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => signOutAll.run()}
                  disabled={signOutAll.busy}
                >
                  {signOutAll.busy ? "Signing out…" : "Sign out everywhere"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string; icon: typeof SunIcon }> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "Match my device", icon: MonitorIcon },
];

function AppearanceCard() {
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);

  function choose(next: ThemeChoice) {
    setTheme(next);
    setThemeState(next);
  }

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Light is the default. Your choice is saved in this browser.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">Theme</legend>
          {THEME_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted",
                theme === option.value && "border-primary bg-accent text-accent-foreground",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => choose(option.value)}
                className="accent-primary"
              />
              <option.icon className="size-4" aria-hidden="true" />
              {option.label}
            </label>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}

/* Google accounts can add a password so the same email also signs in with it;
   accounts that have one can change it. */
function PasswordSection() {
  const { hasPassword, setPassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const mismatch = form.confirm !== "" && form.next !== form.confirm;

  const save = useAction(async () => {
    await setPassword(form.next, hasPassword ? form.current : undefined);
    toast.success(hasPassword ? "Password changed" : "Password added");
    setOpen(false);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mismatch) void save.run();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-5">
      <div className="grid flex-1 gap-1">
        <span className="font-medium">Password</span>
        <span className="text-sm text-muted-foreground">
          {hasPassword
            ? "You can sign in with your email and password."
            : "You sign in with Google. Add a password to also sign in with your email address."}
        </span>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setForm({ current: "", next: "", confirm: "" });
            save.clearError();
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">{hasPassword ? "Change password" : "Add a password"}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasPassword ? "Change password" : "Add a password"}</DialogTitle>
            <DialogDescription>
              {hasPassword
                ? "Other devices are signed out when the password changes."
                : "Google may ask you to sign in again first. Other devices are signed out afterwards."}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submit}>
            {hasPassword && (
              <Field label="Current password" htmlFor="password-current">
                <Input
                  id="password-current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={form.current}
                  onChange={(event) => setForm({ ...form, current: event.target.value })}
                />
              </Field>
            )}
            <Field label="New password" htmlFor="password-new" hint="At least 8 characters.">
              <Input
                id="password-new"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={form.next}
                onChange={(event) => setForm({ ...form, next: event.target.value })}
              />
            </Field>
            <Field label="Repeat the new password" htmlFor="password-confirm">
              <Input
                id="password-confirm"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={mismatch || undefined}
                value={form.confirm}
                onChange={(event) => setForm({ ...form, confirm: event.target.value })}
              />
            </Field>
            {mismatch && <Notice tone="error">The two passwords don't match.</Notice>}
            {save.error && <Notice tone="error">{save.error}</Notice>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={save.busy || mismatch}>
                {save.busy ? "Saving…" : hasPassword ? "Change password" : "Add password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
