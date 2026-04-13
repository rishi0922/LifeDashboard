"use client";

import { useState } from "react";
import { GamificationBar } from "./components/GamificationBar";
import { DashboardGrid } from "./components/DashboardGrid";
import { AIChatAssistant } from "./components/AIChatAssistant";
import { DashboardHeader } from "./components/DashboardHeader";
import { FinanceGrid } from "./components/FinanceGrid";
import { InboxScout } from "./components/InboxScout";
import { IPLScoreTicker } from "./components/IPLScoreTicker";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState(0); // 0: Command Center, 1: Finance
  const totalTabs = 2;

  const nextTab = () => setActiveTab((prev) => (prev + 1) % totalTabs);
  const prevTab = () => setActiveTab((prev) => (prev - 1 + totalTabs) % totalTabs);

  const tabTitles = ["Chief Command", "Finance Intelligence"];

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-primary)', paddingBottom: '5rem' }}>
      <GamificationBar />
      <IPLScoreTicker />
      
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0 3rem' }}>
        {/* Persistent Global Header */}
        <div style={{ marginBottom: '0.75rem' }}>
          <DashboardHeader />
          <InboxScout />
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
