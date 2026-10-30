import { describe, expect, it } from 'vitest';
import { displayEntityType } from './entityTypeLabels';

describe('displayEntityType', () => {
  it('maps known research entity kinds to clear Vietnamese labels', () => {
    expect(displayEntityType('mobile_game_genre')).toBe('Thể loại trò chơi di động');
    expect(displayEntityType('mobile_game_subgenre')).toBe('Thể loại trò chơi con');
    expect(displayEntityType('mobile_puzzle_game')).toBe('Trò chơi giải đố trên di động');
    expect(displayEntityType('research_subject')).toBe('Chủ thể nghiên cứu');
  });

  it('normalizes known spacing and hyphen aliases without changing source data', () => {
    const sourceType = 'mobile game genre';
    const label = displayEntityType(sourceType);
    expect(label).toBe('Thể loại trò chơi di động');
    expect(sourceType).toBe('mobile game genre');
    expect(displayEntityType('mobile-game-genre')).toBe('Thể loại trò chơi di động');
  });

  it('uses a neutral fallback for unknown and missing values', () => {
    expect(displayEntityType('alien_research_artifact')).toBe('Loại đối tượng khác');
    expect(displayEntityType('Unknown')).toBe('Chưa phân loại');
    expect(displayEntityType(null)).toBe('Chưa phân loại');
    expect(displayEntityType('')).toBe('Chưa phân loại');
  });
});
