// Invented settings for the demo — never real values.
import type { AppSettings } from '../../src/types.js'

export function DEMO_SETTINGS(lang: 'en' | 'de'): AppSettings {
  return {
    language: lang,
    theme: 'dark',
    username: 'demo',
    de1Url: 'http://decent.local:8888',
    tooltipOpacity: 0.72,
    showAvgRatio: true,
    de1LastImportDate: null,
    statsTopN: 10,
    statsShowPrevValue: true,
    de1DefaultBeverage: '',
    apiKeyClaudeKey: 'sk-ant-••••••••',
    apiKeyOpenaiKey: '',
    aiModel: 'claude-sonnet-4-6',
    aiCustomContext: '',
    aiAnalysisMode: 'standard',
    aiContextWindow: '30d',
    aiContextTier1Min: 10,
    aiContextMinShots: 2,
  }
}
