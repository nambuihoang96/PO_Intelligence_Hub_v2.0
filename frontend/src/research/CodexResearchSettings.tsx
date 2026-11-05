import { useCallback, useEffect, useState } from 'react';
import { reportApi, type CodexResearchModels } from '../reports/api';

const STORAGE_KEY = 'po-hub.codex-research-settings.v1';

export type CodexResearchPreferences = { enabled: boolean; model_slug: string };
const initialPreferences: CodexResearchPreferences = { enabled: true, model_slug: '' };

function readPreferences(): CodexResearchPreferences {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialPreferences;
    const parsed = JSON.parse(saved) as Partial<CodexResearchPreferences>;
    return { enabled: parsed.enabled !== false, model_slug: typeof parsed.model_slug === 'string' ? parsed.model_slug : '' };
  } catch { return initialPreferences; }
}

export function useCodexResearchSettings(enabled = true) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [catalog, setCatalog] = useState<CodexResearchModels>({ available: false, models: [], recommended_model_slug: null, message: 'Đang kiểm tra Codex CLI…' });
  const [loadingModels, setLoadingModels] = useState(true);

  useEffect(() => {
    if (!enabled || !preferences.enabled) {
      setLoadingModels(false);
      setCatalog((current) => current.message === 'Đang kiểm tra Codex CLI…' ? { ...current, message: null } : current);
      return;
    }
    setLoadingModels(true);
    let mounted = true;
    void reportApi.codexModels().then((result) => {
      if (!mounted) return;
      if (!result || typeof result.available !== 'boolean' || !Array.isArray(result.models)) {
        setCatalog({ available: false, models: [], recommended_model_slug: null, message: 'Không đọc được danh sách model Codex từ backend đang chạy.' });
        return;
      }
      setCatalog(result);
      setPreferences((current) => {
        const stillAvailable = result.models.some((model) => model.slug === current.model_slug);
        const selected = stillAvailable ? current.model_slug : result.recommended_model_slug ?? '';
        return { ...current, model_slug: selected };
      });
    }).catch((reason: unknown) => {
      if (mounted) setCatalog({ available: false, models: [], recommended_model_slug: null, message: reason instanceof Error ? reason.message : 'Không kiểm tra được Codex CLI.' });
    }).finally(() => { if (mounted) setLoadingModels(false); });
    return () => { mounted = false; };
  }, [enabled, preferences.enabled]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Preferences remain usable for this page session. */ }
  }, [preferences]);

  const update = useCallback((changes: Partial<CodexResearchPreferences>) => {
    setPreferences((current) => ({ ...current, ...changes }));
  }, []);

  return { preferences, update, catalog, loadingModels };
}

export type CodexResearchControls = ReturnType<typeof useCodexResearchSettings>;

export function CodexResearchSettings({ preferences, update, catalog, loadingModels, purpose = 'question' }: {
  preferences: CodexResearchPreferences;
  update: (changes: Partial<CodexResearchPreferences>) => void;
  catalog: CodexResearchModels;
  loadingModels: boolean;
  purpose?: 'question' | 'workspace';
}) {
  return <section className="codex-research-settings" aria-label="Tự động hóa nghiên cứu">
    <label className="codex-research-settings__toggle"><input type="checkbox" checked={preferences.enabled} onChange={(event) => update({ enabled: event.target.checked })} /><span><strong>{purpose === 'workspace' ? 'Cho phép dùng Codex trong PO Hub' : 'Gửi câu hỏi bằng Codex khi nhấn Enter'}</strong><small>{purpose === 'workspace' ? 'Câu hỏi nghiên cứu chạy khi nhấn Enter; phân tích hồ sơ sản phẩm chỉ chạy khi anh bấm nút. Mỗi lần gửi dùng hạn mức Codex.' : 'Mỗi lần gửi dùng hạn mức Codex. Shift+Enter để xuống dòng; kết quả hiện ra để anh xem trước khi lưu.'}</small></span></label>
    <label className="codex-research-settings__model"><span>Model trả lời</span><select aria-label="Model trả lời" value={preferences.model_slug} disabled={loadingModels || !catalog.available} onChange={(event) => update({ model_slug: event.target.value })}>
      <option value="">{loadingModels ? 'Đang tải model…' : catalog.available ? 'Chọn model' : 'Codex CLI chưa sẵn sàng'}</option>
      {catalog.models.map((model) => <option value={model.slug} key={model.slug}>{model.display_name}{model.recommended_for_testing ? ' · gợi ý nhẹ khi thử' : model.is_default ? ' · mặc định' : ''}</option>)}
    </select></label>
    {catalog.message && <small className="codex-research-settings__status" role="status">{catalog.message}</small>}
    {preferences.enabled && !loadingModels && !catalog.available && <small className="codex-research-settings__error" role="alert">Tắt tự chạy hoặc mở lại PO Hub sau khi Codex CLI đăng nhập.</small>}
    {preferences.enabled && catalog.available && !preferences.model_slug && <small className="codex-research-settings__error" role="alert">Chọn model trước khi gửi để tránh chạy nhầm model.</small>}
  </section>;
}
