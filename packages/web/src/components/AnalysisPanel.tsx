import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Analysis } from '../types.js';

interface AnalysisPanelProps {
  analysis: Analysis | null;
  loading: boolean;
  error: string | null;
  onRegenerate?: () => void;
}

type TabType = 'barista' | 'roaster' | 'analyst';

function formatCostUsd(amount: number): string {
  const decimals = amount < 0.001 ? 6 : 4
  const parts = amount.toFixed(decimals).split('.')
  const dec = parts[1].replace(/0+$/, '')
  const finalDec = dec.length < 2 ? dec.padEnd(2, '0') : dec
  return `$${parts[0]}.${finalDec}`
}

const TABS: { type: TabType; label: string; emoji: string }[] = [
  { type: 'barista', label: 'Barista', emoji: '☕' },
  { type: 'roaster', label: 'Röster', emoji: '🔥' },
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
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('barista');

  if (loading) {
    return (
      <div style={card}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('detail.aiAnalyzing')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={card}>
        <div style={{ color: 'var(--error, #e05252)', fontSize: 13, marginBottom: onRegenerate ? 8 : 0 }}>
          {t('detail.aiError')}{error}
        </div>
        {onRegenerate && (
          <button onClick={onRegenerate} className="btn btn-secondary" style={{ fontSize: 12 }}>
            {t('detail.aiRetry')}
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

      <div style={{ marginTop: 12 }}>
        {analysis.createdAt && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            {new Date(analysis.createdAt).toLocaleString()}
            {analysis.aiModel && (
              <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>{analysis.aiModel}</>
            )}
            {analysis.tokenInputCount !== undefined && analysis.tokenOutputCount !== undefined && (
              <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>↑ {analysis.tokenInputCount.toLocaleString()} / ↓ {analysis.tokenOutputCount.toLocaleString()} Tokens</>
            )}
            {analysis.costInputUsd != null && analysis.costOutputUsd != null && (
              <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>↑ {formatCostUsd(analysis.costInputUsd)} / ↓ {formatCostUsd(analysis.costOutputUsd)} = {formatCostUsd(analysis.costInputUsd + analysis.costOutputUsd)}</>
            )}
            {analysis.analysisMode === 'optimized' && (
              <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span><span style={{ background: 'var(--accent)', color: '#fff', fontSize: 9, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.5, textTransform: 'uppercase', verticalAlign: 'middle' }}>Optimiert</span></>
            )}
          </div>
        )}
        {onRegenerate && (
          <button onClick={onRegenerate} className="btn btn-secondary" style={{ fontSize: 12 }}>
            {t('detail.aiRegenerate')}
          </button>
        )}
      </div>
    </div>
  );
};
