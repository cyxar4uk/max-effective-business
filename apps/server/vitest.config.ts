import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    // Сквозные тесты пересоздают схему одной тестовой БД — файлы по очереди
    fileParallelism: false,
  },
});
