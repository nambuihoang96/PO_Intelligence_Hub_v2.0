// Names the assistant behind a report, from the stored source_assistant value.
// Reports saved before the field existed keep working: a ChatGPT-origin report with no value is named as such.
export function assistantName(report: { origin: string; source_assistant?: string | null }): string {
  if (report.origin === 'codex_cli_research' || report.source_assistant === 'codex') return 'Codex';
  if (report.source_assistant === 'claude') return 'Claude';
  if (report.source_assistant === 'chatgpt') return 'ChatGPT';
  if (report.source_assistant === 'other') return 'trợ lý khác';
  return 'ChatGPT (cũ)';
}
