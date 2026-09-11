import type { Role } from './types';

export const ROLES: Record<number, Role[]> = {
  2: ['主公', '反贼'],
  3: ['主公', '反贼', '内奸'],
  4: ['主公', '忠臣', '反贼', '内奸'],
  5: ['主公', '忠臣', '反贼', '反贼', '内奸'],
  6: ['主公', '忠臣', '反贼', '反贼', '反贼', '内奸'],
  7: ['主公', '忠臣', '忠臣', '反贼', '反贼', '反贼', '内奸'],
  8: ['主公', '忠臣', '忠臣', '反贼', '反贼', '反贼', '反贼', '内奸'],
};

export function validRoles(roles: Role[], count: number) {
  return !!ROLES[count] && [...roles].sort().join() === [...ROLES[count]].sort().join();
}

export function randomRoles(count: number, random = Math.random): Role[] {
  const roles = [...ROLES[count]];
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}
