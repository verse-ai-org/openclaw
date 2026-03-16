import { Search, User } from "lucide-react";

interface HeaderProps {
  currentStep?: number;
  totalSteps?: number;
}

export function Header(_props: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-primary/10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-6 py-4 lg:px-40">
      {/* Logo Section */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
          <span className="text-2xl">🦞</span>
        </div>
        <h2 className="text-xl font-bold tracking-tight">Intelligence</h2>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        <button className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
          <Search className="h-5 w-5" />
        </button>
        <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-primary/20">
          <div className="h-full w-full flex items-center justify-center bg-primary/10">
            <User className="h-6 w-6 text-primary" />
          </div>
        </div>
      </div>
    </header>
  );
}
