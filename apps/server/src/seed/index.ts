// Тестовые данные и справочник навыков (Тимур).
// Справочник грузится при каждом старте; демо-данные — при SEED_DEMO=true или командой npm run seed:demo.
export { SKILL_GROUPS, seedSkills, skillRows } from './skills.js';
export { MAX_PLACE_TAGS, TASK_TAGS, tagsForSkills, type TaskTag } from './tags.js';
export { seedDemo, type DemoData, type DemoSeedResult } from './demo/load.js';
export { inviteForDemoEmployer, inviteRecentForDemoEmployers, registerDemoResponder, respondWithDemoStudents } from './demo/responder.js';
