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

/** Safety net: render analysis items whether they arrived as strings or objects. */
function renderItem(item: unknown): string {
  if (typeof item === 'string') return item
  if (item !== null && typeof item === 'object') {
    return Object.values(item as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string')
      .join(' — ')
  }
  return String(item)
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}


function formatCostUsd(amount: number): string {
  const decimals = amount < 0.001 ? 6 : 4
  const parts = amount.toFixed(decimals).split('.')
  const dec = parts[1].replace(/0+$/, '')
  const finalDec = dec.length < 2 ? dec.padEnd(2, '0') : dec
  return `$${parts[0]}.${finalDec}`
}


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
  const windowLabels: Record<string, string> = {
    '7d': t('settings.aiWindow7d'),
    '30d': t('settings.aiWindow30d').replace(/\s*\(.*\)$/, ''),
    '90d': t('settings.aiWindow90d'),
    'all': t('settings.aiWindowAll'),
  }
  const TABS: { type: TabType; label: string; emoji: string }[] = [
    { type: 'barista', label: 'Barista', emoji: '☕' },
    { type: 'roaster', label: t('shots.beanBrand'), emoji: '🔥' },
  ];
  const [activeTab, setActiveTab] = useState<TabType>('barista');
  const [detailsOpen, setDetailsOpen] = useState(false);

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
            {renderItem(item)}
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 12 }}>
        {/* Row 1: always visible — timestamp + context summary + toggle */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {analysis.createdAt && new Date(analysis.createdAt).toLocaleString()}
            {analysis.contextSummary != null && (
              analysis.contextSummary.shotCount < 2
                ? <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>{'📊 '}{t('detail.aiNoContext')}</>
                : <>
                    <span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>
                    {'📊 '}
                    {analysis.contextSummary.shotCount} Shots ({windowLabels[analysis.contextSummary.window] ?? analysis.contextSummary.window}
                    {analysis.contextSummary.tier === 'profile+bean' && t('detail.aiContextTierProfileBean')}
                    {analysis.contextSummary.tier === 'profile' && t('detail.aiContextTierProfile')}
                    {')'}
                    {analysis.contextSummary.pressureAvg != null && (
                      <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>{t('detail.aiContextPressure')} {analysis.contextSummary.pressureAvg} bar</>
                    )}
                    {analysis.contextSummary.flowAvg != null && (
                      <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>{t('detail.aiContextFlow')} {analysis.contextSummary.flowAvg} ml/s</>
                    )}
                    {analysis.contextSummary.tempAvg != null && (
                      <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>{t('detail.aiContextTemp')} {analysis.contextSummary.tempAvg} °C</>
                    )}
                  </>
            )}
          </div>
          <button
            onClick={() => setDetailsOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11, padding: '0 0 0 8px', lineHeight: 1 }}
            title={detailsOpen ? t('detail.aiDetailsHide') : t('detail.aiDetailsShow')}
          >
            {detailsOpen ? '▾' : '▸'}
          </button>
        </div>

        {/* Rows 2+3: collapsible details */}
        {detailsOpen && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {/* Row 2: timing */}
            {(analysis.preprocessDurationMs != null || analysis.aiDurationMs != null) && (
              <div style={{ marginBottom: 3 }}>
                {analysis.preprocessDurationMs != null && (
                  <>{'⏱ '}{t('detail.aiTimingPreprocess')} {formatDuration(analysis.preprocessDurationMs)}</>
                )}
                {analysis.preprocessDurationMs != null && analysis.aiDurationMs != null && (
                  <span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>
                )}
                {analysis.aiDurationMs != null && (
                  <>{t('detail.aiTimingApi')} {formatDuration(analysis.aiDurationMs)}</>
                )}
                {analysis.preprocessDurationMs != null && analysis.aiDurationMs != null && (
                  <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>{t('detail.aiTimingTotal')} {formatDuration(analysis.preprocessDurationMs + analysis.aiDurationMs)}</>
                )}
              </div>
            )}

            {/* Row 3: model, tokens, costs, mode badge */}
            <div>
              {analysis.aiModel && <>{analysis.aiModel}</>}
              {analysis.tokenInputCount !== undefined && analysis.tokenOutputCount !== undefined && (
                <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>↑ {analysis.tokenInputCount.toLocaleString()} / ↓ {analysis.tokenOutputCount.toLocaleString()} Tokens</>
              )}
              {analysis.costInputUsd != null && analysis.costOutputUsd != null && (
                <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span>↑ {formatCostUsd(analysis.costInputUsd)} / ↓ {formatCostUsd(analysis.costOutputUsd)} = {formatCostUsd(analysis.costInputUsd + analysis.costOutputUsd)}</>
              )}
              {analysis.analysisMode === 'optimized' && (
                <><span style={{ margin: '0 5px', opacity: 0.5 }}>•</span><span style={{ background: 'var(--accent)', color: '#fff', fontSize: 9, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.5, textTransform: 'uppercase', verticalAlign: 'middle' }}>{t('detail.aiModeOptimizedBadge')}</span></>
              )}
            </div>
          </div>
        )}

        {/* Regenerate button */}
        {onRegenerate && (
          <button onClick={onRegenerate} className="btn btn-secondary" style={{ fontSize: 12, marginTop: 8 }}>
            {t('detail.aiRegenerate')}
          </button>
        )}
      </div>
    </div>
  );
};
