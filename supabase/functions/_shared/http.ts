export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });

export const readJson = async <T>(req: Request): Promise<T> => {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
};

export const userIdFromContext = (ctx: {
  userClaims?: { sub?: string; id?: string } | null;
}) => {
  const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
  if (!userId) {
    throw new Error('Missing authenticated user id.');
  }
  return userId;
};
