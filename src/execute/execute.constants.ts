export const DATABASE_FUNCTIONS = {
  users: 'fnc_users',
  courses: 'fnc_courses',
  certificates: 'fnc_certificates',
} as const;

export type DatabaseFunctionKey = keyof typeof DATABASE_FUNCTIONS;
