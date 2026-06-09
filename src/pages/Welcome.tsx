import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sprout,
  ArrowRight,
  ArrowLeft,
  Flower2,
  PackageSearch,
  ShoppingCart,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { restGet, supabase } from "@/lib/supabase";
import { getDemoProfile, updateDemoProfile } from "@/lib/demo/store";
import { friendlyDbError } from "@/lib/dbErrors";
import { cn } from "@/lib/utils";

type StepId = "profile" | "preferences" | "review";

const STEPS: { id: StepId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "preferences", label: "Notifications" },
  { id: "review", label: "Get started" },
];

type NotifPrefs = {
  low_stock?: boolean;
  license_expiring?: boolean;
  new_order?: boolean;
};

const NAME_MIN = 2;
const NAME_MAX = 50;

export default function Welcome() {
  const { user, isAdmin, isDemo, onboardedAt, profileChecked, refreshProfile, setOnboardedLocal } = useAuth();
  const { addToast } = useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState<StepId>("profile");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [displayName, setDisplayName] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(true);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    low_stock: true,
    license_expiring: true,
    new_order: true,
  });
  const [nextDestination, setNextDestination] = useState<string>("/");
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const profileInputRef = useRef<HTMLInputElement>(null);
  const reviewBtnRef = useRef<HTMLButtonElement>(null);
  // Mirror nextDestination in a ref so completeOnboarding (whose body awaits)
  // always sees the latest value, regardless of when its closure was captured.
  const nextDestinationRef = useRef(nextDestination);
  useEffect(() => {
    nextDestinationRef.current = nextDestination;
  }, [nextDestination]);
  // Set once we've fired navigate(). Prevents the "already onboarded" bouncer
  // below from racing with our own optimistic onboardedAt update and
  // intercepting our targeted destination with a redirect to "/".
  const completingRef = useRef(false);

  // Pre-fill display name from the access_request submitted earlier.
  useEffect(() => {
    if (!user?.email) return;
    if (isDemo) {
      const name = getDemoProfile().display_name;
      if (name) {
        setDisplayName(name);
        setHint("Sample name — change it if you'd like.");
      }
      setPrefilling(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await restGet<Array<{ name: string | null }>>(
          `access_requests?select=name&email=eq.${encodeURIComponent(user.email!)}&order=requested_at.desc&limit=1`,
        );
        if (cancelled) return;
        if (rows[0]?.name) {
          setDisplayName(rows[0].name);
          setHint("From your access request — change it if you'd like.");
        }
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setPrefilling(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  // Focus the first input/button when the step changes.
  useEffect(() => {
    const id = setTimeout(() => {
      if (step === "profile") profileInputRef.current?.focus();
      if (step === "review") reviewBtnRef.current?.focus();
    }, 250);
    return () => clearTimeout(id);
  }, [step]);

  // Validation
  const trimmedName = displayName.trim();
  const nameError = useMemo(() => {
    if (!trimmedName) return "Required.";
    if (trimmedName.length < NAME_MIN) return `At least ${NAME_MIN} characters.`;
    if (trimmedName.length > NAME_MAX) return `At most ${NAME_MAX} characters.`;
    return null;
  }, [trimmedName]);
  const nameValid = !nameError;
  const firstName = useMemo(() => trimmedName.split(/\s+/)[0] || "there", [trimmedName]);

  // Bouncers — only after the profile lookup finishes, so we don't flash the
  // page for already-onboarded users. Skip "already onboarded" bouncer when we
  // just completed (we've already initiated navigate to the destination).
  if (profileChecked && onboardedAt && !completingRef.current) return <Navigate to="/" replace />;
  if (profileChecked && !user) return <Navigate to="/sign-in" replace />;

  const goNext = () => {
    setDirection(1);
    if (step === "profile") setStep("preferences");
    else if (step === "preferences") setStep("review");
  };
  const goBack = () => {
    setDirection(-1);
    if (step === "preferences") setStep("profile");
    else if (step === "review") setStep("preferences");
  };

  const handleProfileSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nameValid) return;
    goNext();
  };

  const completeOnboarding = async () => {
    if (!user) return;
    setPending(true);
    setSaveError(null);
    const onboardedIso = new Date().toISOString();
    if (isDemo) {
      updateDemoProfile({
        display_name: trimmedName,
        notification_prefs: notifPrefs,
        onboarded_at: onboardedIso,
      });
    } else {
      if (!supabase) {
        setPending(false);
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: trimmedName,
          notification_prefs: notifPrefs,
          onboarded_at: onboardedIso,
        })
        .eq("id", user.id);
      if (error) {
        setPending(false);
        console.error("[welcome] save failed", error);
        setSaveError(friendlyDbError(error, "Couldn't save. Please try again."));
        return;
      }
    }
    setPending(false);
    addToast({ title: `Welcome, ${firstName}!`, description: "You're all set.", status: "ok" });
    completingRef.current = true;
    setOnboardedLocal(onboardedIso);
    refreshProfile();
    navigate(nextDestinationRef.current, { replace: true });
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex flex-col p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-xl mx-auto flex-1 flex flex-col justify-center py-8">
        <header className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-accent-brand-dim border border-accent-brand/20 flex items-center justify-center">
            <Sprout className="w-5 h-5 text-accent-brand" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-none">CEOS</h1>
            <p className="text-xs text-text-tertiary mt-1">Canyon Exotics operations</p>
          </div>
        </header>

        {/* Step indicator */}
        <nav aria-label="Onboarding progress" className="mb-6">
          <ol className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const completed = i < stepIndex;
              const active = i === stepIndex;
              return (
                <li key={s.id} className="flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "shrink-0 w-6 h-6 rounded-full text-xs font-medium flex items-center justify-center border transition-colors",
                        completed && "bg-accent-brand border-accent-brand text-bg-base",
                        active && "border-accent-brand text-accent-brand",
                        !completed && !active && "border-border-strong text-text-tertiary",
                      )}
                    >
                      {completed ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        "text-xs hidden sm:block transition-colors",
                        active ? "text-text-primary font-medium" : completed ? "text-text-secondary" : "text-text-tertiary",
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {/* Progress bar (mobile-friendly fallback) */}
          <div className="mt-3 h-0.5 bg-bg-active rounded overflow-hidden sm:hidden">
            <div
              className="h-full bg-accent-brand transition-all duration-300"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </nav>

        <Card className="bg-bg-elevated border border-border-subtle p-6 sm:p-8 overflow-hidden">
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: { type: "spring", stiffness: 260, damping: 28 }, opacity: { duration: 0.18 } }}
            >
              {step === "profile" && (
                <form onSubmit={handleProfileSubmit} className="space-y-5" aria-labelledby="profile-heading">
                  <div>
                    <h2 id="profile-heading" className="text-2xl font-semibold mb-2">Welcome to CEOS</h2>
                    <p className="text-sm text-text-secondary">
                      You've been approved. Three quick steps and you're in — about a minute.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="display-name" className="text-xs uppercase tracking-wide text-text-secondary">
                        Your name
                      </label>
                      <span className="text-[10px] text-text-tertiary tabular-nums">
                        {trimmedName.length}/{NAME_MAX}
                      </span>
                    </div>
                    <Input
                      ref={profileInputRef}
                      id="display-name"
                      required
                      autoFocus
                      maxLength={NAME_MAX + 5}
                      placeholder={prefilling ? "Loading…" : "e.g. Atisa"}
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        setHint(null);
                      }}
                      aria-invalid={!!nameError}
                      aria-describedby={nameError ? "name-error" : hint ? "name-hint" : undefined}
                      className={cn("w-full text-base", nameError && trimmedName.length > 0 && "border-status-alert/50")}
                    />
                    {nameError && trimmedName.length > 0 && (
                      <p id="name-error" className="text-xs text-status-alert flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {nameError}
                      </p>
                    )}
                    {!nameError && hint && (
                      <p id="name-hint" className="text-xs text-text-tertiary">{hint}</p>
                    )}
                    <p className="text-xs text-text-tertiary">Shown in your sidebar avatar and audit trail.</p>
                  </div>
                  <div className="pt-2">
                    <Button type="submit" variant="brand" className="w-full" disabled={!nameValid}>
                      Continue <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              )}

              {step === "preferences" && (
                <div className="space-y-5" aria-labelledby="prefs-heading">
                  <div>
                    <h2 id="prefs-heading" className="text-2xl font-semibold mb-2">Stay in the loop, {firstName}</h2>
                    <p className="text-sm text-text-secondary">
                      Pick which alerts you want. You can change them anytime in Settings.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {[
                      { key: "low_stock" as const, label: "Low stock", desc: "Plants or supplies below reorder threshold" },
                      { key: "license_expiring" as const, label: "License expiring", desc: "60 days before a permit expires" },
                      { key: "new_order" as const, label: "New order", desc: "When a Shopify or Etsy order arrives" },
                    ].map((n) => (
                      <label
                        key={n.key}
                        className="flex items-center justify-between gap-4 p-3 rounded-md bg-bg-active border border-border-subtle cursor-pointer hover:border-border-strong transition-colors"
                      >
                        <div>
                          <div className="text-sm font-medium">{n.label}</div>
                          <div className="text-xs text-text-secondary mt-0.5">{n.desc}</div>
                        </div>
                        <Toggle
                          ariaLabel={n.label}
                          checked={!!notifPrefs[n.key]}
                          onChange={(checked) => setNotifPrefs((p) => ({ ...p, [n.key]: checked }))}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-text-tertiary italic">
                    Delivery wiring is in progress. Preferences save now and activate automatically when triggers ship.
                  </p>
                  <div className="flex gap-2 pt-2">
                    <Button variant="ghost" onClick={goBack} className="flex-1">
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <Button variant="brand" onClick={goNext} className="flex-1">
                      Continue <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === "review" && (
                <div className="space-y-5" aria-labelledby="review-heading">
                  <div>
                    <h2 id="review-heading" className="text-2xl font-semibold mb-2">You're set, {firstName}</h2>
                    <p className="text-sm text-text-secondary">
                      Pick a starting point — we'll drop you there after setup. You can also just hit "Get started" to land on the dashboard.
                    </p>
                  </div>

                  <ul className="space-y-2" role="radiogroup" aria-label="Where to start">
                    <DestinationOption
                      Icon={Flower2}
                      title="Cultivars"
                      desc="The master plant registry. Add cultivars first — Inventory and Listings link here."
                      href="/cultivars"
                      selected={nextDestination === "/cultivars"}
                      onSelect={setNextDestination}
                    />
                    <DestinationOption
                      Icon={PackageSearch}
                      title="Inventory"
                      desc="Track stock by life stage. Add plants, edit quantities, upload photos."
                      href="/inventory"
                      selected={nextDestination === "/inventory"}
                      onSelect={setNextDestination}
                    />
                    <DestinationOption
                      Icon={ShoppingCart}
                      title="Orders"
                      desc="Multi-channel sales with line items and a status workflow."
                      href="/orders"
                      selected={nextDestination === "/orders"}
                      onSelect={setNextDestination}
                    />
                    {isAdmin && (
                      <DestinationOption
                        Icon={ShieldCheck}
                        title="Access Requests"
                        desc="Review and approve people who request access. Admin-only."
                        href="/admin/access-requests"
                        selected={nextDestination === "/admin/access-requests"}
                        onSelect={setNextDestination}
                      />
                    )}
                    <DestinationOption
                      title="Take me to the dashboard"
                      desc="Skip and start from the overview."
                      href="/"
                      selected={nextDestination === "/"}
                      onSelect={setNextDestination}
                      muted
                    />
                  </ul>

                  {saveError && (
                    <div role="alert" className="p-3 rounded-md bg-status-alert/10 border border-status-alert/30 text-xs text-status-alert flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{saveError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="ghost" onClick={goBack} className="flex-1" disabled={pending}>
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <Button
                      ref={reviewBtnRef}
                      variant="brand"
                      onClick={completeOnboarding}
                      disabled={pending || !nameValid}
                      className="flex-1"
                    >
                      {pending ? "Saving…" : "Get started"}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>

        <p className="text-xs text-text-tertiary text-center mt-6">
          Need to change anything later? Settings → Account.
        </p>
      </div>
    </div>
  );
}

function DestinationOption({
  Icon,
  title,
  desc,
  href,
  selected,
  onSelect,
  muted,
}: {
  Icon?: React.ElementType;
  title: string;
  desc: string;
  href: string;
  selected: boolean;
  onSelect: (href: string) => void;
  muted?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => onSelect(href)}
        className={cn(
          "w-full flex items-start gap-3 p-3 rounded-md border text-left transition-colors",
          selected
            ? "border-accent-brand bg-accent-brand-dim/40 ring-1 ring-accent-brand/30"
            : "border-border-subtle hover:border-border-strong hover:bg-bg-active",
          muted && "opacity-80",
        )}
      >
        {Icon && (
          <div
            className={cn(
              "shrink-0 w-9 h-9 rounded-md flex items-center justify-center",
              selected ? "bg-accent-brand-dim text-accent-brand" : "bg-bg-active text-text-secondary border border-border-subtle",
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-text-secondary mt-0.5 leading-snug">{desc}</div>
        </div>
        <div
          aria-hidden
          className={cn(
            "shrink-0 w-4 h-4 rounded-full border mt-1 transition-colors",
            selected ? "border-accent-brand bg-accent-brand" : "border-border-strong",
          )}
        />
      </button>
    </li>
  );
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -24 : 24, opacity: 0 }),
};
