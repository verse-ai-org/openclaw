import { useState, useEffect } from "react";
import { findAuthMethod, findProviderGroupForMethod } from "@/store/provider-catalog.store";
import { useWizardStore } from "@/store/setup-wizard.store";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OAuthContent } from "./OAuthContent";
import { ApiKeyContent } from "./ApiKeyContent";
import { PROVIDER_EMOJI } from "./constants";

export interface ApiKeyStepProps {
  onNext: () => void;
  onBack: () => void;
  onCanProceedChange?: (canProceed: boolean) => void;
}

export function ApiKeyStep({ onNext, onBack, onCanProceedChange }: ApiKeyStepProps) {
  const { wizardState, updateWizardState } = useWizardStore();
  const { authMethod: authMethodId, authProviderGroup } = wizardState;

  const methodDef = findAuthMethod(authMethodId);
  const groupDef = findProviderGroupForMethod(authMethodId);
  const isOAuth = methodDef?.type === "oauth";

  const providerLabel = groupDef?.label ?? authProviderGroup;
  const providerEmoji = PROVIDER_EMOJI[groupDef?.id ?? ""] ?? "🤖";

  const oauthMethod = groupDef?.methods.find((m) => m.type === "oauth");
  const apiKeyMethod = groupDef?.methods.find((m) => m.type === "api-key");
  const hasBothTabs = !!(oauthMethod && apiKeyMethod);

  const activeTab: "oauth" | "apikey" = isOAuth ? "oauth" : "apikey";

  const [oauthDone, setOauthDone] = useState(false);
  const [apikeyDone, setApikeyDone] = useState(false);

  const canProceed = isOAuth ? oauthDone : apikeyDone;

  useEffect(() => {
    onCanProceedChange?.(canProceed);
  }, [canProceed, onCanProceedChange]);

  const handleTabChange = (tab: string) => {
    if (tab === "oauth" && oauthMethod) {
      updateWizardState({ authMethod: oauthMethod.id });
    } else if (tab === "apikey" && apiKeyMethod) {
      updateWizardState({ authMethod: apiKeyMethod.id });
    }
  };

  return (
    <Dialog open modal>
      <DialogPortal>
        <DialogOverlay />
        <div
          className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-64px)] max-w-[672px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)] outline-none"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 px-10 pb-6 pt-10">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 text-[30px] font-extrabold leading-[1.2] tracking-[-0.75px] text-[#1a1c1d]">
                Authenticate Provider
              </h2>
              <p className="m-0 text-base font-medium leading-[1.4] text-zinc-500">
                Connect your account to start building.
              </p>
            </div>
            <button
              onClick={onBack}
              className="mt-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-zinc-100"
              aria-label="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1l8 8M9 1L1 9" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="shrink-0 border-y border-[#f0f0f0] bg-[rgba(250,250,250,0.5)] px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white text-[28px] shadow-[0_1px_4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.06)]">
                {providerEmoji}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-lg font-bold tracking-[-0.3px] text-[#1a1c1d]">{providerLabel}</span>
                <span className="flex items-center gap-[5px] text-[13px] text-zinc-500">
                  <span className="inline-block size-[7px] rounded-full bg-green-500" />
                  Systems Operational
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-10 pb-10 pt-8">
            {hasBothTabs ? (
              <Tabs
                value={activeTab}
                onValueChange={handleTabChange}
                className="flex flex-col gap-6"
              >
                <TabsList className="w-full h-12! rounded-full bg-zinc-100 p-1">
                  <TabsTrigger
                    value="oauth"
                    className={[
                      "flex-1 rounded-full border-0 text-sm font-semibold outline-none transition-[background,color] duration-150",
                      activeTab === "oauth"
                        ? "bg-white text-[#1a1c1d] shadow-[0_1px_3px_rgba(0,0,0,0.10)]"
                        : "bg-transparent text-zinc-500",
                    ].join(" ")}
                  >
                    OAuth
                  </TabsTrigger>
                  <TabsTrigger
                    value="apikey"
                    className={[
                      "flex-1 rounded-full border-0 text-sm font-semibold outline-none transition-[background,color] duration-150",
                      activeTab === "apikey"
                        ? "bg-white text-[#1a1c1d] shadow-[0_1px_3px_rgba(0,0,0,0.10)]"
                        : "bg-transparent text-zinc-500",
                    ].join(" ")}
                  >
                    API Key
                  </TabsTrigger>
                </TabsList>

                <div className="grid [grid-template-areas:'stack']">
                  <TabsContent
                    value="oauth"
                    forceMount
                    className={[
                      "[grid-area:stack] transition-opacity duration-150",
                      activeTab === "oauth" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
                    ].join(" ")}
                  >
                    {oauthMethod && (
                      <OAuthContent
                        methodId={oauthMethod.id}
                        methodLabel={oauthMethod.label}
                        hint={oauthMethod.hint}
                        onComplete={(token, refresh, expires) => {
                          updateWizardState({ apiKey: token, oauthRefresh: refresh, oauthExpires: expires });
                          setOauthDone(true);
                        }}
                      />
                    )}
                  </TabsContent>

                  <TabsContent
                    value="apikey"
                    forceMount
                    className={[
                      "[grid-area:stack] transition-opacity duration-150",
                      activeTab === "apikey" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
                    ].join(" ")}
                  >
                    {apiKeyMethod && (
                      <ApiKeyContent
                        methodId={apiKeyMethod.id}
                        onNext={onNext}
                        onCanProceedChange={(can) => setApikeyDone(can)}
                      />
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            ) : (
              <div className="mt-2">
                {isOAuth ? (
                  <OAuthContent
                    methodId={authMethodId}
                    methodLabel={methodDef?.label ?? authMethodId}
                    hint={methodDef?.hint}
                    onComplete={(token, refresh, expires) => {
                      updateWizardState({ apiKey: token, oauthRefresh: refresh, oauthExpires: expires });
                      setOauthDone(true);
                    }}
                  />
                ) : (
                  <ApiKeyContent
                    methodId={authMethodId}
                    onNext={onNext}
                    onCanProceedChange={(can) => setApikeyDone(can)}
                  />
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center rounded-b-full justify-between border-t border-[#f0f0f0] bg-[rgba(250,250,250,0.5)] px-8 py-6">
            <button
              onClick={onBack}
              className="cursor-pointer border-0 bg-transparent px-2 text-sm font-bold leading-[1.4] text-zinc-500"
            >
              Back to List
            </button>

            <button
              onClick={canProceed ? onNext : undefined}
              disabled={!canProceed}
              className={[
                "h-11 rounded-full border-0 px-8 text-sm font-bold transition-[background,color] duration-200",
                canProceed
                  ? "cursor-pointer bg-[linear-gradient(180deg,#ba0034_0%,#de294a_100%)] text-white shadow-[0_4px_16px_rgba(186,0,52,0.25)]"
                  : "cursor-not-allowed bg-zinc-200 text-zinc-400",
              ].join(" ")}
            >
              Continue
            </button>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
