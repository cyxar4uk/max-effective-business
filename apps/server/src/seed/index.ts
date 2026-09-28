// Тестовые данные и справочник навыков (Тимур).
// Справочник грузится при каждом старте; демо-данные — при SEED_DEMO=true или командой npm run seed:demo.
export { SKILL_GROUPS, seedSkills, skillRows } from './skills.js';
export { TASK_TAGS, type TaskTag } from './tags.js';
export { seedDemo, type DemoSeedResult } from './demo/load.js';
export { registerDemoResponder, respondWithDemoStudents } from './demo/responder.js';
