const ENTITY_TYPE_LABELS: Record<string, string> = {
  app: 'Ứng dụng',
  audience: 'Nhóm người dùng',
  audience_segment: 'Phân khúc người dùng',
  benchmark_dimension: 'Khía cạnh so sánh',
  category: 'Danh mục',
  company: 'Công ty',
  competitor: 'Đối thủ cạnh tranh',
  concept: 'Khái niệm',
  dataset: 'Bộ dữ liệu',
  developer: 'Nhà phát triển',
  feature: 'Tính năng',
  game: 'Trò chơi',
  genre: 'Thể loại',
  location: 'Địa điểm',
  market: 'Thị trường',
  mechanic: 'Cơ chế',
  metric: 'Chỉ số',
  mobile_app: 'Ứng dụng di động',
  mobile_game_genre: 'Thể loại trò chơi di động',
  mobile_game_subgenre: 'Thể loại trò chơi con',
  mobile_puzzle_game: 'Trò chơi giải đố trên di động',
  organization: 'Tổ chức',
  person: 'Cá nhân',
  place: 'Địa điểm',
  platform: 'Nền tảng',
  product: 'Sản phẩm',
  publisher: 'Nhà phát hành',
  research_subject: 'Chủ thể nghiên cứu',
  service: 'Dịch vụ',
  software: 'Phần mềm',
  subgenre: 'Thể loại phụ',
  technology: 'Công nghệ',
};

/** Display a PO-friendly label without changing the source entity_type value. */
export function displayEntityType(entityType: string | null | undefined): string {
  const normalized = entityType?.trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized || normalized === 'unknown' || normalized === 'not_specified') return 'Chưa phân loại';
  return ENTITY_TYPE_LABELS[normalized] ?? 'Loại đối tượng khác';
}
