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

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysis,
  loading,
  error,
  onRegenerate,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('barista');

  if (loading) {
    return (
      <div style={{ marginTop: 20, padding: 20, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ marginTop: 20, padding: 20, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <div style={{ color: '#dc2626', padding: 10, background: '#fee2e2', borderRadius: 4 }}>
          <p>Analysis failed: {error}</p>
          {onRegenerate && (
            <button onClick={onRegenerate} style={{ marginTop: 10, padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const currentTab = analysis[activeTab];

  return (
    <div style={{ marginTop: 20, padding: 20, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #e5e7eb', marginBottom: 15 }}>
        {TABS.map(({ type, label, emoji }) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            style={{
              padding: '10px 15px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === type ? '3px solid #6366f1' : '3px solid transparent',
              color: activeTab === type ? '#333' : '#999',
              fontWeight: activeTab === type ? 'bold' : 'normal',
              transition: 'all 0.2s',
            }}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      <div style={{ minHeight: 100 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {currentTab.map((item, idx) => (
            <li
              key={idx}
              style={{
                padding: '8px 0',
                lineHeight: 1.5,
                borderBottom: idx < currentTab.length - 1 ? '1px solid #f0f0f0' : 'none',
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      </div>

      {onRegenerate && (
        <button
          onClick={onRegenerate}
          style={{
            marginTop: 10,
            padding: '6px 12px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.9em',
          }}
        >
          Regenerate
        </button>
      )}
    </div>
  );
};
