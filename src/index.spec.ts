import { describe, expect, it } from 'vitest';
import * as index from './index';

describe('index', () => {
  it('should export initAddedDCLightExercises and initDataCampLight', () => {
    expect(index.initAddedDCLightExercises).toBeInstanceOf(Function);
    expect(index.initDataCampLight).toBeInstanceOf(Function);
    expect(index.bootElement).toBeInstanceOf(Function);
    expect(index.getSettings).toBeInstanceOf(Function);
  });
});
