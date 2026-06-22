"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { GamificationBar } from "./components/GamificationBar";
import { DashboardGrid } from "./components/DashboardGrid";
import { AIChatAssistant } from "./components/AIChatAssistant";
import { DashboardHeader } from "./components/DashboardHeader";
import { FinanceGrid } from "./components/FinanceGrid";
import { InboxScout } from "./components/InboxScout";
import { BudgetGuardian } from "./components/BudgetGuardian";
import { LandingPage } from "./components/LandingPage";

export default function DashboardPage() {
  const { status } = useSession();
  const [activeTab, setActiveTab] = useState(0); // 0: Command Center, 1: Finance
  const totalTabs = 2;

  const nextTab = () => setActiveTab((prev) => (prev + 1) % totalTabs);
  const prevTab = () => setActiveTab((prev) => (prev - 1 + totalTabs) % totalTabs);

  const tabTitles = ["Chief Command", "Finance Intelligence"];

  // Signed-out visitors get the marketing landing page; signed-in users
  // get the dashboard. During the brief auth check we show a minimal
  // loader so an authenticated user doesn't see a flash of the landing.
  if (status === "loading") {
    return (
      <main className="min-h-screen" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
        <div className="animate-pulse" style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--text-secondary)", fontWeight: 700 }}>
          <span style={{ fontSize: "1.4rem" }}>✦</span> Command Center
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return <LandingPage />;
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-primary)', paddingBottom: '5rem' }}>
      <GamificationBar />
      
      <div className="page-container">
        {/* Persistent Global Header */}
        <div style={{ marginBottom: '0.75rem' }}>
          <DashboardHeader />
          <InboxScout />
          <BudgetGuardian />
        </div>

        {/* Tab Switcher (Compacted) */}
        <div className="animate-fade-in" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.25rem',
          padding: '0.4rem 1.5rem',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <button onClick={prevTab} className="btn-icon" style={{ fontSize: '1.25rem', fontWeight: 900, background: 'transparent' }}>‹</button>
          
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {tabTitles[activeTab]}
          </span>

          <button onClick={nextTab} className="btn-icon" style={{ fontSize: '1.25rem', fontWeight: 900, background: 'transparent' }}>›</button>
        </div>

        {/* Dynamic Content */}
        <div key={activeTab} className="animate-slide-in">
          {activeTab === 0 ? <DashboardGrid /> : <FinanceGrid />}
        </div>
      </div>
      
      <AIChatAssistant />
    </main>
  );
}
