import React, { useState } from 'react';

export interface Analysis {
  barista: string[];
  roaster: string[];
  analyst: string[];
}

interface AnalysisPanelProps {
  analysis: Analysis | null;
  loading: boolean;
  error: string | null;
  onRegenerate?: () => void;
}

type TabType = 'barista' | 'roaster' | 'analyst';

const TABS: { type: TabType; label: string; emoji: string }[] = [
  { type: 'barista', label: 'Barista', emoji: '☕' },
  { type: 'roaster', label: 'Röster', emoji: '🔥' },
  { type: 'analyst', label: 'Analyst', emoji: '📊' },
];

const card: React.CSSProperties = {
  marginTop: 16,
  padding: 20,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
};

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysis,
  loading,
  error,
  onRegenerate,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('barista');

  if (loading) {
    return (
      <div style={card}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Analysiere…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={card}>
        <div style={{ color: 'var(--error, #e05252)', fontSize: 13, marginBottom: onRegenerate ? 8 : 0 }}>
          Fehler: {error}
        </div>
        {onRegenerate && (
          <button onClick={onRegenerate} className="btn btn-secondary" style={{ fontSize: 12 }}>
            Erneut versuchen
          </button>
        )}
      </div>
    );
  }

  if (!analysis) return null;

  const currentTab = analysis[activeTab];

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        {TABS.map(({ type, label, emoji }) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === type ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === type ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: activeTab === type ? 600 : 400,
              fontSize: 13,
            }}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {currentTab.map((item, idx) => (
          <li
            key={idx}
            style={{
              padding: '7px 0',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--text)',
              borderBottom: idx < currentTab.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            {item}
          </li>
        ))}
      </ul>

      {onRegenerate && (
        <button onClick={onRegenerate} className="btn btn-secondary" style={{ marginTop: 12, fontSize: 12 }}>
          Regenerieren
        </button>
      )}
    </div>
  );
};
