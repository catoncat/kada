import type { ClientProfile } from '@/types/project-plan';

export function formatAge(age: number | null): string {
  if (!age || age <= 0) return '未知年龄';
  // 这里先按“岁”展示；后续如要支持“月龄”，可以再扩展。
  return `${age}岁`;
}

export function buildProjectTitle(client: ClientProfile): string {
  const age = formatAge(client.age);
  const gender = client.gender || '不限';
  return `${age}｜${gender}｜三套服装项目`;
}
