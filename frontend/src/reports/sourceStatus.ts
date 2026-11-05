// Sources whose link was checked and found broken. The check is recorded here, not re-run on every page view.
// Root cause this addresses: report evidence URLs were shown as valid sources without any link status.
// To re-check, run the link manually and update this record with the date and result. No replacement URL is invented here.
export const KNOWN_BROKEN_SOURCES: Record<string, { checkedOn: string; result: string }> = {
  'https://play.google.com/store/apps/details?id=com.puzzlegames.puzzlebrickslegend': {
    checkedOn: '2026-11-05',
    result: 'HTTP 404, trang Google Play "Not Found"; không tìm thấy ứng dụng ở đường dẫn này.',
  },
  'https://play.google.com/store/apps/details?hl=en-US&id=com.dreamgames.royalmatch&listing=5ef402f0-859e-4c30-b814-eebb506808bc': {
    checkedOn: '2026-11-05',
    result: 'HTTP 404, trang Google Play "Not Found" (đường dẫn có tham số listing). Trang trợ giúp Royal Match vẫn mở được.',
  },
};

export function brokenSourceCheck(url: string): { checkedOn: string; result: string } | null {
  return KNOWN_BROKEN_SOURCES[url] ?? null;
}
