import { Check } from "lucide-react";
import { useState } from "react";
import { DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { AuthProviderGroupDef } from "@/data/auth-choice-groups";
import { useProviderGroups } from "@/store/provider-catalog.store";
import { PROVIDER_EMOJI } from "./provider-constants";

interface AllProvidersDialogProps {
  selectedGroupId: string;
  onSelect: (g: AuthProviderGroupDef) => void;
  onClose: () => void;
}

/** Section header row — label + divider line */
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="text-[10px] font-extrabold uppercase shrink-0 tracking-[0.06em] text-[rgba(186,0,52,1)]">
        {label}
      </span>
      <div className="flex-1 h-px bg-[#E8E8EA]" />
    </div>
  );
}

/** All-providers dialog content — styled per Figma "Explore Providers" modal */
export function AllProvidersDialog({ selectedGroupId, onSelect, onClose }: AllProvidersDialogProps) {
  const [search, setSearch] = useState("");
  const allGroups = useProviderGroups();
  const featured = allGroups.slice(0, 4);
  const allFiltered = allGroups.filter(
    (g) =>
      g.label.toLowerCase().includes(search.toLowerCase()) ||
      g.hint?.toLowerCase().includes(search.toLowerCase()),
  );
  const isSearching = search.length > 0;

  return (
    <>
      {/* ── Modal Header — white bg, title + custom close btn ── */}
      <div className="shrink-0 flex items-start justify-between bg-white px-10 pt-10 pb-6">
        <div>
          <DialogTitle className="text-[30px] font-extrabold tracking-[-0.75px] text-[rgba(26,28,29,1)] mb-1">
            Explore Providers
          </DialogTitle>
          <p className="text-base font-medium text-zinc-500">
            Discover and connect 20+ leading AI platforms.
          </p>
        </div>

        {/* Custom close button — matches Figma node 161:300 */}
        <button
          onClick={onClose}
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#F3F3F5] ml-4 transition-opacity hover:opacity-70"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M1 1l9 9M10 1l-9 9"
              stroke="rgba(26,28,29,1)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* ── Search Area ── */}
      <div className="shrink-0 bg-white px-10 py-6">
        <div className="flex items-center gap-3 bg-[#F3F3F5] rounded-full px-6 h-12">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <circle cx="7" cy="7" r="5.5" stroke="rgba(113,113,122,1)" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="rgba(113,113,122,1)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search providers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[15px] text-[rgba(26,28,29,1)] placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto px-10 bg-white">
        {isSearching ? (
          // Flat search results list
          <div className="space-y-2 pb-4">
            {allFiltered.map((group) => {
              const isSelected = selectedGroupId === group.id;
              return (
                <button
                  key={group.id}
                  onClick={() => { onSelect(group); onClose(); }}
                  className={[
                    "w-full flex items-center gap-4 text-left rounded-[20px] px-5 py-3.5 border-[1.5px] transition-all hover:opacity-80",
                    isSelected
                      ? "bg-[rgba(186,0,52,0.08)] border-[rgba(186,0,52,0.4)]"
                      : "bg-[#F3F3F5] border-transparent",
                  ].join(" ")}
                >
                  <div className="shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center bg-white text-xl">
                    {PROVIDER_EMOJI[group.id] ?? "🤖"}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[rgba(26,28,29,1)]">{group.label}</div>
                    {group.hint && (
                      <div className="text-xs text-zinc-500">{group.hint}</div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-[rgba(186,0,52,1)]">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          // Categorised layout
          <>
            {/* Featured Partners section */}
            <div className="mb-8">
              <SectionHeader label="Featured Partners" />
              <div className="grid grid-cols-4 gap-4">
                {featured.map((group) => {
                  const isSelected = selectedGroupId === group.id;
                  return (
                    <button
                      key={group.id}
                      onClick={() => { onSelect(group); onClose(); }}
                      className={[
                        "flex flex-col items-center justify-center text-center h-[120px] rounded-[32px] border-[1.5px] transition-all hover:opacity-80",
                        isSelected
                          ? "bg-[rgba(186,0,52,0.1)] border-[rgba(186,0,52,0.4)]"
                          : "bg-[#F3F3F5] border-transparent",
                      ].join(" ")}
                    >
                      <div className="w-12 h-12 rounded-[12px] flex items-center justify-center bg-white text-[26px] mb-2">
                        {PROVIDER_EMOJI[group.id] ?? "🤖"}
                      </div>
                      <span className="text-[13px] font-semibold text-[rgba(26,28,29,1)]">
                        {group.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* All Providers section */}
            <div className="mb-6">
              <SectionHeader label="All Providers" />
              <div className="grid grid-cols-3 gap-3">
                {allGroups.map((group) => {
                  const isSelected = selectedGroupId === group.id;
                  return (
                    <button
                      key={group.id}
                      onClick={() => { onSelect(group); onClose(); }}
                      className={[
                        "flex items-center gap-3 text-left rounded-[20px] px-4 py-3.5 border-[1.5px] transition-all hover:opacity-80",
                        isSelected
                          ? "bg-[rgba(186,0,52,0.08)] border-[rgba(186,0,52,0.4)]"
                          : "bg-[rgba(243,243,245,0.5)] border-transparent",
                      ].join(" ")}
                    >
                      <div className="shrink-0 w-[34px] h-[34px] rounded-[10px] flex items-center justify-center bg-white text-lg">
                        {PROVIDER_EMOJI[group.id] ?? "🤖"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate text-[rgba(26,28,29,1)]">
                          {group.label}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="shrink-0 w-3.5 h-3.5 text-[rgba(186,0,52,1)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modal Footer ── */}
      <DialogFooter className="shrink-0 flex items-center justify-between px-8 py-5 bg-[rgba(243,243,245,0.3)] border-t border-[rgba(232,232,234,1)]">
        <p className="text-xs font-medium text-zinc-500">
          Can't find your provider? Request an integration
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-sm font-bold text-zinc-500 px-6 py-3 transition-opacity hover:opacity-70"
          >
            Dismiss
          </button>
          <button
            onClick={onClose}
            className="text-sm font-bold text-white px-7 py-3 rounded-full bg-gradient-to-b from-[rgba(186,0,52,1)] to-[rgba(222,41,74,1)] transition-opacity hover:opacity-90"
          >
            Select Current
          </button>
        </div>
      </DialogFooter>
    </>
  );
}
